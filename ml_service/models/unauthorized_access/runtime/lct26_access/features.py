"""Causal daily feature tables for site forecasting and zone localisation."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import holidays
import numpy as np
import pandas as pd
import polars as pl

from .constants import (
    CONTEXT_SENSOR_SLUGS,
    GUARD_STATE_SENSOR,
    INTRUSION_VALUES,
    JOURNAL_COLUMNS,
    SECURITY_SYSTEM,
    SENSOR_SLUGS,
    SYSTEM_SLUGS,
)
from .data import alarm_flag_expression, read_channel_catalog, scan_journal

EVENT_CORE = ["ид_события", "ид_канала_данных", "значение_датчика", "ts", "alarm"]
CONTACT_SENSOR_TYPES = frozenset(
    {"КД АВ", "КД Дверь", "КД Люк", "Стекло", "9-секционный люк"}
)


def _round_float_columns(frame: pl.DataFrame, decimals: int = 8) -> pl.DataFrame:
    """Stabilise harmless parallel-reduction noise before writing Parquet."""

    floating = [
        name
        for name, dtype in frame.schema.items()
        if dtype in {pl.Float32, pl.Float64}
    ]
    return frame.with_columns([pl.col(name).round(decimals) for name in floating])


def _security_frame(path: Path) -> pl.DataFrame:
    """Load one compact year and remove only byte-equivalent logical duplicates.

    Event IDs are not globally unique in the source. Rows with the same ID but
    different channel/timestamp/value are retained deliberately.
    """

    return (
        pl.read_parquet(path)
        .unique(subset=EVENT_CORE, keep="first")
        .filter(pl.col("тип_инж_системы") == SECURITY_SYSTEM)
        .with_columns(
            [
                pl.col("ts").dt.date().alias("date"),
                pl.col("ts").dt.hour().alias("hour"),
                pl.col("ts").dt.weekday().alias("weekday"),
                (
                    (pl.col("alarm") == 1)
                    & pl.col("значение_датчика").is_in(INTRUSION_VALUES)
                )
                .cast(pl.Int8)
                .alias("intrusion"),
                (
                    (pl.col("alarm") == 1)
                    & ~pl.col("значение_датчика").is_in(INTRUSION_VALUES)
                )
                .cast(pl.Int8)
                .alias("technical_alarm"),
            ]
        )
    )


def _daily_intrusion_episode_features(
    security: pl.DataFrame,
    *,
    gap_minutes: int = 30,
) -> pl.DataFrame:
    """Summarise alarm bursts using only information available by day end.

    Episodes are deliberately cut at the calendar-day boundary.  A training row
    for day D must not absorb events from D+1 merely because a physical alarm
    burst continues across midnight.
    """

    stable_sort_columns = [
        name
        for name in (
            "site_raw",
            "date",
            "ts",
            "zone_key",
            "ид_канала_данных",
            "ид_события",
        )
        if name in security.columns
    ]
    intrusions = (
        security.filter(pl.col("intrusion") == 1)
        .sort(stable_sort_columns)
        .with_columns(
            [
                pl.col("ts")
                .shift(1)
                .over(["site_raw", "date"])
                .alias("previous_intrusion_ts"),
                pl.col("zone_key")
                .shift(1)
                .over(["site_raw", "date"])
                .alias("previous_intrusion_zone"),
            ]
        )
        .with_columns(
            (
                (pl.col("ts") - pl.col("previous_intrusion_ts"))
                .dt.total_seconds()
                .truediv(60.0)
            ).alias("intrusion_gap_minutes")
        )
        .with_columns(
            [
                (
                    pl.col("previous_intrusion_ts").is_null()
                    | (pl.col("intrusion_gap_minutes") > gap_minutes)
                )
                .cast(pl.Int64)
                .cum_sum()
                .over(["site_raw", "date"])
                .alias("episode_local_id"),
                (
                    pl.col("previous_intrusion_zone").is_not_null()
                    & (pl.col("zone_key") != pl.col("previous_intrusion_zone"))
                )
                .cast(pl.Int8)
                .alias("zone_transition"),
            ]
        )
    )
    if intrusions.is_empty():
        return pl.DataFrame()

    episode_keys = ["site_raw", "site_family", "date", "episode_local_id"]
    episodes = intrusions.group_by(episode_keys).agg(
        [
            pl.len().alias("episode_events"),
            pl.col("ид_канала_данных").n_unique().alias("episode_channels"),
            pl.col("zone_key").n_unique().alias("episode_zones"),
            pl.col("тип_датчика").n_unique().alias("episode_sensor_types"),
            (pl.col("тип_датчика") == "Датчик движения")
            .any()
            .alias("episode_has_motion"),
            pl.col("тип_датчика")
            .is_in(CONTACT_SENSOR_TYPES)
            .any()
            .alias("episode_has_contact"),
            (
                (pl.col("ts").max() - pl.col("ts").min())
                .dt.total_seconds()
                .truediv(60.0)
            ).alias("episode_duration_minutes"),
            pl.col("zone_transition").sum().alias("episode_zone_transitions"),
        ]
    )
    daily = episodes.group_by(["site_raw", "site_family", "date"]).agg(
        [
            pl.len().alias("intrusion_episode_count"),
            pl.col("episode_events")
            .sum()
            .alias("intrusion_events_for_burstiness"),
            (pl.col("episode_events") > 1)
            .sum()
            .alias("intrusion_multi_event_episodes"),
            (
                pl.col("episode_has_motion") & pl.col("episode_has_contact")
            )
            .sum()
            .alias("intrusion_motion_contact_episodes"),
            pl.col("episode_events").max().alias("intrusion_episode_max_events"),
            pl.col("episode_events").mean().alias("intrusion_episode_mean_events"),
            pl.col("episode_channels").max().alias("intrusion_episode_max_channels"),
            pl.col("episode_zones").max().alias("intrusion_episode_max_zones"),
            pl.col("episode_sensor_types")
            .max()
            .alias("intrusion_episode_max_sensor_types"),
            pl.col("episode_duration_minutes")
            .max()
            .alias("intrusion_episode_max_duration_minutes"),
            pl.col("episode_zone_transitions")
            .sum()
            .alias("intrusion_zone_transitions"),
        ]
    )
    span = intrusions.group_by(["site_raw", "site_family", "date"]).agg(
        [
            pl.col("ts").dt.hour().n_unique().alias("intrusion_active_hours"),
            (
                (pl.col("ts").max() - pl.col("ts").min())
                .dt.total_seconds()
                .truediv(60.0)
            ).alias("intrusion_daily_span_minutes"),
            pl.col("intrusion_gap_minutes")
            .drop_nulls()
            .mean()
            .fill_null(0)
            .alias("intrusion_mean_gap_minutes"),
        ]
    )
    return (
        daily.join(span, on=["site_raw", "site_family", "date"], how="left")
        .with_columns(
            (
                1
                - pl.col("intrusion_episode_count")
                / pl.col("intrusion_events_for_burstiness").clip(lower_bound=1)
            ).alias("intrusion_episode_burstiness")
        )
        .drop("intrusion_events_for_burstiness")
    )


def build_site_feature_table(
    security_dir: Path,
    catalog_dir: Path,
    output_path: Path,
) -> pl.DataFrame:
    """Build one row per site/day with a next-calendar-day (24h) label."""

    daily_parts: list[pl.DataFrame] = []
    state_parts: list[pl.DataFrame] = []

    for path in sorted(security_dir.glob("*.parquet")):
        all_events = pl.read_parquet(path).unique(subset=EVENT_CORE, keep="first")
        security = _security_frame(path).with_columns(
            pl.col("тег_инженерной_системы")
            .str.strip_suffix(".")
            .str.replace(r"\.[^.]+$", "")
            .alias("zone_key")
        )
        expressions: list[pl.Expr] = [
            pl.len().alias("events_total"),
            pl.col("intrusion").sum().alias("intrusion_events"),
            pl.col("technical_alarm").sum().alias("technical_alarm_events"),
            pl.col("alarm").sum().alias("all_alarm_events"),
            pl.col("ид_канала_данных").n_unique().alias("active_channels"),
            pl.when(pl.col("intrusion") == 1)
            .then(pl.col("ид_канала_данных"))
            .otherwise(None)
            .drop_nulls()
            .n_unique()
            .alias("intrusion_channels"),
            ((pl.col("hour") < 7) | (pl.col("hour") >= 22))
            .cast(pl.Int8)
            .sum()
            .alias("night_events"),
            (
                pl.col("intrusion")
                * ((pl.col("hour") < 7) | (pl.col("hour") >= 22)).cast(pl.Int8)
            )
            .sum()
            .alias("night_intrusion_events"),
            (
                (pl.col("hour") < 8)
                | (pl.col("hour") >= 19)
                | (pl.col("weekday") >= 6)
            )
            .cast(pl.Int8)
            .sum()
            .alias("offhours_events"),
            (
                pl.col("intrusion")
                * (
                    (pl.col("hour") < 8)
                    | (pl.col("hour") >= 19)
                    | (pl.col("weekday") >= 6)
                ).cast(pl.Int8)
            )
            .sum()
            .alias("offhours_intrusion_events"),
            (pl.col("значение_датчика") == "Обнаружено движение")
            .cast(pl.Int8)
            .sum()
            .alias("movement_detected_events"),
            (
                (pl.col("значение_датчика") == "Обнаружено движение")
                & (pl.col("alarm") == 0)
            )
            .cast(pl.Int8)
            .sum()
            .alias("movement_nonalarm_events"),
            (pl.col("значение_датчика") == "Не замкнут")
            .cast(pl.Int8)
            .sum()
            .alias("open_events"),
            (
                (pl.col("значение_датчика") == "Не замкнут")
                & (pl.col("alarm") == 0)
            )
            .cast(pl.Int8)
            .sum()
            .alias("open_nonalarm_events"),
            pl.col("значение_датчика")
            .is_in(["Неисправен", "Отключено устройство"])
            .cast(pl.Int8)
            .sum()
            .alias("fault_state_events"),
        ]
        if "ид_объект" in security.columns:
            expressions.extend(
                [
                    pl.col("ид_объект")
                    .drop_nulls()
                    .n_unique()
                    .alias("active_object_ids"),
                    pl.when(pl.col("intrusion") == 1)
                    .then(pl.col("ид_объект"))
                    .otherwise(None)
                    .drop_nulls()
                    .n_unique()
                    .alias("intrusion_object_ids"),
                    pl.when(pl.col("technical_alarm") == 1)
                    .then(pl.col("ид_объект"))
                    .otherwise(None)
                    .drop_nulls()
                    .n_unique()
                    .alias("technical_alarm_object_ids"),
                    pl.col("object_parent_id")
                    .drop_nulls()
                    .n_unique()
                    .alias("active_parent_ids"),
                    pl.when(pl.col("intrusion") == 1)
                    .then(pl.col("object_parent_id"))
                    .otherwise(None)
                    .drop_nulls()
                    .n_unique()
                    .alias("intrusion_parent_ids"),
                ]
            )
        for sensor_name, slug in SENSOR_SLUGS.items():
            is_type = pl.col("тип_датчика") == sensor_name
            expressions.extend(
                [
                    is_type.cast(pl.Int8).sum().alias(f"{slug}_events"),
                    (is_type & (pl.col("intrusion") == 1))
                    .cast(pl.Int8)
                    .sum()
                    .alias(f"{slug}_intrusion_events"),
                ]
            )
        daily = security.group_by(["site_raw", "site_family", "date"]).agg(expressions)
        zone_daily = security.group_by(
            ["site_raw", "site_family", "date", "zone_key"]
        ).agg(
            [
                pl.len().alias("zone_events"),
                pl.col("intrusion").sum().alias("zone_intrusions"),
            ]
        )
        zone_summary = zone_daily.group_by(["site_raw", "site_family", "date"]).agg(
            [
                pl.len().alias("active_zones"),
                (pl.col("zone_intrusions") > 0).sum().alias("intrusion_zones"),
                pl.col("zone_events").max().alias("max_zone_events"),
                pl.col("zone_events").mean().alias("mean_zone_events"),
                pl.col("zone_events").std().fill_null(0).alias("std_zone_events"),
                pl.col("zone_intrusions").max().alias("max_zone_intrusions"),
            ]
        )
        episode_summary = _daily_intrusion_episode_features(security)
        daily_parts.append(
            daily.join(
                zone_summary,
                on=["site_raw", "site_family", "date"],
                how="left",
            ).join(
                episode_summary,
                on=["site_raw", "site_family", "date"],
                how="left",
            )
        )

        state_parts.append(
            all_events.filter(pl.col("тип_датчика") == GUARD_STATE_SENSOR)
            .with_columns(
                [
                    pl.col("ts").dt.date().alias("date"),
                    pl.col("ts").dt.hour().alias("hour"),
                ]
            )
            .group_by(["site_family", "date"])
            .agg(
                [
                    pl.len().alias("state_events"),
                    (pl.col("значение_датчика") == "На охране")
                    .cast(pl.Int8)
                    .sum()
                    .alias("armed_events"),
                    (pl.col("значение_датчика") == "Снято с охраны")
                    .cast(pl.Int8)
                    .sum()
                    .alias("disarmed_events"),
                    (pl.col("значение_датчика") == "Много неисправных устройств")
                    .cast(pl.Int8)
                    .sum()
                    .alias("state_fault_events"),
                    pl.when(pl.col("значение_датчика") == "На охране")
                    .then(pl.col("hour"))
                    .otherwise(None)
                    .max()
                    .fill_null(-1)
                    .alias("last_armed_hour"),
                    pl.when(pl.col("значение_датчика") == "Снято с охраны")
                    .then(pl.col("hour"))
                    .otherwise(None)
                    .max()
                    .fill_null(-1)
                    .alias("last_disarmed_hour"),
                ]
            )
        )

    observed = pl.concat(daily_parts).sort(["site_raw", "date"])
    state = pl.concat(state_parts)
    channels = read_channel_catalog(catalog_dir)
    security_channels = channels.filter(
        pl.col("тип_инж_системы") == SECURITY_SYSTEM
    )
    sites = (
        security_channels.group_by(["site_raw", "site_family"])
        .agg(
            [
                pl.len().alias("site_static_channels"),
                pl.col("ид_объект")
                .drop_nulls()
                .n_unique()
                .alias("site_static_object_count"),
                pl.col("object_parent_id")
                .drop_nulls()
                .n_unique()
                .alias("site_static_parent_count"),
                (pl.col("object_kind") == "guardObject")
                .sum()
                .alias("site_static_guard_channels"),
                (pl.col("object_kind") == "controlHouse")
                .sum()
                .alias("site_static_control_channels"),
                pl.col("object_parent_id")
                .drop_nulls()
                .cast(pl.String)
                .min()
                .fill_null("__UNKNOWN__")
                .alias("site_parent_id"),
                pl.col("ид_объект")
                .drop_nulls()
                .cast(pl.String)
                .unique()
                .sort()
                .str.join(" | ")
                .fill_null("")
                .alias("site_object_ids"),
                pl.col("dispatcher_object_name")
                .drop_nulls()
                .unique()
                .sort()
                .str.join(" | ")
                .fill_null("")
                .alias("site_dispatcher_objects"),
            ]
        )
        .sort("site_raw")
    )
    first_seen = observed.group_by("site_raw").agg(
        pl.col("date").min().alias("first_seen")
    )
    dates = pl.DataFrame(
        {
            "date": pl.date_range(
                observed["date"].min(), observed["date"].max(), interval="1d", eager=True
            )
        }
    )
    grid = (
        sites.join(first_seen, on="site_raw")
        .join(dates, how="cross")
        .filter(pl.col("date") >= pl.col("first_seen"))
        .drop("first_seen")
    )
    full = (
        grid.join(observed, on=["site_raw", "site_family", "date"], how="left")
        .join(state, on=["site_family", "date"], how="left")
        .sort(["site_raw", "date"])
        .with_columns(
            pl.col("events_total")
            .is_not_null()
            .cast(pl.Int8)
            .alias("site_day_observed")
        )
    )
    numeric = [
        name
        for name, dtype in full.schema.items()
        if name not in {"site_raw", "site_family", "date"} and dtype.is_numeric()
    ]
    full = full.with_columns([pl.col(name).fill_null(0) for name in numeric])
    full = (
        full.with_columns(
            [
                pl.col("intrusion_events").shift(-1).over("site_raw").alias("target_next_events"),
                pl.col("intrusion_zones").shift(-1).over("site_raw").alias("target_next_zones"),
                pl.col("date").shift(-1).over("site_raw").alias("next_date_check"),
            ]
        )
        .with_columns(
            [
                (pl.col("target_next_events") > 0).cast(pl.Int8).alias("target"),
                (pl.col("date") + pl.duration(days=1)).alias("target_date"),
            ]
        )
        .filter(
            (pl.col("next_date_check") == pl.col("target_date"))
            | pl.col("next_date_check").is_null()
        )
        .drop("next_date_check")
    )
    frame = _add_base_site_history(full.to_pandas())
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = pl.from_pandas(frame)
    result = _round_float_columns(result)
    result.write_parquet(output_path, compression="zstd", statistics=True)
    return result


def _add_base_site_history(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.sort_values(["site_raw", "date"]).reset_index(drop=True)
    frame["date"] = pd.to_datetime(frame["date"])
    frame["target_date"] = pd.to_datetime(frame["target_date"])
    calendar = {
        "target_dow": frame["target_date"].dt.dayofweek,
        "target_month": frame["target_date"].dt.month,
        "target_doy": frame["target_date"].dt.dayofyear,
    }
    calendar["target_weekend"] = (calendar["target_dow"] >= 5).astype("int8")
    calendar["target_doy_sin"] = np.sin(2 * np.pi * calendar["target_doy"] / 365.25)
    calendar["target_doy_cos"] = np.cos(2 * np.pi * calendar["target_doy"] / 365.25)
    calendar["target_dow_sin"] = np.sin(2 * np.pi * calendar["target_dow"] / 7)
    calendar["target_dow_cos"] = np.cos(2 * np.pi * calendar["target_dow"] / 7)
    frame = pd.concat([frame, pd.DataFrame(calendar, index=frame.index)], axis=1)

    rolling_columns = [
        "intrusion_events",
        "intrusion_zones",
        "intrusion_channels",
        "technical_alarm_events",
        "events_total",
        "active_channels",
        "active_zones",
        "night_intrusion_events",
        "offhours_intrusion_events",
        "movement_detected_events",
        "movement_nonalarm_events",
        "open_events",
        "open_nonalarm_events",
        "fault_state_events",
        "active_object_ids",
        "intrusion_object_ids",
        "technical_alarm_object_ids",
        "active_parent_ids",
        "intrusion_parent_ids",
        "intrusion_episode_count",
        "intrusion_multi_event_episodes",
        "intrusion_motion_contact_episodes",
        "intrusion_episode_max_events",
        "intrusion_episode_max_zones",
        "intrusion_zone_transitions",
        "intrusion_active_hours",
        "armed_events",
        "disarmed_events",
        "state_fault_events",
        "site_day_observed",
    ]
    mean_columns = {
        "intrusion_events",
        "intrusion_zones",
        "technical_alarm_events",
        "events_total",
        "active_channels",
        "active_zones",
        "active_object_ids",
        "intrusion_object_ids",
        "technical_alarm_object_ids",
        "active_parent_ids",
        "intrusion_parent_ids",
        "intrusion_episode_count",
        "intrusion_multi_event_episodes",
        "intrusion_motion_contact_episodes",
        "intrusion_episode_max_events",
        "intrusion_episode_max_zones",
        "intrusion_zone_transitions",
        "intrusion_active_hours",
        "armed_events",
        "disarmed_events",
        "site_day_observed",
    }
    rolling_columns = [
        column for column in rolling_columns if column in frame.columns
    ]
    groups = frame.groupby("site_raw", sort=False)
    history: dict[str, pd.Series] = {}
    for column in rolling_columns:
        for lag in (1, 2, 3, 7, 14, 28):
            history[f"{column}_lag{lag}"] = groups[column].shift(lag).fillna(0)
        for window in (3, 7, 14, 28, 56, 90):
            history[f"{column}_sum{window}"] = (
                groups[column].rolling(window, min_periods=1).sum().reset_index(level=0, drop=True)
            )
            if column in mean_columns:
                history[f"{column}_mean{window}"] = (
                    groups[column]
                    .rolling(window, min_periods=1)
                    .mean()
                    .reset_index(level=0, drop=True)
                )
    frame = pd.concat([frame, pd.DataFrame(history, index=frame.index)], axis=1)
    last_date = frame["date"].where(frame["intrusion_events"] > 0).groupby(frame["site_raw"]).ffill()
    last_observed_date = (
        frame["date"]
        .where(frame["site_day_observed"] > 0)
        .groupby(frame["site_raw"])
        .ffill()
    )
    derived = {
        "days_since_intrusion": (frame["date"] - last_date).dt.days.fillna(9999).clip(0, 9999),
        "days_since_site_observation": (
            (frame["date"] - last_observed_date).dt.days.fillna(9999).clip(0, 9999)
        ),
        "history_days": groups.cumcount() + 1,
        "past_positive_days": groups["intrusion_events"].transform(lambda values: (values > 0).cumsum()),
        "past_intrusion_events": groups["intrusion_events"].cumsum(),
        "current_intrusion_per_active_channel": frame["intrusion_events"]
        / (frame["active_channels"] + 1),
        "current_night_intrusion_share": frame["night_intrusion_events"]
        / (frame["intrusion_events"] + 1),
        "current_offhours_intrusion_share": frame["offhours_intrusion_events"]
        / (frame["intrusion_events"] + 1),
        "current_motion_alarm_rate": frame["motion_intrusion_events"]
        / (frame["motion_events"] + 1),
        "current_open_alarm_rate": (
            frame["door_intrusion_events"]
            + frame["av_contact_intrusion_events"]
            + frame["hatch_intrusion_events"]
            + frame["glass_intrusion_events"]
        )
        / (frame["open_events"] + 1),
        "episode_rate_trend_7_28": (
            frame["intrusion_episode_count_mean7"]
            - frame["intrusion_episode_count_mean28"]
        ),
        "multi_event_episode_rate28": frame["intrusion_multi_event_episodes_sum28"]
        / (frame["intrusion_episode_count_sum28"] + 1),
        "motion_contact_episode_rate28": frame[
            "intrusion_motion_contact_episodes_sum28"
        ]
        / (frame["intrusion_episode_count_sum28"] + 1),
        "intrusion_event_per_episode28": frame["intrusion_events_sum28"]
        / (frame["intrusion_episode_count_sum28"] + 1),
        "zone_transition_per_episode28": frame["intrusion_zone_transitions_sum28"]
        / (frame["intrusion_episode_count_sum28"] + 1),
        "observation_rate_trend_7_28": (
            frame["site_day_observed_mean7"] - frame["site_day_observed_mean28"]
        ),
        "fault_rate_trend_7_28": (
            frame["technical_alarm_events_mean7"]
            - frame["technical_alarm_events_mean28"]
        ),
    }
    derived["past_positive_rate"] = derived["past_positive_days"] / derived["history_days"]
    if "active_object_ids" in frame.columns:
        derived["current_object_coverage"] = frame["active_object_ids"] / (
            frame["site_static_object_count"] + 1
        )
        derived["current_intrusion_object_share"] = frame[
            "intrusion_object_ids"
        ] / (frame["active_object_ids"] + 1)
        derived["object_coverage_trend_7_28"] = (
            frame["active_object_ids_mean7"]
            - frame["active_object_ids_mean28"]
        )
    return pd.concat([frame, pd.DataFrame(derived, index=frame.index)], axis=1)


def build_context_daily(
    csv_dir: Path,
    catalog_dir: Path,
    years: Iterable[int],
    output_path: Path,
) -> pl.DataFrame:
    """Aggregate all engineering systems to site-family/day context."""

    channels = read_channel_catalog(catalog_dir)
    known_ids = channels["ид_канала_данных"].to_list()
    parts: list[pl.DataFrame] = []
    for year in years:
        frame = (
            scan_journal(csv_dir / f"ext-journal-{year}.csv")
            .filter(pl.col("ид_канала_данных").is_in(known_ids))
            .unique(subset=list(JOURNAL_COLUMNS), keep="first")
            .join(channels.lazy(), on="ид_канала_данных", how="inner")
            .with_columns(
                [
                    pl.col("дата").str.to_date("%Y-%m-%d").alias("date"),
                    pl.col("время").str.slice(0, 2).cast(pl.Int8, strict=False).alias("hour"),
                    alarm_flag_expression().alias("is_alarm"),
                    pl.col("значение_датчика")
                    .str.replace(",", ".")
                    .cast(pl.Float64, strict=False)
                    .alias("numeric_value"),
                ]
            )
        )
        expressions: list[pl.Expr] = [
            pl.len().alias("ctx_events_total"),
            pl.col("is_alarm").sum().alias("ctx_alarms_total"),
            pl.col("ид_канала_данных").n_unique().alias("ctx_active_channels"),
            ((pl.col("hour") < 7) | (pl.col("hour") >= 22))
            .cast(pl.Int8)
            .sum()
            .alias("ctx_night_events"),
        ]
        for label, slug in SYSTEM_SLUGS.items():
            condition = pl.col("тип_инж_системы") == label
            expressions.extend(
                [
                    condition.cast(pl.Int8).sum().alias(f"ctx_{slug}_events"),
                    (condition & (pl.col("is_alarm") == 1))
                    .cast(pl.Int8)
                    .sum()
                    .alias(f"ctx_{slug}_alarms"),
                ]
            )
        for label, slug in CONTEXT_SENSOR_SLUGS.items():
            condition = pl.col("тип_датчика") == label
            expressions.extend(
                [
                    condition.cast(pl.Int8).sum().alias(f"ctx_{slug}_events"),
                    (condition & (pl.col("is_alarm") == 1))
                    .cast(pl.Int8)
                    .sum()
                    .alias(f"ctx_{slug}_alarms"),
                ]
            )
        for sensor, slug in (("Датчик температуры", "temp"), ("Газовый датчик", "gas")):
            value = pl.when(pl.col("тип_датчика") == sensor).then(
                pl.col("numeric_value")
            ).otherwise(None)
            # Decimal sensor values are quantised before the mean so parallel
            # reductions cannot change a last-bit rounding decision.
            scaled_value = pl.when(pl.col("тип_датчика") == sensor).then(
                (pl.col("numeric_value") * 1_000_000).round(0).cast(pl.Int64)
            ).otherwise(None)
            scaled_count = scaled_value.count()
            expressions.extend(
                [
                    pl.when(scaled_count > 0)
                    .then(scaled_value.sum() / scaled_count / 1_000_000)
                    .otherwise(None)
                    .alias(f"ctx_{slug}_value_mean"),
                    value.std().fill_null(0).alias(f"ctx_{slug}_value_std"),
                    value.min().alias(f"ctx_{slug}_value_min"),
                    value.max().alias(f"ctx_{slug}_value_max"),
                ]
            )
        parts.append(
            frame.group_by(["site_family", "date"])
            .agg(expressions)
            .collect(engine="streaming")
        )
    result = pl.concat(parts).sort(["site_family", "date"])
    if result.select(pl.struct(["site_family", "date"]).n_unique()).item() != result.height:
        raise ValueError("Context table contains duplicate family/date keys")
    result = _round_float_columns(result, decimals=6)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.write_parquet(output_path, compression="zstd", statistics=True)
    return result


def augment_site_model_frame(
    site_path: Path,
    *,
    context_path: Path | None = None,
    weekly: bool = False,
) -> pd.DataFrame:
    """Add model-variant features without touching labels or future observations."""

    site = pl.read_parquet(site_path).with_columns(pl.col("date").dt.date())
    context_columns: list[str] = []
    if context_path is not None:
        context = pl.read_parquet(context_path)
        context_columns = [name for name in context.columns if name not in {"site_family", "date"}]
        site = site.join(context, on=["site_family", "date"], how="left")
    frame = site.to_pandas().sort_values(["site_raw", "date"]).reset_index(drop=True)
    frame["date"] = pd.to_datetime(frame["date"])
    frame["target_date"] = pd.to_datetime(frame["target_date"])
    for column in context_columns:
        frame[column] = frame[column].fillna(0)
    frame["current_intrusion_day"] = (frame["intrusion_events"] > 0).astype("int8")
    groups = frame.groupby("site_raw", sort=False)
    extra: dict[str, pd.Series] = {}
    for window in (3, 7, 14, 28, 56, 90, 180, 365):
        extra[f"positive_day_rate{window}"] = (
            groups["current_intrusion_day"]
            .rolling(window, min_periods=1)
            .mean()
            .reset_index(level=0, drop=True)
        )
    base_lags = (1, 2, 3, 7, 14, 28)
    for lag in base_lags:
        extra[f"intrusion_day_lag{lag}"] = groups["current_intrusion_day"].shift(lag).fillna(0)

    if weekly:
        weekly_lags = [6 + 7 * index for index in range(52)]
        weekly_days = [groups["current_intrusion_day"].shift(lag) for lag in weekly_lags]
        weekly_events = [np.log1p(groups["intrusion_events"].shift(lag)) for lag in weekly_lags]
        for lag in (6, 13, 20, 27, 34, 41, 48, 55, 364):
            extra[f"intrusion_day_lag{lag}"] = (
                groups["current_intrusion_day"].shift(lag).fillna(0)
            )
        for weeks in (4, 8, 13, 26, 52):
            extra[f"same_target_weekday_rate_{weeks}w"] = (
                pd.concat(weekly_days[:weeks], axis=1).mean(axis=1).fillna(0)
            )
            extra[f"same_target_weekday_logevents_{weeks}w"] = (
                pd.concat(weekly_events[:weeks], axis=1).mean(axis=1).fillna(0)
            )
        extra["same_weekday_rate_trend_4_13"] = (
            extra["same_target_weekday_rate_4w"] - extra["same_target_weekday_rate_13w"]
        )
        extra["same_weekday_rate_trend_8_26"] = (
            extra["same_target_weekday_rate_8w"] - extra["same_target_weekday_rate_26w"]
        )

    if context_columns:
        rolling_context = [
            name
            for name in context_columns
            if name.endswith(("_events", "_alarms"))
            or name in {"ctx_events_total", "ctx_alarms_total", "ctx_active_channels", "ctx_night_events"}
        ]
        for column in rolling_context:
            extra[f"{column}_lag1"] = groups[column].shift(1).fillna(0)
            extra[f"{column}_lag7"] = groups[column].shift(7).fillna(0)
            for window in (7, 28, 90):
                extra[f"{column}_mean{window}"] = (
                    groups[column]
                    .rolling(window, min_periods=1)
                    .mean()
                    .reset_index(level=0, drop=True)
                )
    frame = pd.concat([frame, pd.DataFrame(extra, index=frame.index)], axis=1)

    russian_holidays = holidays.RU(
        years=range(frame["target_date"].dt.year.min(), frame["target_date"].dt.year.max() + 2),
        observed=True,
    )
    target_days = frame["target_date"].dt.date
    calendar = {
        "target_holiday": [int(day in russian_holidays) for day in target_days],
        "target_preholiday": [
            int((day + pd.Timedelta(days=1)) in russian_holidays) for day in target_days
        ],
        "target_postholiday": [
            int((day - pd.Timedelta(days=1)) in russian_holidays) for day in target_days
        ],
    }
    calendar["target_workday"] = (
        (frame["target_dow"] < 5) & (np.asarray(calendar["target_holiday"]) == 0)
    ).astype("int8")
    frame = pd.concat([frame, pd.DataFrame(calendar, index=frame.index)], axis=1)
    if context_columns:
        frame["ctx_nonsecurity_alarm_rate"] = (
            (frame["ctx_alarms_total"] - frame["ctx_security_alarms"]).clip(lower=0)
            / ((frame["ctx_events_total"] - frame["ctx_security_events"]).clip(lower=0) + 1)
        )
        frame["ctx_dispatch_alarm_rate"] = frame["ctx_dispatch_alarms"] / (
            frame["ctx_dispatch_events"] + 1
        )
        frame["ctx_fire_alarm_rate"] = frame["ctx_fire_alarms"] / (
            frame["ctx_fire_events"] + 1
        )
    return frame


def augment_zone_model_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Add the exact calendar fields shared by zone training and inference."""

    frame = frame.copy()
    frame["target_date"] = pd.to_datetime(frame["target_date"])
    frame["date"] = pd.to_datetime(frame["date"])
    russian_holidays = holidays.RU(
        years=range(
            frame["target_date"].dt.year.min(),
            frame["target_date"].dt.year.max() + 2,
        ),
        observed=True,
    )
    frame["target_holiday"] = [
        int(day in russian_holidays) for day in frame["target_date"].dt.date
    ]
    frame["target_workday"] = (
        (frame["target_weekday"] <= 5) & (frame["target_holiday"] == 0)
    ).astype("int8")
    return frame


def build_zone_feature_table(
    security_dir: Path,
    catalog_dir: Path,
    site_feature_path: Path,
    output_path: Path,
) -> pl.DataFrame:
    """Build a compact zone/day table for conditional within-site ranking."""

    parts: list[pl.DataFrame] = []
    for path in sorted(security_dir.glob("*.parquet")):
        frame = _security_frame(path).with_columns(
            pl.col("тег_инженерной_системы")
            .str.strip_suffix(".")
            .str.replace(r"\.[^.]+$", "")
            .alias("zone_key")
        )
        expressions: list[pl.Expr] = [
            pl.len().alias("zone_events"),
            pl.col("intrusion").sum().alias("zone_intrusion_events"),
            pl.col("technical_alarm").sum().alias("zone_technical_alarm_events"),
            pl.col("ид_канала_данных").n_unique().alias("zone_active_channels"),
            pl.col("hour").n_unique().alias("zone_active_hours"),
            pl.col("hour").min().alias("zone_first_event_hour"),
            pl.col("hour").max().alias("zone_last_event_hour"),
            ((pl.col("hour") < 7) | (pl.col("hour") >= 22))
            .cast(pl.Int8)
            .sum()
            .alias("zone_night_events"),
            (
                pl.col("intrusion")
                * ((pl.col("hour") < 7) | (pl.col("hour") >= 22)).cast(pl.Int8)
            )
            .sum()
            .alias("zone_night_intrusions"),
            (
                (pl.col("hour") < 8)
                | (pl.col("hour") >= 19)
                | (pl.col("weekday") >= 6)
            )
            .cast(pl.Int8)
            .sum()
            .alias("zone_offhours_events"),
            (
                pl.col("intrusion")
                * (
                    (pl.col("hour") < 8)
                    | (pl.col("hour") >= 19)
                    | (pl.col("weekday") >= 6)
                ).cast(pl.Int8)
            )
            .sum()
            .alias("zone_offhours_intrusions"),
            (pl.col("значение_датчика") == "Обнаружено движение")
            .cast(pl.Int8)
            .sum()
            .alias("zone_movement_events"),
            (pl.col("значение_датчика") == "Не замкнут")
            .cast(pl.Int8)
            .sum()
            .alias("zone_open_events"),
        ]
        if "ид_объект" in frame.columns:
            expressions.extend(
                [
                    pl.col("ид_объект")
                    .drop_nulls()
                    .n_unique()
                    .alias("zone_active_object_ids"),
                    pl.when(pl.col("intrusion") == 1)
                    .then(pl.col("ид_объект"))
                    .otherwise(None)
                    .drop_nulls()
                    .n_unique()
                    .alias("zone_intrusion_object_ids"),
                    pl.col("object_parent_id")
                    .drop_nulls()
                    .n_unique()
                    .alias("zone_active_parent_ids"),
                ]
            )
        for sensor_name, slug in SENSOR_SLUGS.items():
            is_type = pl.col("тип_датчика") == sensor_name
            expressions.extend(
                [
                    is_type.cast(pl.Int8).sum().alias(f"zone_{slug}_events"),
                    (is_type & (pl.col("intrusion") == 1))
                    .cast(pl.Int8)
                    .sum()
                    .alias(f"zone_{slug}_intrusions"),
                ]
            )
        parts.append(
            frame.group_by(["site_raw", "site_family", "zone_key", "date"]).agg(expressions)
        )
    observed = pl.concat(parts).sort(["zone_key", "date"])
    channels = read_channel_catalog(catalog_dir).filter(
        pl.col("тип_инж_системы") == SECURITY_SYSTEM
    )
    static_expressions: list[pl.Expr] = [
        pl.len().alias("static_channels"),
        pl.col("тип_датчика").n_unique().alias("static_sensor_types"),
        pl.col("ид_объект")
        .drop_nulls()
        .n_unique()
        .alias("static_object_count"),
        pl.col("object_parent_id")
        .drop_nulls()
        .n_unique()
        .alias("static_parent_count"),
        (pl.col("object_kind") == "guardObject")
        .sum()
        .alias("static_guard_object_channels"),
        (pl.col("object_kind") == "controlHouse")
        .sum()
        .alias("static_control_house_channels"),
        pl.col("ид_объект")
        .drop_nulls()
        .cast(pl.String)
        .min()
        .fill_null("__UNKNOWN__")
        .alias("zone_primary_object_id"),
        pl.col("object_parent_id")
        .drop_nulls()
        .cast(pl.String)
        .min()
        .fill_null("__UNKNOWN__")
        .alias("zone_primary_parent_id"),
        pl.col("ид_объект")
        .drop_nulls()
        .cast(pl.String)
        .unique()
        .sort()
        .str.join(" | ")
        .fill_null("")
        .alias("zone_object_ids"),
        pl.col("dispatcher_object_name")
        .drop_nulls()
        .unique()
        .sort()
        .str.join(" | ")
        .fill_null("")
        .alias("zone_dispatcher_objects"),
    ]
    for sensor_name, slug in SENSOR_SLUGS.items():
        static_expressions.append(
            (pl.col("тип_датчика") == sensor_name)
            .sum()
            .alias(f"static_{slug}_channels")
        )
    zones = channels.group_by(["site_raw", "site_family", "zone_key"]).agg(
        static_expressions
    )
    first_seen = observed.group_by("zone_key").agg(
        pl.col("date").min().alias("first_seen")
    )
    dates = pl.DataFrame(
        {
            "date": pl.date_range(
                observed["date"].min(), observed["date"].max(), interval="1d", eager=True
            )
        }
    )
    full = (
        zones.join(first_seen, on="zone_key")
        .join(dates, how="cross")
        .filter(pl.col("date") >= pl.col("first_seen"))
        .drop("first_seen")
        .join(observed, on=["site_raw", "site_family", "zone_key", "date"], how="left")
        .sort(["zone_key", "date"])
        .with_columns(
            pl.col("zone_events")
            .is_not_null()
            .cast(pl.Int8)
            .alias("zone_day_observed")
        )
    )
    daily_columns = [
        name for name in observed.columns if name not in {"site_raw", "site_family", "zone_key", "date"}
    ]
    full = full.with_columns([pl.col(name).fill_null(0) for name in daily_columns])
    full = full.with_columns(
        (pl.col("zone_intrusion_events") > 0).cast(pl.Int8).alias("zone_intrusion_day")
    )
    full = (
        full.with_columns(
            [
                pl.col("zone_intrusion_events")
                .shift(-1)
                .over("zone_key")
                .alias("target_next_zone_events"),
                pl.col("date").shift(-1).over("zone_key").alias("next_date_check"),
            ]
        )
        .with_columns(
            [
                (pl.col("target_next_zone_events") > 0).cast(pl.Int8).alias("target"),
                (pl.col("date") + pl.duration(days=1)).alias("target_date"),
            ]
        )
        .filter(
            (pl.col("next_date_check") == pl.col("target_date"))
            | pl.col("next_date_check").is_null()
        )
        .drop("next_date_check")
        .with_columns(
            [
                pl.col("target_date").dt.weekday().alias("target_weekday"),
                pl.col("target_date").dt.month().alias("target_month"),
                pl.col("target_date").dt.ordinal_day().alias("target_doy"),
                (pl.col("target_date").dt.weekday() >= 6)
                .cast(pl.Int8)
                .alias("target_weekend"),
            ]
        )
    )
    lag_expressions: list[pl.Expr] = []
    for lag in (1, 2, 3, 6, 7, 13, 14, 20, 27, 28, 34, 41, 48, 55, 90, 180, 364):
        lag_expressions.append(
            pl.col("zone_intrusion_day")
            .shift(lag)
            .over("zone_key")
            .fill_null(0)
            .alias(f"zone_intrusion_day_lag{lag}")
        )
    rolling_sources = (
        "zone_intrusion_events",
        "zone_events",
        "zone_technical_alarm_events",
        "zone_movement_events",
        "zone_open_events",
        "zone_active_channels",
        "zone_active_hours",
        "zone_day_observed",
        "zone_active_object_ids",
        "zone_intrusion_object_ids",
        "zone_active_parent_ids",
    )
    rolling_sources = tuple(
        column for column in rolling_sources if column in full.columns
    )
    for column in rolling_sources:
        for lag in (1, 7, 28):
            lag_expressions.append(
                pl.col(column)
                .shift(lag)
                .over("zone_key")
                .fill_null(0)
                .alias(f"{column}_lag{lag}")
            )
    full = full.with_columns(lag_expressions)
    rolling_expressions = [
        pl.col("zone_intrusion_day")
        .rolling_mean(window, min_samples=1)
        .over("zone_key")
        .alias(f"zone_positive_rate{window}")
        for window in (3, 7, 14, 28, 56, 90, 180, 365)
    ]
    for column in rolling_sources:
        for window in (7, 28, 90, 365):
            rolling_expressions.append(
                pl.col(column)
                .rolling_mean(window, min_samples=1)
                .over("zone_key")
                .alias(f"{column}_mean{window}")
            )
    full = full.with_columns(rolling_expressions)
    for weeks in (4, 8, 13, 26, 52):
        full = full.with_columns(
            pl.mean_horizontal(
                [
                    pl.col("zone_intrusion_day").shift(6 + 7 * index).over("zone_key")
                    for index in range(weeks)
                ]
            )
            .fill_null(0)
            .alias(f"zone_same_target_weekday_rate{weeks}w")
        )
    full = (
        full.with_columns(
            pl.when(pl.col("zone_intrusion_day") == 1)
            .then(pl.col("date"))
            .otherwise(None)
            .forward_fill()
            .over("zone_key")
            .alias("_last_intrusion_date")
        )
        .with_columns(
            (pl.col("date") - pl.col("_last_intrusion_date"))
            .dt.total_days()
            .fill_null(9999)
            .alias("zone_days_since_intrusion")
        )
        .drop("_last_intrusion_date")
        .with_columns(
            [
                pl.col("zone_intrusion_day")
                .cum_sum()
                .over("zone_key")
                .alias("zone_past_positive_days"),
                pl.col("date").cum_count().over("zone_key").alias("zone_history_days"),
            ]
        )
        .with_columns(
            (pl.col("zone_past_positive_days") / pl.col("zone_history_days"))
            .fill_nan(0)
            .alias("zone_past_positive_rate")
        )
    )
    site = pl.read_parquet(site_feature_path).with_columns(pl.col("date").dt.date())
    site_columns = [
        "events_total",
        "intrusion_events",
        "technical_alarm_events",
        "active_channels",
        "active_zones",
        "intrusion_zones",
        "night_intrusion_events",
        "offhours_intrusion_events",
        "armed_events",
        "disarmed_events",
        "state_fault_events",
        "days_since_intrusion",
        "past_positive_rate",
        "intrusion_events_mean7",
        "intrusion_events_mean28",
        "intrusion_events_mean90",
        "intrusion_zones_mean28",
        "active_zones_mean28",
        "site_static_channels",
        "site_static_object_count",
        "site_static_parent_count",
        "site_static_guard_channels",
        "site_static_control_channels",
        "active_object_ids",
        "intrusion_object_ids",
        "active_parent_ids",
        "current_object_coverage",
        "target_dow",
        "target_month",
        "target_doy",
        "target_weekend",
    ]
    site = site.select(["site_raw", "date", *site_columns]).rename(
        {name: f"site_{name}" for name in site_columns}
    )
    full = full.join(site, on=["site_raw", "date"], how="left")
    site_numeric = [name for name in full.columns if name.startswith("site_") and name != "site_raw"]
    full = full.with_columns([pl.col(name).fill_null(0) for name in site_numeric])
    full = full.with_columns(
        [
            (pl.col("zone_intrusion_events") / (pl.col("zone_events") + 1)).alias(
                "zone_current_alarm_rate"
            ),
            (
                pl.col("zone_intrusion_events") / (pl.col("zone_active_channels") + 1)
            ).alias("zone_current_alarm_per_channel"),
            (pl.col("target_doy") * 2 * np.pi / 365.25).sin().alias("target_doy_sin"),
            (pl.col("target_doy") * 2 * np.pi / 365.25).cos().alias("target_doy_cos"),
            (pl.col("target_weekday") * 2 * np.pi / 7).sin().alias("target_dow_sin"),
            (pl.col("target_weekday") * 2 * np.pi / 7).cos().alias("target_dow_cos"),
        ]
    )
    full = _round_float_columns(full)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    full.write_parquet(output_path, compression="zstd", statistics=True)
    return full
