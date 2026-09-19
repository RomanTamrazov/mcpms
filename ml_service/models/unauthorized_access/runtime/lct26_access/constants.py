"""Shared domain constants.

The source data has no dispatcher-confirmed `real intrusion` label.  We therefore
use a deliberately narrow and auditable proxy: a SCADA alarm from the security
subsystem whose physical state is either movement detected or a contact opened.
Technical alarms remain features and are never silently relabelled as intrusions.
"""

from __future__ import annotations

HORIZON_HOURS = 24
SECURITY_SYSTEM = "Охранная подсистема"
GUARD_STATE_SENSOR = "Состояние охраны"

INTRUSION_VALUES = frozenset({"Обнаружено движение", "Не замкнут"})
TECHNICAL_ALARM_VALUES = frozenset({"Неисправен", "Отключено устройство"})

SENSOR_SLUGS = {
    "Датчик движения": "motion",
    "КД АВ": "av_contact",
    "КД Дверь": "door",
    "КД Люк": "hatch",
    "Стекло": "glass",
    "9-секционный люк": "nine_hatch",
}

SYSTEM_SLUGS = {
    "Пожарная охрана": "fire",
    "Газовая охрана": "gas",
    "Диспетчерский контроль": "dispatch",
    "Температурная подсистема": "temperature",
    "Диагностическая подсистема": "diagnostic",
    SECURITY_SYSTEM: "security",
}

CONTEXT_SENSOR_SLUGS = {
    "Состояние фазы": "phase",
    "Переключатель": "switch",
    "Состояние вентилятора": "fan",
    "Состояние насоса": "pump",
    GUARD_STATE_SENSOR: "guard_state",
    "Датчик затопления": "flood",
    "Датчик дыма": "smoke",
    "Тепловой датчик": "heat",
    "Ручной извещатель": "manual_fire",
    "Газовый датчик": "gas_sensor",
    "Датчик температуры": "temp_sensor",
    "ИБП": "ups",
}

JOURNAL_COLUMNS = (
    "ид_события",
    "ид_канала_данных",
    "дата",
    "время",
    "тревожное",
    "значение_датчика",
)

TEMPORAL_FOLDS = (
    ("2024", "2024-01-01", "2025-01-01"),
    ("2025", "2025-01-01", "2026-01-01"),
    ("2026H1", "2026-01-01", "2026-07-01"),
)

