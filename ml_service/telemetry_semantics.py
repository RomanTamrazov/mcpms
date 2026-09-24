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


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Inspect the supplied telemetry state catalogue")
    parser.add_argument("--state-catalog", type=Path, required=True)
    parser.add_argument("--sensor-type", default=GAS_SENSOR_TYPE)
    parser.add_argument("--value", default="1.00")
    args = parser.parse_args()
    catalog = StateCatalog.from_csv(args.state_catalog)
    result = normalize_sensor_value(args.sensor_type, args.value, catalog)
    print(json.dumps({"catalog": catalog.audit(), "value": asdict(result)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
