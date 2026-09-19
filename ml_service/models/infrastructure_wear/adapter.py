from __future__ import annotations

import hashlib
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import joblib
import pandas as pd


HERE = Path(__file__).resolve().parent
MOSCOW_TZ = timezone(timedelta(hours=3))
MODEL_PATH = HERE / "model" / "maintenance_lgbm.joblib"
TABLE_PATH = HERE / "data" / "latest_table.parquet"
MODEL_VERSION = "infrastructure_wear_7d_lgbm_v1"

FEATURE_LABELS = {
    "object_key": "Объект",
    "month": "Месяц наблюдения",
    "sensor_type": "Тип датчика",
    "obj_events_prev": "События объекта за прошлое окно",
    "obj_n_channels": "Количество каналов объекта",
    "events_prev": "Предыдущая активность канала",
    "text_prev": "Текстовые состояния канала",
    "vmax_prev": "Максимум значения в прошлом окне",
    "alarms_prev_24obs": "Тревоги в предыдущих 24 наблюдениях",
    "vstd_prev": "Разброс значения в прошлом окне",
}


def _json_value(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def _display_value(name: str, value: Any) -> str:
    value = _json_value(value)
    if value is None:
        return "нет данных"
    if name == "month":
        return str(int(value))
    if isinstance(value, float):
        return f"{value:.3g}"
    return str(value)


class InfrastructureWearAdapter:
    model_id = "infrastructure_wear"
    display_name = "Износ инфраструктуры"

    def __init__(self) -> None:
        artifact = joblib.load(MODEL_PATH)
        self.model = artifact["model"]
        self.threshold = float(artifact["threshold"])
        self.horizon_hours = int(artifact["horizon_hours"])
        self.metadata = artifact["metadata"]
        self.max_feature_age_hours = float(os.getenv("ML_MAX_FEATURE_AGE_HOURS", "24"))
        self.allow_historical = os.getenv("ML_ALLOW_HISTORICAL_SCORING", "0") == "1"
        self.features = list(self.metadata["feature_cols"])
        self.categorical = list(self.metadata["cat_cols"])
        forbidden = {"y_alarm_24h", "y_family_24h", "y_repair_7d"}
        if forbidden.intersection(self.features):
            raise ValueError("target leakage columns are present in the model feature list")

        table = pd.read_parquet(TABLE_PATH)
        required = {"channel_id", "hour", *self.features}
        missing = sorted(required - set(table.columns))
        if missing:
            raise ValueError(f"latest feature table is missing columns: {missing}")
        if table["channel_id"].duplicated().any():
            raise ValueError("latest feature table must contain one row per channel")
        self.snapshot_min = pd.Timestamp(table["hour"].min()).isoformat()
        self.snapshot_max = pd.Timestamp(table["hour"].max()).isoformat()
        self.table = table.set_index("channel_id", drop=False)

        raw_importance = {
            name: float(value)
            for name, value in zip(self.features, self.model.feature_importances_)
        }
        total = sum(raw_importance.values()) or 1.0
        self.importance = {
            name: value / total for name, value in raw_importance.items()
        }

    def describe(self) -> dict[str, Any]:
        test = self.metadata["test_metrics"]
        return {
            "id": self.model_id,
            "display_name": self.display_name,
            "status": "ready",
            "model_version": MODEL_VERSION,
            "horizon_hours": self.horizon_hours,
            "target": self.metadata["target"],
            "target_is_proxy": True,
            "test_precision": test["precision"],
            "test_recall": test["recall"],
            "input_mode": "fresh exact 33-feature payload; bundled channel lookup is historical only",
            "bundled_snapshot_min": self.snapshot_min,
            "bundled_snapshot_max": self.snapshot_max,
            "production_note": "refresh or recalculate features before live scoring",
            "max_feature_age_hours": self.max_feature_age_hours,
            "historical_scoring_enabled": self.allow_historical,
        }

    def _validate_freshness(self, value: Any) -> pd.Timestamp:
        if value in (None, ""):
            raise ValueError("features_as_of is required for current scoring")
        timestamp = pd.Timestamp(value)
        if pd.isna(timestamp):
            raise ValueError("features_as_of is not a valid timestamp")
        if timestamp.tz is None:
            timestamp = timestamp.tz_localize(MOSCOW_TZ)
        else:
            timestamp = timestamp.tz_convert(MOSCOW_TZ)
        now = pd.Timestamp.now(tz=MOSCOW_TZ)
        age_hours = (now - timestamp).total_seconds() / 3600
        if age_hours < -1:
            raise ValueError("features_as_of cannot be in the future")
        if age_hours > self.max_feature_age_hours and not self.allow_historical:
            raise ValueError(
                f"stale features: age {age_hours:.1f}h exceeds "
                f"ML_MAX_FEATURE_AGE_HOURS={self.max_feature_age_hours:g}; "
                "send freshly calculated features"
            )
        return timestamp

    @staticmethod
    def _validate_calendar_features(values: dict[str, Any], timestamp: pd.Timestamp) -> None:
        expected = {
            "hour_of_day": timestamp.hour,
            "day_of_week": timestamp.dayofweek,
            "month": timestamp.month,
            "is_weekend": int(timestamp.dayofweek >= 5),
        }
        mismatches = {
            name: (values.get(name), value)
            for name, value in expected.items()
            if values.get(name) is None or int(values[name]) != value
        }
        if mismatches:
            raise ValueError(
                f"calendar features do not match features_as_of: {mismatches}"
            )

    def _row(self, payload: dict[str, Any]) -> tuple[int, pd.DataFrame, dict[str, Any]]:
        supplied_features = payload.get("features")
        if supplied_features is not None:
            if not isinstance(supplied_features, dict):
                raise ValueError("features must be a JSON object")
            missing = sorted(set(self.features) - set(supplied_features))
            extra = sorted(set(supplied_features) - set(self.features))
            if missing or extra:
                raise ValueError(f"feature schema mismatch; missing={missing}, extra={extra}")
            channel_id = int(payload.get("channel_id", 0))
            values = {name: supplied_features[name] for name in self.features}
            features_as_of = self._validate_freshness(payload.get("features_as_of"))
            self._validate_calendar_features(values, features_as_of)
            source = {
                "channel_id": channel_id,
                "hour": features_as_of.isoformat(),
                "_input_source": "provided_feature_vector",
                **values,
            }
            frame = pd.DataFrame([values], columns=self.features)
        else:
            if "channel_id" not in payload:
                raise ValueError("payload requires channel_id or features")
            channel_id = int(payload["channel_id"])
            if channel_id not in self.table.index:
                raise ValueError(f"channel {channel_id} is absent from latest_table.parquet")
            row = self.table.loc[channel_id]
            source = row.to_dict()
            timestamp = self._validate_freshness(source.get("hour"))
            self._validate_calendar_features(source, timestamp)
            source["hour"] = timestamp.isoformat()
            source["_input_source"] = "bundled_historical_snapshot"
            frame = pd.DataFrame([source], columns=self.features)
        for name in self.categorical:
            frame[name] = frame[name].astype("category")
        for name in set(self.features) - set(self.categorical):
            frame[name] = pd.to_numeric(frame[name], errors="raise")
        return channel_id, frame, source

    def _factors(self, source: dict[str, Any]) -> list[dict[str, Any]]:
        available = [name for name in FEATURE_LABELS if name in source]
        selected = sorted(available, key=lambda name: self.importance.get(name, 0), reverse=True)[:4]
        return [
            {
                "label": FEATURE_LABELS[name],
                "value": _display_value(name, source[name]),
                "impact": round(self.importance.get(name, 0), 4),
                "note": "глобальная важность признака; не локальная причинность",
            }
            for name in selected
        ]

    def predict(
        self, payload: dict[str, Any], display: dict[str, Any]
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        channel_id, frame, source = self._row(payload)
        start = time.perf_counter()
        score = float(self.model.predict_proba(frame)[0, 1])
        elapsed_ms = (time.perf_counter() - start) * 1000
        alert = score >= self.threshold
        if score >= 0.9:
            risk = "critical"
        elif alert:
            risk = "high"
        elif score >= 0.25:
            risk = "medium"
        else:
            risk = "low"

        object_id = str(_json_value(source.get("object_key")) or display.get("object_id") or "unknown")
        features_as_of = _json_value(source.get("hour")) or payload.get("features_as_of")
        digest = hashlib.sha1(
            f"{self.model_id}:{channel_id}:{features_as_of}:{MODEL_VERSION}".encode()
        ).hexdigest()[:10].upper()
        target_note = (
            "Прокси-метка y_repair_7d; способ подтверждения фактическим ремонтом "
            "в переданном архиве не описан."
        )
        raw = {
            "channel_id": channel_id,
            "object_id": object_id,
            "features_as_of": features_as_of,
            "horizon_hours": self.horizon_hours,
            "risk_score": score,
            "threshold": self.threshold,
            "risk_alert": alert,
            "model_version": MODEL_VERSION,
            "target_note": target_note,
            "inference_ms_excluding_model_load": elapsed_ms,
        }
        prediction = {
            "id": f"IW-{digest}",
            "object_id": object_id,
            "object_name": display.get("object_name") or f"Объект {object_id}",
            "district": display.get("district", "Все округа"),
            "system": display.get("system") or str(_json_value(source.get("sys_type")) or "Инженерная система"),
            "picket": display.get("picket", "не указан"),
            "incident_type": "Риск необходимости обслуживания",
            "probability": score,
            "risk": risk,
            "horizon_hours": self.horizon_hours,
            "created_at": datetime.now(MOSCOW_TZ).isoformat(),
            "model_version": MODEL_VERSION,
            "model_id": self.model_id,
            "score_kind": "maintenance_proxy_score",
            "target_note": target_note,
            "threshold": self.threshold,
            "risk_alert": alert,
            "inference_ms": elapsed_ms,
            "sources": [
                str(source.get("_input_source", "provided_feature_vector")),
                "event_journal",
                "channel_registry",
            ],
            "factors": self._factors(source),
            "related_signals": [
                {
                    "timestamp": features_as_of or datetime.now(MOSCOW_TZ).isoformat(),
                    "channel_id": channel_id,
                    "event": (
                        f"Срез признаков: событий {int(source.get('n_events', 0) or 0)}, "
                        f"тревог {int(source.get('n_alarms', 0) or 0)}"
                    ),
                    "state": "Срез признаков",
                }
            ],
            "historical_match": (
                f"Использован срез признаков на {features_as_of or 'неизвестную дату'}. "
                "Для эксплуатации признаки нужно регулярно пересчитывать."
            ),
        }
        return raw, prediction
