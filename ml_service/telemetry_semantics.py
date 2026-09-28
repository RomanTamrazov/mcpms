"""Normalize raw telemetry without confusing a device state with a measurement.

The organiser confirmed that the supplied state catalogue joins by
``тип_датчика``. A sensor type can contain several state sets, so a unique
``тип_датчика``/state pair is interpreted from the catalogue, while a
conflicting pair remains explicit ambiguity.
"""

from __future__ import annotations

import csv
import json
import math
import re
from dataclasses import asdict, dataclass
from pathlib import Path


GAS_SENSOR_TYPE = "Газовый датчик"
METHANE_ALERT_PERCENT = 1.0
METHANE_FLAMMABILITY_REFERENCE_PERCENT = (5.0, 15.0)
EPOCH_FAULT_VALUES = frozenset(
    {"01.01.1970 03:00:00", "01.01.1970 03:00:01"}
)
TECHNICAL_STATES = frozenset(
    {
        "неопределен",
        "не определено",
        "неисправен",
        "обесточен",
        "отключено устройство",
    }
)

# A journal alarm is a signal that needs verification, not a dispatcher-confirmed
# incident. The groups below are the organiser's operational taxonomy.
EMERGENCY_GROUPS = frozenset({"fire", "flood", "gas", "intrusion", "temperature"})
CHANNEL_TERMS = {
    "РО": "рабочее освещение",
    "АО": "аварийное освещение",
    "ФРО": "фидер рабочего освещения",
    "ФАО": "фидер аварийного освещения",
    "ГРО": "группа рабочего освещения",
    "ФВ": "фидер вентиляции",
    "В23": "вентилятор",
    "ФАНС": "фидер автоматической насосной станции",
    "ОЗК": "огнезадерживающий клапан",
    "ЩАП": "щит аварийного питания с АВР",
    "ФТС": "фидер теплосети",
    "ПУИ": "пульт управления и индикации",
}


@dataclass(frozen=True)
class StateResolution:
    state_set_ids: tuple[int, ...]
    expected_alarm: bool | None
    ambiguous: bool


class StateCatalog:
    """The supplied ``тип_датчика``/state catalogue, preserving ambiguity."""

    def __init__(self, entries: dict[tuple[str, str], list[tuple[int, bool]]]) -> None:
        self._entries = entries

    @classmethod
    def from_csv(cls, path: str | Path) -> "StateCatalog":
        entries: dict[tuple[str, str], list[tuple[int, bool]]] = {}
        with Path(path).open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            required = {
                "тип_датчика",
                "ид_набор_состояний",
                "название_состояния",
                "тревожное",
            }
            if reader.fieldnames is None or not required.issubset(reader.fieldnames):
                raise ValueError(
                    "state catalog must contain: "
                    "тип_датчика, ид_набор_состояний, название_состояния, тревожное"
                )
            for row in reader:
                sensor_type = (row["тип_датчика"] or "").strip()
                state = (row["название_состояния"] or "").strip()
                if not sensor_type or not state:
                    continue
                raw_alarm = (row["тревожное"] or "").strip().lower()
                if raw_alarm not in {"true", "false"}:
                    raise ValueError(f"invalid тревожное value: {raw_alarm!r}")
                key = (sensor_type, state)
                entries.setdefault(key, []).append(
                    (int(row["ид_набор_состояний"]), raw_alarm == "true")
                )
        return cls(entries)

    def resolve(self, sensor_type: str, state: str) -> StateResolution:
        entries = self._entries.get((sensor_type.strip(), state.strip()), [])
        state_set_ids = tuple(sorted({state_set for state_set, _ in entries}))
        labels = {alarm for _, alarm in entries}
        return StateResolution(
            state_set_ids=state_set_ids,
            expected_alarm=next(iter(labels)) if len(labels) == 1 else None,
            ambiguous=len(labels) > 1,
        )

    def audit(self) -> dict[str, int]:
        ambiguous_pairs = sum(
            len({alarm for _, alarm in entries}) > 1
            for entries in self._entries.values()
        )
        return {
            "sensor_state_pairs": len(self._entries),
            "ambiguous_sensor_state_pairs": ambiguous_pairs,
        }


@dataclass(frozen=True)
class NormalizedValue:
    raw_value: str
    kind: str
    quality: str
    reason: str
    numeric_value: float | None = None
    unit: str | None = None
    threshold: float | None = None
    catalog_expected_alarm: bool | None = None
    catalog_state_set_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class ChannelContext:
    """Explain published channel-name abbreviations without inventing topology."""

    channel_name: str
    terms: tuple[str, ...] = ()
    supplied_load: str | None = None
    picket: int | None = None
    supply_source: str | None = None


@dataclass(frozen=True)
class EventTriage:
    """Operational routing for one message; never confirms an incident."""

    alarm_message: bool | None
    catalog_alarm_message: bool | None
    source_conflict: bool
    classification: str
    emergency_group: str | None
    requires_dispatcher_verification: bool
    incident_status: str
    channel_context: ChannelContext | None = None


def _parse_number(raw_value: str) -> float | None:
    candidate = raw_value.replace(",", ".")
    try:
        value = float(candidate)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def normalize_sensor_value(
    sensor_type: str,
    raw_value: object,
    state_catalog: StateCatalog | None = None,
) -> NormalizedValue:
    """Classify a raw journal value using only published organiser rules.

    For a unique ``тип_датчика``/state pair, ``catalog_expected_alarm`` is the
    organiser-defined interpretation. The source ``тревожное`` value remains
    available for audit; conflicting and unknown pairs are never guessed.
    """

    raw = "" if raw_value is None else str(raw_value).strip()
    if raw in EPOCH_FAULT_VALUES:
        return NormalizedValue(raw, "fault", "invalid", "epoch_timestamp_fault")

    numeric = _parse_number(raw)
    if numeric is not None:
        if sensor_type == GAS_SENSOR_TYPE:
            if numeric < 0 or numeric > 100:
                return NormalizedValue(
                    raw,
                    "fault",
                    "invalid",
                    "gas_percent_out_of_physical_range",
                    numeric_value=numeric,
                    unit="% CH₄ (объёмная доля)",
                    threshold=METHANE_ALERT_PERCENT,
                )
            return NormalizedValue(
                raw,
                "measurement",
                "valid",
                "gas_alert_threshold" if numeric >= METHANE_ALERT_PERCENT else "numeric_measurement",
                numeric_value=numeric,
                unit="% CH₄ (объёмная доля)",
                threshold=METHANE_ALERT_PERCENT,
            )
        return NormalizedValue(
            raw,
            "measurement",
            "valid",
            "numeric_measurement",
            numeric_value=numeric,
        )

    resolution = state_catalog.resolve(sensor_type, raw) if state_catalog else StateResolution((), None, False)
    if raw.casefold() in TECHNICAL_STATES:
        return NormalizedValue(
            raw,
            "state",
            "not_measurement",
            "technical_state",
            catalog_expected_alarm=resolution.expected_alarm,
            catalog_state_set_ids=resolution.state_set_ids,
        )
    if resolution.ambiguous:
        return NormalizedValue(
            raw,
            "state",
            "ambiguous",
            "state_catalog_conflict",
            catalog_state_set_ids=resolution.state_set_ids,
        )
    if resolution.state_set_ids:
        return NormalizedValue(
            raw,
            "state",
            "not_measurement",
            "catalog_state",
            catalog_expected_alarm=resolution.expected_alarm,
            catalog_state_set_ids=resolution.state_set_ids,
        )
    return NormalizedValue(raw, "state", "unknown", "unmapped_text_state")


def _normalize_alarm_message(value: object | None) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    raise ValueError("alarm_message must be boolean when provided")


def interpret_channel_name(channel_name: object | None) -> ChannelContext | None:
    """Extract only the organiser-confirmed meaning of a channel name.

    A parenthesised value identifies what a feeder powers. The source feeding
    that feeder is explicitly unavailable in the supplied data, and picket
    spacing is not inferred because it can differ by collector.
    """

    if channel_name is None or not str(channel_name).strip():
        return None
    raw = str(channel_name).strip()
    terms: list[str] = []
    upper = raw.upper()
    for abbreviation, meaning in CHANNEL_TERMS.items():
        if re.search(rf"(?<![А-ЯA-Z0-9]){re.escape(abbreviation)}(?:\d+)?(?![А-ЯA-Z])", upper):
            terms.append(f"{abbreviation}: {meaning}")
    if "МЕЖСЕКЦИОН" in upper:
        terms.append("Межсекционный: секционный автомат между вводами")
    parenthetical = re.search(r"\(([^()]+)\)", raw)
    picket = re.search(r"\bПК\s*(\d+)\b", upper)
    return ChannelContext(
        channel_name=raw,
        terms=tuple(terms),
        supplied_load=parenthetical.group(1).strip() if parenthetical else None,
        picket=int(picket.group(1)) if picket else None,
        supply_source="not_specified_in_source",
    )


def _emergency_group(sensor_type: str, normalized: NormalizedValue) -> str | None:
    sensor = sensor_type.casefold()
    state = normalized.raw_value.casefold()

    if normalized.numeric_value is not None and sensor_type == GAS_SENSOR_TYPE:
        return "gas" if normalized.numeric_value >= METHANE_ALERT_PERCENT else None
    if state == "обнаружен газ":
        return "gas"
    if state == "обнаружен дым" or "рычаг сдернут" in state:
        return "fire"
    if state == "не замкнут" and ("теплов" in sensor or "ручн" in sensor):
        return "fire"
    if state == "затоплен" and ("насос" in sensor or "насосн" in sensor):
        return "flood"
    if state == "не замкнут" and "затоплен" in sensor:
        return "flood"
    if (
        state in {"обнаружено движение", "движение вверх", "движение вниз", "движение влево", "движение вправо"}
        or (state == "не замкнут" and any(token in sensor for token in ("двер", "люк", "движ", "ав")))
    ):
        return "intrusion"
    if state.startswith("температура выше") or state.startswith("температура ниже"):
        return "temperature"
    return None


def triage_telemetry_event(
    sensor_type: str,
    raw_value: object,
    state_catalog: StateCatalog | None = None,
    *,
    alarm_message: object | None = None,
    channel_name: object | None = None,
) -> EventTriage:
    """Route a journal message without claiming it is a confirmed incident.

    ``alarm_message`` is the source ``тревожное`` flag when present. It takes
    precedence over a catalogue-derived value, while any disagreement remains
    visible as ``source_conflict`` for a dispatcher to check.
    """

    source_alarm = _normalize_alarm_message(alarm_message)
    normalized = normalize_sensor_value(sensor_type, raw_value, state_catalog)
    inferred_alarm = normalized.catalog_expected_alarm
    if inferred_alarm is None and normalized.numeric_value is not None and sensor_type == GAS_SENSOR_TYPE:
        inferred_alarm = normalized.numeric_value >= METHANE_ALERT_PERCENT
    source_conflict = (
        source_alarm is not None
        and inferred_alarm is not None
        and source_alarm != inferred_alarm
    )
    effective_alarm = source_alarm if source_alarm is not None else inferred_alarm
    group = _emergency_group(sensor_type, normalized)
    technical = normalized.kind == "fault" or normalized.reason == "technical_state"

    if source_conflict:
        classification = "requires_verification"
    elif group in EMERGENCY_GROUPS and effective_alarm is not False:
        classification = "emergency_signal"
    elif technical:
        classification = "technical_signal"
    elif effective_alarm:
        classification = "alarm_message"
    else:
        classification = "normal"

    needs_check = classification != "normal"
    return EventTriage(
        alarm_message=effective_alarm,
        catalog_alarm_message=normalized.catalog_expected_alarm,
        source_conflict=source_conflict,
        classification=classification,
        emergency_group=group,
        requires_dispatcher_verification=needs_check,
        incident_status="not_confirmed" if needs_check else "not_applicable",
        channel_context=interpret_channel_name(channel_name),
    )


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Inspect the supplied telemetry state catalogue")
    parser.add_argument("--state-catalog", type=Path, required=True)
    parser.add_argument("--sensor-type", default=GAS_SENSOR_TYPE)
    parser.add_argument("--value", default="1.00")
    args = parser.parse_args()
    catalog = StateCatalog.from_csv(args.state_catalog)
    result = normalize_sensor_value(args.sensor_type, args.value, catalog)
    triage = triage_telemetry_event(args.sensor_type, args.value, catalog)
    print(
        json.dumps(
            {"catalog": catalog.audit(), "value": asdict(result), "triage": asdict(triage)},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
