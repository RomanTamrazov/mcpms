from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .runtime.lct26_access.inference import (
    predict_sites,
    predict_zones,
    read_metadata,
)

HERE = Path(__file__).resolve().parent
SITE_MODEL_DIR = HERE / "model" / "site"
ZONE_MODEL_DIR = HERE / "model" / "zone"
MOSCOW_TZ = timezone(timedelta(hours=3))
DEFAULT_THRESHOLD_MODE = "safety_margin_70_50"

FEATURE_LABELS = {
    "site_raw": "Объект охранной подсистемы",
    "site_family": "Группа объекта",
    "current_intrusion_day": "Физическая охранная тревога сегодня",
    "positive_day_rate28": "Доля дней с тревогой за 28 дней",
    "intrusion_events_sum7": "Охранные события за 7 дней",
    "intrusion_events_sum28": "Охранные события за 28 дней",
    "intrusion_episode_count": "Эпизоды охранной тревоги за день",
    "intrusion_episode_burstiness": "Серийность охранных тревог",
    "intrusion_motion_contact_episodes": "Связки движения и открытия",
    "days_since_intrusion": "Дни с последней охранной тревоги",
    "target_weekend": "Прогноз на выходной день",
    "target_holiday": "Прогноз на праздничный день",
}


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.bool_, np.integer, np.floating)):
        return value.item()
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if pd.isna(value):
        return None
    return value


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {name: _json_value(value) for name, value in row.items()}
        for row in frame.to_dict(orient="records")
    ]


def _label(feature: str) -> str:
    if feature in FEATURE_LABELS:
        return FEATURE_LABELS[feature]
    return feature.replace("_", " ")


def _split_mapping(value: Any) -> list[str]:
    if value is None or pd.isna(value):
        return []
    return [item.strip() for item in re.split(r"[;|]+", str(value)) if item.strip()]


class UnauthorizedAccessAdapter:
    model_id = "unauthorized_access"
    display_name = "Несанкционированный доступ"

    def __init__(self) -> None:
        self.site_metadata = read_metadata(SITE_MODEL_DIR / "site_model_metadata.json")
        self.zone_metadata = read_metadata(ZONE_MODEL_DIR / "zone_model_metadata.json")
        self.threshold_mode = os.getenv(
            "ACCESS_THRESHOLD_MODE", DEFAULT_THRESHOLD_MODE
        )
        thresholds = self.site_metadata["decision_thresholds_from_2024_2025"]
        if self.threshold_mode not in thresholds:
            raise ValueError(
                f"ACCESS_THRESHOLD_MODE={self.threshold_mode!r} is unknown; "
                f"choose one of {sorted(thresholds)}"
            )
        self.threshold = float(thresholds[self.threshold_mode])
        self.allow_historical = os.getenv("ML_ALLOW_HISTORICAL_SCORING", "0") == "1"
        feature_dir = os.getenv("ACCESS_FEATURE_DIR")
        self.site_features = self._configured_path(
            "ACCESS_SITE_FEATURE_PATH", feature_dir, "daily_site_features.parquet"
        )
        self.context_features = self._configured_path(
            "ACCESS_CONTEXT_FEATURE_PATH", feature_dir, "daily_family_context.parquet"
        )
        self.zone_features = self._configured_path(
            "ACCESS_ZONE_FEATURE_PATH", feature_dir, "daily_zone_features.parquet"
        )
        self._validate_artifacts()

    @staticmethod
    def _configured_path(
        variable: str, feature_dir: str | None, filename: str
    ) -> Path | None:
        configured = os.getenv(variable)
        if configured:
            return Path(configured).expanduser().resolve()
        if feature_dir:
            return (Path(feature_dir).expanduser().resolve() / filename)
        return None

    def _validate_artifacts(self) -> None:
        required = [
            *(SITE_MODEL_DIR / name for name in (
                "lgb_base.txt",
                "lgb_weekly_tuned.txt",
                "lgb_context.txt",
                "site_model_metadata.json",
            )),
            *(ZONE_MODEL_DIR / name for name in (
                "zone_classifier.txt",
                "zone_ranker.txt",
                "zone_model_metadata.json",
            )),
        ]
        missing = [str(path) for path in required if not path.is_file()]
        if missing:
            raise ValueError(f"unauthorized-access artifacts are missing: {missing}")
        if int(self.site_metadata.get("horizon_hours", 0)) < 24:
            raise ValueError("model horizon is shorter than 24 hours")

    @property
    def feature_tables_configured(self) -> bool:
        return all(
            path is not None and path.is_file()
            for path in (self.site_features, self.context_features, self.zone_features)
        )

    def describe(self) -> dict[str, Any]:
        policy = self.site_metadata["integration_policy"]
        test = policy["holdout_2026H1"]
        return {
            "id": self.model_id,
            "display_name": self.display_name,
            "status": "ready",
            "model_version": self.site_metadata["model_version"],
            "zone_model_version": self.zone_metadata["model_version"],
            "horizon_hours": int(self.site_metadata["horizon_hours"]),
            "target": self.site_metadata["target_semantics"],
            "target_is_proxy": True,
            "threshold_mode": self.threshold_mode,
            "threshold": self.threshold,
            "serving_policy_version": policy["version"],
            "test_precision": test["precision"],
            "test_recall": test["recall"],
            "test_precision_bootstrap_95": test["calendar_day_bootstrap_95"]["precision"],
            "test_recall_bootstrap_95": test["calendar_day_bootstrap_95"]["recall"],
            "test_period": "2026-01-01..2026-06-30",
            "feature_tables_configured": self.feature_tables_configured,
            "serving_ready": self.feature_tables_configured,
            "input_mode": "current prepared site/context/zone parquet tables",
            "requires_current_as_of": True,
            "historical_scoring_enabled": self.allow_historical,
            "response_policy": "forecast alone creates only a P4 preventive-review task",
        }

    def _paths(self) -> tuple[Path, Path, Path]:
        named = {
            "ACCESS_SITE_FEATURE_PATH": self.site_features,
            "ACCESS_CONTEXT_FEATURE_PATH": self.context_features,
            "ACCESS_ZONE_FEATURE_PATH": self.zone_features,
        }
        missing = [name for name, path in named.items() if path is None or not path.is_file()]
        if missing:
            raise ValueError(
                "current feature tables are not configured; set ACCESS_FEATURE_DIR "
                f"or all individual paths: {missing}"
            )
        return self.site_features, self.context_features, self.zone_features  # type: ignore[return-value]

    def _as_of(self, value: Any) -> pd.Timestamp:
        if value in (None, ""):
            raise ValueError("payload.as_of is required as YYYY-MM-DD")
        try:
            as_of = pd.Timestamp(value).normalize()
        except (TypeError, ValueError) as exc:
            raise ValueError("payload.as_of must be a valid ISO calendar date") from exc
        if pd.isna(as_of):
            raise ValueError("payload.as_of must be a valid ISO calendar date")
        if as_of.tzinfo is not None:
            as_of = as_of.tz_convert(MOSCOW_TZ).tz_localize(None)
        today = pd.Timestamp(datetime.now(MOSCOW_TZ).date())
        if as_of != today and not self.allow_historical:
            raise ValueError(
                f"stale forecast date: as_of={as_of.date()}, current Moscow date={today.date()}; "
                "rebuild the current feature tables"
            )
        return as_of

    @staticmethod
    def _select_site(
        forecast: pd.DataFrame, payload: dict[str, Any]
    ) -> pd.Series:
        site_raw = payload.get("site_raw")
        object_id = payload.get("object_id")
        if site_raw not in (None, ""):
            selected = forecast.loc[forecast["site_raw"].astype(str) == str(site_raw)]
        elif object_id not in (None, "") and "site_object_ids" in forecast.columns:
            selected = forecast.loc[
                forecast["site_object_ids"].map(
                    lambda value: str(object_id) in _split_mapping(value)
                )
            ]
        else:
            raise ValueError("payload requires site_raw or object_id")
        if selected.empty:
            raise ValueError("requested site/object is absent from the current feature table")
        if len(selected) > 1:
            raise ValueError("object_id maps to multiple sites; send an explicit site_raw")
        return selected.iloc[0]

    @staticmethod
    def _factors(explanation_json: str) -> list[dict[str, Any]]:
        explanation = json.loads(explanation_json)
        contributors = explanation.get("raises_risk", [])[:4]
        total = sum(abs(float(item["score"])) for item in contributors) or 1.0
        return [
            {
                "label": _label(str(item["feature"])),
                "value": f"вклад {float(item['score']):.3f}",
                "impact": abs(float(item["score"])) / total,
                "note": "локальный вклад LightGBM в log-odds; не причинное объяснение",
            }
            for item in contributors
        ]

    def predict(
        self, payload: dict[str, Any], display: dict[str, Any]
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        site_path, context_path, zone_path = self._paths()
        as_of = self._as_of(payload.get("as_of"))
        top_zones = int(payload.get("top_zones", 5))
        if not 1 <= top_zones <= 10:
            raise ValueError("top_zones must be between 1 and 10")

        site_forecast, site_run = predict_sites(
            site_path,
            context_path,
            SITE_MODEL_DIR,
            as_of=as_of,
            threshold_mode=self.threshold_mode,
        )
        site = self._select_site(site_forecast, payload)
        selected_site = site_forecast.loc[
            site_forecast["site_raw"].astype(str) == str(site["site_raw"])
        ]
        zones, zone_run = predict_zones(
            zone_path,
            ZONE_MODEL_DIR,
            selected_site,
            as_of=as_of,
            top_zones=top_zones,
        )

        site_raw = str(site["site_raw"])
        mapped_ids = _split_mapping(site.get("site_object_ids"))
        mapped_names = _split_mapping(site.get("site_dispatcher_objects"))
        object_id = str(display.get("object_id") or (mapped_ids[0] if mapped_ids else site_raw))
        object_name = str(
            display.get("object_name")
            or (" / ".join(mapped_names) if mapped_names else f"Охранный объект {site_raw}")
        )
        score = float(site["risk_probability"])
        alert = bool(site["alert"])
        band = str(site["risk_band"])
        risk = "high" if alert else ("medium" if band in {"high", "elevated"} else "low")
        forecast_date = str(site["forecast_date"])
        digest = hashlib.sha1(
            f"{self.model_id}:{site_raw}:{as_of.date()}:{self.site_metadata['model_version']}".encode()
        ).hexdigest()[:10].upper()
        zone_records = _records(zones)
        related_signals = [
            {
                "timestamp": f"{forecast_date}T00:00:00+03:00",
                "channel_id": item["zone_key"],
                "event": (
                    f"Кандидат зоны №{item['zone_rank']}; "
                    f"условный скор {float(item['zone_classifier_probability']):.3f}"
                ),
                "state": "требует независимой проверки",
            }
            for item in zone_records
        ]
        target_note = (
            "Прокси-цель: хотя бы одна тревога охранной подсистемы со значением "
            "«Обнаружено движение» или «Не замкнут» на следующий календарный день. "
            "Это не подтверждённое вторжение."
        )
        raw = {
            "site": {name: _json_value(value) for name, value in site.to_dict().items()},
            "zones": zone_records,
            "site_run": site_run,
            "zone_run": zone_run,
        }
        prediction = {
            "id": f"UA-{digest}",
            "object_id": object_id,
            "object_name": object_name,
            "district": display.get("district", "Все округа"),
            "system": display.get("system", "Охранная подсистема"),
            "picket": display.get("picket", "не указан"),
            "incident_type": "Риск охранной тревоги на следующие сутки",
            "probability": score,
            "risk": risk,
            "horizon_hours": 24,
            "created_at": datetime.now(MOSCOW_TZ).isoformat(),
            "forecast_date": forecast_date,
            "model_version": self.site_metadata["model_version"],
            "zone_model_version": self.zone_metadata["model_version"],
            "model_id": self.model_id,
            "score_kind": "security_alarm_proxy_score",
            "target_note": target_note,
            "threshold_mode": self.threshold_mode,
            "threshold": self.threshold,
            "risk_alert": alert,
            "workflow_state": "FORECAST_RISK",
            "response_priority": "P4" if alert else "NONE",
            "requires_independent_verification": alert,
            "auto_incident_confirmation": False,
            "inference_ms": 1000 * (
                float(site_run["site_prediction_seconds"])
                + float(zone_run["zone_prediction_seconds"])
            ),
            "sources": ["event_journal", "channel_registry", "object_registry"],
            "factors": self._factors(str(site["explanation_json"])),
            "related_signals": related_signals,
            "historical_match": (
                "Оценка основана на причинной истории охранных событий до конца даты as_of; "
                "top-зоны служат только очередью для ручной проверки."
            ),
        }
        return raw, prediction
