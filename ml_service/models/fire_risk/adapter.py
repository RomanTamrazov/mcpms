from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .infer import FireRiskPredictor


HERE = Path(__file__).resolve().parent
MODEL_DIR = HERE / "model"
MOSCOW_TZ = timezone(timedelta(hours=3))

FEATURE_LABELS = {
    "obj_smoke_channels_total": "Дымовые каналы объекта",
    "exp_decay_days_since_onset_7d": "Давность последнего срабатывания",
    "period_est_days": "Историческая периодичность",
    "smoke_channels_detected_max_30d": "Одновременные срабатывания",
    "days_since_onset": "Дни с последнего эпизода",
    "days_with_smoke_detect_30d": "Дни со срабатываниями за 30 дней",
    "days_to_next_expected": "До ожидаемого повторения",
    "smoke_fault_90d": "Неисправности за 90 дней",
}


def _format_value(name: str, value: Any) -> str:
    if value is None:
        return "нет данных"
    number = float(value)
    if name in {"days_since_onset", "days_to_next_expected", "period_est_days"}:
        return f"{number:.1f} дн."
    if name == "exp_decay_days_since_onset_7d":
        return f"{number:.3f}"
    return f"{number:g}"


class FireRiskAdapter:
    model_id = "fire_risk"
    display_name = "Пожарный риск"

    def __init__(self) -> None:
        self.predictor = FireRiskPredictor()
        self.metadata = self.predictor.metadata
        self.object_names = {
            int(key): value
            for key, value in json.loads((MODEL_DIR / "object_names.json").read_text()).items()
        }
        self.importance = {
            item["feature"]: float(item["importance"])
            for item in self.metadata.get("feature_importance", [])
        }
        self.allow_historical = os.getenv("ML_ALLOW_HISTORICAL_SCORING", "0") == "1"

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.model_id,
            "display_name": self.display_name,
            "status": "ready",
            "model_version": self.metadata["model_version"],
            "horizon_hours": self.metadata["horizon_hours"],
            "target": self.metadata["target"],
            "target_is_proxy": self.metadata["target_is_proxy"],
            "test_precision": self.metadata["test"]["precision"],
            "test_recall": self.metadata["test"]["recall"],
            "requires_current_as_of": True,
            "historical_scoring_enabled": self.allow_historical,
        }

    def _validate_freshness(self, payload: dict[str, Any]) -> None:
        meta = payload.get("meta")
        if not isinstance(meta, dict) or "as_of" not in meta:
            return
        try:
            as_of = datetime.fromisoformat(str(meta["as_of"])).date()
        except ValueError as exc:
            raise ValueError("meta.as_of must be an ISO calendar date") from exc
        today = datetime.now(MOSCOW_TZ).date()
        if as_of != today and not self.allow_historical:
            raise ValueError(
                f"stale forecast date: meta.as_of={as_of.isoformat()}, "
                f"current Moscow date={today.isoformat()}; recalculate current features"
            )

    def _factors(self, features: dict[str, Any]) -> list[dict[str, Any]]:
        available = [name for name in FEATURE_LABELS if name in features]
        selected = sorted(available, key=lambda name: self.importance.get(name, 0), reverse=True)[:4]
        return [
            {
                "label": FEATURE_LABELS[name],
                "value": _format_value(name, features[name]),
                "impact": round(self.importance.get(name, 0) / 100, 4),
                "note": "глобальная важность признака; не локальная причинность",
            }
            for name in selected
        ]

    def predict(
        self, payload: dict[str, Any], display: dict[str, Any]
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        self._validate_freshness(payload)
        result = self.predictor.predict_one(payload)
        object_id = int(result["object"])
        object_info = self.object_names.get(object_id, {})
        digest = hashlib.sha1(
            f"{self.model_id}:{object_id}:{result['as_of']}:{result['model_version']}".encode()
        ).hexdigest()[:10].upper()
        score = float(result["risk_score"])
        if score >= 0.75:
            risk = "critical"
        elif result["risk_alert"]:
            risk = "high"
        elif score >= 0.2:
            risk = "medium"
        else:
            risk = "low"
        prediction = {
            "id": f"FR-{digest}",
            "object_id": str(object_id),
            "object_name": display.get("object_name") or object_info.get("name") or f"Объект {object_id}",
            "district": display.get("district", "Все округа"),
            "system": display.get("system", "Пожарная сигнализация"),
            "picket": display.get("picket", "не указан"),
            "incident_type": "Риск нового срабатывания дымового датчика",
            "probability": score,
            "risk": risk,
            "horizon_hours": int(result["horizon_hours"]),
            "created_at": datetime.now(MOSCOW_TZ).isoformat(),
            "model_version": result["model_version"],
            "model_id": self.model_id,
            "score_kind": "proxy_risk_score",
            "target_note": result["target_note"],
            "threshold": result["threshold"],
            "risk_alert": result["risk_alert"],
            "inference_ms": result["inference_ms_excluding_model_load"],
            "sources": ["event_journal", "channel_registry", "object_registry"],
            "factors": self._factors(payload["features"]),
            "related_signals": [],
            "historical_match": "Скор основан на истории срабатываний и неисправностей дымовых каналов объекта.",
        }
        return result, prediction
