"""Model definitions and category handling shared by training and inference."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd

SITE_EXCLUDE = {
    "date",
    "target_date",
    "target",
    "target_next_events",
    "target_next_zones",
    "site_object_ids",
    "site_dispatcher_objects",
}
ZONE_EXCLUDE = {
    "date",
    "target_date",
    "target",
    "target_next_zone_events",
    "site_target",
    "zone_object_ids",
    "zone_dispatcher_objects",
}
SITE_CATEGORICAL = ("site_raw", "site_family", "site_parent_id")
ZONE_CATEGORICAL = (
    "zone_key",
    "site_raw",
    "site_family",
    "zone_primary_object_id",
    "zone_primary_parent_id",
)

LGB_BASE_PARAMS: dict[str, object] = {
    "objective": "binary",
    "learning_rate": 0.025,
    "num_leaves": 31,
    "min_child_samples": 100,
    "subsample": 0.85,
    "subsample_freq": 1,
    "colsample_bytree": 0.75,
    "reg_alpha": 0.15,
    "reg_lambda": 1.0,
    "random_state": 2603,
    "n_jobs": -1,
    "verbosity": -1,
}

LGB_WEEKLY_TUNED_PARAMS: dict[str, object] = {
    "objective": "binary",
    "learning_rate": 0.0311028110187967,
    "num_leaves": 81,
    "max_depth": 7,
    "min_child_samples": 213,
    "subsample": 0.7616308901755684,
    "subsample_freq": 1,
    "colsample_bytree": 0.820407577975486,
    "reg_alpha": 0.0024948384188316036,
    "reg_lambda": 4.200784644431839,
    "min_split_gain": 0.0568391179575055,
    "max_bin": 127,
    "extra_trees": True,
    "random_state": 2603,
    "n_jobs": -1,
    "verbosity": -1,
}

LGB_ZONE_CLASSIFIER_PARAMS: dict[str, object] = {
    "objective": "binary",
    "learning_rate": 0.035,
    "num_leaves": 63,
    "max_depth": 9,
    "min_child_samples": 120,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.75,
    "reg_alpha": 0.1,
    "reg_lambda": 4.0,
    "random_state": 2603,
    "n_jobs": -1,
    "verbosity": -1,
}

LGB_ZONE_RANKER_PARAMS: dict[str, object] = {
    "objective": "lambdarank",
    "metric": "ndcg",
    "learning_rate": 0.035,
    "num_leaves": 63,
    "max_depth": 9,
    "min_child_samples": 80,
    "subsample": 0.85,
    "subsample_freq": 1,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.05,
    "reg_lambda": 3.0,
    "lambdarank_truncation_level": 15,
    "random_state": 2603,
    "n_jobs": -1,
    "verbosity": -1,
}


def feature_columns(
    frame: pd.DataFrame,
    *,
    exclude: set[str],
) -> list[str]:
    return [
        name
        for name in frame.columns
        if name not in exclude and frame[name].nunique(dropna=False) > 1
    ]


def fit_category_maps(
    frame: pd.DataFrame,
    columns: Sequence[str],
) -> dict[str, dict[str, int]]:
    return {
        column: {
            value: index
            for index, value in enumerate(sorted(frame[column].fillna("__NA__").astype(str).unique()))
        }
        for column in columns
        if column in frame.columns
    }


def encode_for_lightgbm(
    frame: pd.DataFrame,
    features: Sequence[str],
    category_maps: Mapping[str, Mapping[str, int]],
) -> pd.DataFrame:
    matrix = frame.loc[:, list(features)].replace([np.inf, -np.inf], np.nan).copy()
    for column, mapping in category_maps.items():
        if column not in matrix:
            continue
        encoded = matrix[column].fillna("__NA__").astype(str).map(mapping).fillna(-1).astype("int32")
        matrix[column] = pd.Categorical(encoded, categories=sorted(set(mapping.values()) | {-1}))
    numeric = [column for column in matrix.columns if column not in category_maps]
    matrix[numeric] = matrix[numeric].fillna(0)
    return matrix


def encode_for_catboost(
    frame: pd.DataFrame,
    features: Sequence[str],
    categorical: Sequence[str],
) -> pd.DataFrame:
    matrix = frame.loc[:, list(features)].replace([np.inf, -np.inf], np.nan).copy()
    present_categorical = [
        column for column in categorical if column in matrix.columns
    ]
    for column in present_categorical:
        matrix[column] = matrix[column].fillna("__NA__").astype(str)
    numeric = [
        column for column in matrix.columns if column not in present_categorical
    ]
    matrix[numeric] = matrix[numeric].fillna(0).astype("float32")
    return matrix


def group_sizes(frame: pd.DataFrame) -> np.ndarray:
    return (
        frame.groupby(["target_date", "site_raw"], sort=False)
        .size()
        .to_numpy(dtype=np.int32)
    )
