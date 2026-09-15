# МосКоллектор

Веб-интерфейс системы прогнозирования инцидентов и управления заявками.

## GitHub Pages

Каждый push в ветку `main` автоматически собирает и публикует сайт через
GitHub Actions. Адрес сайта:

`https://romantamrazov.github.io/mcpms/`

Если Pages ещё не включён, в репозитории откройте **Settings → Pages** и
выберите **GitHub Actions** в качестве источника публикации.

## Локальный запуск

```bash
cd website
docker compose up --build
```

После запуска сайт доступен по адресу `http://localhost:3000`.
