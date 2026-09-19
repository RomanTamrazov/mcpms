# Проверка переобучения и устойчивости

Модели: incident_lgbm + critical_incident_lgbm: tail-train (2022+), cost-sensitive (scale_pos_weight=60/80, boost_from_average=False, reg 1.0/6.0), recall-oriented threshold (max precision at VAL recall >= 0.90)

## Incident (24ч)

| Набор | ROC-AUC | PR-AUC | P/R @порог |
|---|---:|---:|---:|
| train (in-sample) | 0.968 | - | - |
| VAL | 0.917 | 0.448 | 0.149/0.9 |
| TEST 2026 | 0.866 | 0.362 | 0.125/0.843 |

## Critical (24ч)

| Набор | ROC-AUC | PR-AUC | P/R @порог |
|---|---:|---:|---:|
| VAL | 0.931 | 0.384 | 0.152/0.9 |
| TEST 2026 | 0.923 | 0.389 | 0.137/0.884 |

## Per-family (TEST, incident model)

| Семейство | N | ROC-AUC | Recall |
|---|---:|---:|---:|
| flood | 12519 | 0.756 | 1.0 |
| intrusion | 6837 | 0.935 | 0.943 |
| temperature | 1889 | 0.899 | 0.907 |
| fire | 11794 | 0.758 | 0.804 |
| equipment | 10546 | 0.791 | 0.707 |
| gas | 4717 | 0.885 | 0.653 |

## Вывод

tail-train (2022+) + cost-sensitive spw 60/80 + recall-порог (max P при VAL R>=0.90) дают incident TEST R=0.843 (пропущено ~16%), critical TEST R=0.884 (пропущено ~12%). ТЗ «Precision>0.7 И Recall>0.5 за 24ч» на полной выборке физически недостижимо (лучший R при P>=0.7 ~0.08 на TEST-2026); единственная достижимая категория — «канал в активной тревоге» (has_alarm==1, n_alarms>=3), где на тех же глобальных моделях ТЗ выполнено с запасом: incident TEST P=0.808/R=0.609, critical TEST P=0.806/R=0.585, пороги 0.9685/0.9372 (precision-first, P>=0.8), нижняя граница CI-P 0.796/0.791 (см. tz_category_report.json).
