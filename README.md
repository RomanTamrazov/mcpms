# МосКоллектор

Демонстрационный веб-интерфейс ситуационного центра: схема инженерных коллекторов, прогнозы, решения диспетчеров, журнал, оборудование и заявки на работы.

## Быстрый запуск сайта и ML API

```bash
cd website
docker compose up --build
```

Сайт откроется по адресу `http://localhost:3000`. ML API откроется по адресу
`http://localhost:8000`, документация Swagger — `http://localhost:8000/docs`.

Без Docker сайт и сервис запускаются в двух терминалах:

```bash
cd website
npm ci
npm run dev
```

```bash
cd ml_service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

## Подключённые модели

Каждая классификация находится в отдельной папке `ml_service/models/`.

| ID | Состояние | Папка |
| --- | --- | --- |
| `fire_risk` | подключена | `models/fire_risk/` |
| `infrastructure_wear` | подключена | `models/infrastructure_wear/` |
| `unauthorized_access` | подключена | `models/unauthorized_access/` |
| `model_4` | ожидает пакет | `models/model_4/` |

`fire_risk` — ансамбль из шести CatBoost-моделей. Он оценивает риск **нового
срабатывания дымового датчика**, а не подтверждённую вероятность пожара. Горизонт
равен 336 часам. Зафиксированные метрики на тесте 2026 H1: Precision 0,784 и
Recall 0,604. Подробности и ограничения находятся в
[`ml_service/models/fire_risk/README.md`](ml_service/models/fire_risk/README.md).

`infrastructure_wear` использует `maintenance_lgbm.joblib` из пакета `FOR_ALL`.
Модель оценивает метку `y_repair_7d` для канала на горизонте 168 часов. Метрики
из артефакта на тесте 2026: Precision 0,759, Recall 0,744, PR-AUC 0,839. Способ
подтверждения `y_repair_7d` фактическими ремонтами в исходном пакете не описан,
поэтому результат публикуется как прокси-скор необходимости обслуживания.

`unauthorized_access` — ансамбль из трёх LightGBM-моделей объекта и двух
LightGBM-моделей ранжирования зон. Цель — физическая охранная SCADA-тревога на
следующий календарный день, а не подтверждённое вторжение. Режим
`safety_margin_70_50`, выбранный на 2024–2025, на замороженном 2026H1 дал
Precision 0,733 и Recall 0,543. Весь batch из 30 объектов и 1 031 зоны занимает
около 2,19 с в среднем.

| Проверка минимального требования | `fire_risk` | `infrastructure_wear` | `unauthorized_access` |
| --- | ---: | ---: | ---: |
| Precision > 0,7 | 0,784 | 0,759 | 0,733 |
| Recall > 0,5 | 0,604 | 0,744 | 0,543 |
| Горизонт ≥ 24 ч | 336 ч | 168 ч | 24 ч |
| Формирование прогноза < 5 мин | миллисекунды | миллисекунды | ~2,19 с на batch |

Это метрики сохранённых временных тестов из пакетов моделей. Для
`infrastructure_wear` исходная разметка остаётся прокси-целью, так как пакет не
содержит документированного сопоставления с подтверждёнными ремонтами.
Полная проверка требований и границы применимости сведены в
[`COMPLIANCE.md`](COMPLIANCE.md).

Пример запуска исторического контрольного примера `fire_risk` приведён в
папке модели. В рабочем режиме API требует текущую московскую дату. Для
воспроизведения архивного теста сервис можно отдельно запустить с
`ML_ALLOW_HISTORICAL_SCORING=1`:

```bash
curl -X POST http://localhost:8000/api/v1/models/fire_risk/predict \
  -H 'Content-Type: application/json' \
  --data-binary @ml_service/models/fire_risk/example_alert_input.json
```

Встроенный срез признаков модели износа заканчивается `2026-06-30 23:00:00` и
служит только для воспроизводимой проверки. Рабочий API отклоняет его как
устаревший. Для текущего прогноза нужно передать точный словарь 33 признаков с
актуальным `features_as_of` по следующей схеме:

```json
{
  "payload": {
    "channel_id": 330565,
    "features_as_of": "текущее время ISO-8601",
    "features": "точный словарь 33 признаков"
  },
  "display": {
    "object_name": "Название объекта",
    "district": "ЮАО"
  }
}
```

Формат и ограничения описаны в
`ml_service/models/infrastructure_wear/README.md`. По умолчанию допустимый
возраст признаков — 24 часа. Все подключённые модели проверяют дату прогноза и
не публикуют старый тестовый срез как текущий результат.

Для `unauthorized_access` нужно положить актуальные
`daily_site_features.parquet`, `daily_family_context.parquet` и
`daily_zone_features.parquet` в `ml_service/live_features/`. Запрос требует
`as_of`, совпадающую с текущей московской датой; при отсутствии этой даты в
витринах модель возвращает ошибку и не использует архивный пример. Команда
подготовки витрин и контракт запроса описаны в
[`ml_service/models/unauthorized_access/README.md`](ml_service/models/unauthorized_access/README.md).

Результат сохраняется в ленте `GET /api/v1/predictions`. Сайт опрашивает её
каждые 30 секунд и показывает реальные карточки, если они есть. Пока API
недоступен или лента пуста, интерфейс сохраняет исходные демонстрационные
карточки. Поля `display.object_name`, `display.district`, `display.system` и
`display.picket` можно передать вместе с `payload`, чтобы обогатить карточку.
Для отдельного deployment адрес сервиса задаётся при сборке переменной
`VITE_ML_API_URL`, а разрешённые источники сервиса — `ML_CORS_ORIGINS`.
Полные `meta` и `features` приведены в `example_input.json`. Файл
`example_alert_input.json` — строка из временного тестового периода с оценкой
выше рабочего порога, предназначенная для проверки интеграции. Список и
состояние трёх подключённых моделей и одного резервного слота доступны через
`GET /api/v1/models`.

## Демо-роли

На странице входа есть кнопки быстрого заполнения каждой роли. Общий пароль пользовательских демо-аккаунтов: `monitoring2026`.

| Роль | Логин | Область доступа |
| --- | --- | --- |
| Диспетчер ОДС | `dispatcher@moscollector.ru` | Все округа |
| Районный диспетчер | `south@moscollector.ru` | ЮАО |
| Технический специалист | `tech@moscollector.ru` | ЮАО, оборудование и заявки |
| Администратор | `admin@moscollector.ru` | Пользователи и настройки |

## Что реализовано

- адаптивный интерфейс и светлая/тёмная темы;
- ролевая навигация и области доступа;
- линейная схема коллекторов с пикетами и инженерными системами;
- объяснимая карточка прогноза и связанные сигналы;
- захват прогноза диспетчером и защита от конфликтующей обработки;
- решения со справочником оснований и комментариями;
- автоматическое создание заявки при направлении бригады;
- история статусов и результат выполнения заявки;
- журнал действий диспетчеров;
- импорт реестра CSV/XLSX и экспорт CSV/GeoJSON;
- панель состояния интеграций и административные настройки;
- управление пользователями, ролями, подразделениями и блокировкой аккаунтов.

## Публикация в GitHub

Репозиторий уже содержит `.gitignore`, `.gitattributes` и workflow GitHub
Pages. Для нового публичного репозитория через GitHub CLI:

```bash
cd "/Users/roman/VScode/hft/mcpms-main"
git init
git branch -M main
git add .
git commit -m "Prepare MosCollector ML platform"
gh auth login
gh repo create mcpms --public --source=. --remote=origin --push
```

Если пустой репозиторий уже создан на GitHub:

```bash
cd "/Users/roman/VScode/hft/mcpms-main"
git init
git branch -M main
git add .
git commit -m "Prepare MosCollector ML platform"
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

### GitHub Pages

Каждый push в `main` собирает и публикует статическую демо-версию:

`https://USERNAME.github.io/REPOSITORY/`

Путь публикации определяется из имени репозитория автоматически. GitHub Pages
размещает только статический frontend: Python ML API и модели на Pages не
запускаются. Для карточек реальных прогнозов API нужно развернуть отдельно и
при сборке frontend задать `VITE_ML_API_URL`. Аккаунты, журнал и заявки в
статическом демо сохраняются в браузере. Для общего многопользовательского
контура нужны backend, PostgreSQL и корпоративная аутентификация.

Контракт для подключения backend и ML-команды описан в [website/ML_API_CONTRACT.md](website/ML_API_CONTRACT.md).
