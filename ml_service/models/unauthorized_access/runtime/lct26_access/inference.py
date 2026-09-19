"""Reusable batch inference for site risk and conditional zone localisation."""

from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import polars as pl
from lightgbm import Booster

from .features import augment_site_model_frame, augment_zone_model_frame
from .models import encode_for_lightgbm

ACTIVE_SITE_COMPONENTS = ("lgb_base", "lgb_weekly_tuned", "lgb_context")


def _load_booster(model_dir: Path, name: str) -> Booster:
    """Load the native LightGBM artifact without a scikit-learn pickle."""

    path = model_dir / f"{name}.txt"
    if not path.is_file():
        raise FileNotFoundError(f"Native LightGBM artifact is missing: {path}")
    return Booster(model_file=str(path))


def read_metadata(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_site_runtime_weights(weights: dict[str, float]) -> None:
    unsupported = {
        name: float(weight)
        for name, weight in weights.items()
        if name not in ACTIVE_SITE_COMPONENTS and float(weight) != 0.0
    }
    if unsupported:
        raise ValueError(
            "Production runtime supports only the three active LightGBM components; "
            f"non-zero unsupported weights: {unsupported}"
        )


def _risk_band(probability: float, thresholds: dict[str, float]) -> str:
    if probability >= thresholds.get(
        "safety_margin_70_50", thresholds["high_precision_75"]
    ):
        return "very_high"
    if probability >= thresholds["high_precision_75"]:
        return "high"
    if probability >= thresholds["balanced_f1"]:
        return "elevated"
    if probability >= thresholds["high_recall_90"]:
        return "watch"
    return "low"


def _uncertainty_band(disagreement: float, thresholds: dict[str, float]) -> str:
    if disagreement >= thresholds["extreme"]:
        return "extreme"
    if disagreement >= thresholds["high"]:
        return "high"
    if disagreement >= thresholds["median"]:
        return "medium"
    return "low"


def _data_quality(row: pd.Series) -> str:
    if int(row.get("site_day_observed", 0)) == 0:
        return "no_security_event_today"
    if float(row.get("site_day_observed_mean28", 1.0)) < 0.8:
        return "sparse_security_event_days"
    return "security_event_today"


def _top_contributors(
    contributions: list[defaultdict[str, float]],
    *,
    count: int = 5,
) -> list[str]:
    output: list[str] = []
    for row in contributions:
        positive = sorted(row.items(), key=lambda item: item[1], reverse=True)[:count]
        negative = sorted(row.items(), key=lambda item: item[1])[:count]
        output.append(
            json.dumps(
                {
                    "raises_risk": [
                        {"feature": name, "score": round(float(value), 6)}
                        for name, value in positive
                        if value > 0
                    ],
                    "lowers_risk": [
                        {"feature": name, "score": round(float(value), 6)}
                        for name, value in negative
                        if value < 0
                    ],
                    "note": "weighted LightGBM log-odds contributions; directional, not probability points",
                },
                ensure_ascii=False,
            )
        )
    return output


def predict_sites(
    site_feature_path: Path,
    context_feature_path: Path,
    model_dir: Path,
    *,
    as_of: pd.Timestamp | None = None,
    threshold_mode: str = "operational_recall_80",
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Predict next-calendar-day site risk from a prepared causal feature table."""

    started = time.monotonic()
    metadata = read_metadata(model_dir / "site_model_metadata.json")
    thresholds = metadata["decision_thresholds_from_2024_2025"]
    if threshold_mode not in thresholds:
        raise ValueError(
            f"Unknown threshold mode {threshold_mode!r}; choose one of {sorted(thresholds)}"
        )

    frames = {
        "lgb_base": augment_site_model_frame(site_feature_path, weekly=False),
        "lgb_weekly_tuned": augment_site_model_frame(site_feature_path, weekly=True),
        "lgb_context": augment_site_model_frame(
            site_feature_path, context_path=context_feature_path, weekly=True
        ),
    }
    for frame in frames.values():
        frame["date"] = pd.to_datetime(frame["date"])
    available_max = min(frame["date"].max() for frame in frames.values())
    selected_date = pd.Timestamp(as_of).normalize() if as_of is not None else available_max
    selected_frames = {
        name: frame.loc[frame["date"] == selected_date].copy()
        for name, frame in frames.items()
    }
    expected_sites = set(selected_frames["lgb_base"]["site_raw"])
    if not expected_sites:
        raise ValueError(f"No site features found for as-of date {selected_date.date()}")
    for name, frame in selected_frames.items():
        if set(frame["site_raw"]) != expected_sites:
            raise ValueError(f"Variant {name} does not contain the same sites on {selected_date.date()}")

    anchor = selected_frames["lgb_base"].sort_values("site_raw").reset_index(drop=True)
    component_scores: dict[str, np.ndarray] = {}
    contributions = [defaultdict(float) for _ in range(anchor.shape[0])]
    weights: dict[str, float] = metadata["ensemble_weights"]
    _validate_site_runtime_weights(weights)
    for name in ACTIVE_SITE_COMPONENTS:
        variant = selected_frames[name].sort_values("site_raw").reset_index(drop=True)
        spec = metadata["variants"][name]
        matrix = encode_for_lightgbm(
            variant,
            spec["features"],
            spec["category_maps"],
        )
        model = _load_booster(model_dir, name)
        component_scores[name] = np.asarray(model.predict(matrix), dtype=float)
        weight = float(weights.get(name, 0.0))
        if weight > 0:
            local = np.asarray(model.predict(matrix, pred_contrib=True))
            for column_index, feature in enumerate(spec["features"]):
                values = weight * local[:, column_index]
                for row_index, value in enumerate(values):
                    contributions[row_index][feature] += float(value)

    # Retain the zero-valued compatibility column without shipping or importing
    # CatBoost.  The frozen champion has assigned it exactly zero weight.
    component_scores["cat_base"] = np.zeros(anchor.shape[0], dtype=float)

    probability = sum(
        float(weights[name]) * component_scores[name] for name in weights
    )
    active_weights = {
        name: float(weight) for name, weight in weights.items() if float(weight) > 0
    }
    active_weight_values = np.asarray(list(active_weights.values()), dtype=float)
    active_weight_values /= active_weight_values.sum()
    active_matrix = np.column_stack(
        [component_scores[name] for name in active_weights]
    )
    active_mean = active_matrix @ active_weight_values
    disagreement = np.sqrt(
        ((active_matrix - active_mean[:, None]) ** 2) @ active_weight_values
    )
    uncertainty_thresholds = metadata["uncertainty"][
        "thresholds_from_2024_2025"
    ]
    alerts = probability >= float(thresholds[threshold_mode])
    forecast = pd.DataFrame(
        {
            "as_of_date": selected_date.date().isoformat(),
            "forecast_date": (selected_date + pd.Timedelta(days=1)).date().isoformat(),
            "site_raw": anchor["site_raw"].astype(str),
            "site_family": anchor["site_family"].astype(str),
            "model_version": metadata["model_version"],
            "risk_probability": probability,
            "risk_band": [_risk_band(value, thresholds) for value in probability],
            "model_disagreement": disagreement,
            "uncertainty_band": [
                _uncertainty_band(value, uncertainty_thresholds)
                for value in disagreement
            ],
            "threshold_mode": threshold_mode,
            "decision_threshold": float(thresholds[threshold_mode]),
            "alert": alerts,
            "workflow_state": "FORECAST_RISK",
            "response_priority": np.where(alerts, "P4", "NONE"),
            "requires_independent_verification": alerts,
            "auto_incident_confirmation": False,
            "data_quality": anchor.apply(_data_quality, axis=1),
            "explanation_json": _top_contributors(contributions),
        }
    )
    for column in ("site_object_ids", "site_dispatcher_objects"):
        if column in anchor.columns:
            forecast[column] = anchor[column].fillna("").astype(str).values
    for name, score in component_scores.items():
        forecast[f"component_{name}"] = score
    forecast = forecast.sort_values("risk_probability", ascending=False).reset_index(drop=True)
    run = {
        "as_of_date": selected_date.date().isoformat(),
        "forecast_date": (selected_date + pd.Timedelta(days=1)).date().isoformat(),
        "site_rows": int(forecast.shape[0]),
        "alert_rows": int(forecast["alert"].sum()),
        "threshold_mode": threshold_mode,
        "site_prediction_seconds": round(time.monotonic() - started, 4),
        "model_target": metadata["target_semantics"],
        "site_model_version": metadata["model_version"],
        "response_semantics": (
            "A forecast alert creates only a P4 preventive-review task. It never "
            "confirms an intrusion or promotes an incident to P1/P2 without independent evidence."
        ),
        "signal_status_note": (
            "Security journals are event streams, not heartbeats: absence of an event "
            "does not by itself prove a telemetry outage"
        ),
    }
    return forecast, run


def _percentile_rank(frame: pd.DataFrame, score_column: str) -> pd.Series:
    return frame.groupby(["target_date", "site_raw"])[score_column].rank(
        method="average", pct=True
    )


def predict_zones(
    zone_feature_path: Path,
    model_dir: Path,
    site_forecast: pd.DataFrame,
    *,
    as_of: pd.Timestamp,
    top_zones: int = 5,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Rank candidate zones within every forecast site."""

    started = time.monotonic()
    metadata = read_metadata(model_dir / "zone_model_metadata.json")
    selected_date = pd.Timestamp(as_of).normalize()
    frame = (
        pl.scan_parquet(zone_feature_path)
        .filter(pl.col("date") == selected_date.date())
        .collect()
        .to_pandas()
    )
    if frame.empty:
        raise ValueError(f"No zone features found for as-of date {selected_date.date()}")
    frame = augment_zone_model_frame(frame)
    frame = frame.sort_values(["target_date", "site_raw", "zone_key"]).reset_index(drop=True)
    matrix = encode_for_lightgbm(
        frame,
        metadata["features"],
        metadata["category_maps"],
    )
    classifier = _load_booster(model_dir, "zone_classifier")
    ranker = _load_booster(model_dir, "zone_ranker")
    frame["zone_classifier_probability"] = classifier.predict(matrix)
    frame["zone_ranker_score"] = ranker.predict(matrix)
    frame["classifier_rank_percentile"] = _percentile_rank(
        frame, "zone_classifier_probability"
    )
    frame["ranker_rank_percentile"] = _percentile_rank(frame, "zone_ranker_score")
    weights = metadata["blend_weights"]
    frame["zone_rank_score"] = (
        float(weights["classifier_rank"]) * frame["classifier_rank_percentile"]
        + float(weights["ranker_rank"]) * frame["ranker_rank_percentile"]
    )
    frame = frame.merge(
        site_forecast[
            [
                "site_raw",
                "risk_probability",
                "risk_band",
                "model_disagreement",
                "uncertainty_band",
                "alert",
                "workflow_state",
                "response_priority",
                "requires_independent_verification",
                "data_quality",
            ]
        ],
        on="site_raw",
        how="inner",
        validate="many_to_one",
    )
    frame["priority_score"] = (
        frame["risk_probability"] * frame["zone_classifier_probability"]
    )
    frame = frame.sort_values(
        ["site_raw", "zone_rank_score"], ascending=[True, False]
    )
    frame["zone_rank"] = frame.groupby("site_raw").cumcount() + 1
    selected = frame.loc[frame["zone_rank"] <= top_zones].copy()
    selected["recommendation"] = np.where(
        selected["alert"],
        "Проверить охранный контур зоны и сопоставить с журналом доступа/видео",
        "Фоновый мониторинг; ручная проверка только при дополнительном сигнале",
    )
    columns = [
        "date",
        "target_date",
        "site_raw",
        "site_family",
        "zone_key",
        "zone_rank",
        "zone_classifier_probability",
        "zone_rank_score",
        "priority_score",
        "risk_probability",
        "risk_band",
        "model_disagreement",
        "uncertainty_band",
        "alert",
        "workflow_state",
        "response_priority",
        "requires_independent_verification",
        "data_quality",
        "recommendation",
    ]
    mapping_columns = [
        column
        for column in ("zone_object_ids", "zone_dispatcher_objects")
        if column in selected.columns
    ]
    columns[5:5] = mapping_columns
    selected = selected.loc[:, columns].sort_values(
        ["risk_probability", "site_raw", "zone_rank"],
        ascending=[False, True, True],
    )
    output_counts = selected.groupby("site_raw").size()
    run = {
        "zone_model_version": metadata.get(
            "model_version", "model3-zone-v1.0-classifier-lambdarank"
        ),
        "zone_candidate_rows": int(frame.shape[0]),
        "zone_output_rows": int(selected.shape[0]),
        "zone_sites_with_candidates": int(output_counts.size),
        "zone_sites_with_fewer_than_top_k": int((output_counts < top_zones).sum()),
        "top_zones_per_site": int(top_zones),
        "zone_prediction_seconds": round(time.monotonic() - started, 4),
        "zone_probability_note": (
            "zone_classifier_probability is conditional and multiple zones can be positive; "
            "zone_rank_score is an ordering score, not a calibrated probability"
        ),
    }
    return selected.reset_index(drop=True), run
