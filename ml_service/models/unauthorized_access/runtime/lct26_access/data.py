"""Extraction, schema validation, and compact event materialisation."""

from __future__ import annotations

import json
import shutil
import subprocess
import zipfile
from collections.abc import Iterable
from pathlib import Path

import polars as pl

from .constants import GUARD_STATE_SENSOR, JOURNAL_COLUMNS, SECURITY_SYSTEM

TRUE_ALARM_TOKENS = ("1", "t", "true")


def alarm_flag_expression(column: str = "тревожное") -> pl.Expr:
    """Normalize the historical t/f and example-file true/false encodings."""

    return (
        pl.col(column)
        .cast(pl.String)
        .str.to_lowercase()
        .str.strip_chars()
        .is_in(TRUE_ALARM_TOKENS)
        .fill_null(False)
        .cast(pl.Int8)
    )


def _resolve_dataset_dir(root: Path) -> Path:
    candidate = root / "dataset"
    return candidate if candidate.is_dir() else root


def extract_dataset(dataset_zip: Path, work_dir: Path) -> tuple[Path, Path]:
    """Extract the outer ZIP and all yearly 7z journals.

    Returns ``(catalog_dir, csv_dir)``. Existing non-empty files are reused. The
    function prefers libarchive's ``bsdtar`` and falls back to the 7-Zip CLI.
    """

    dataset_zip = dataset_zip.expanduser().resolve()
    work_dir = work_dir.expanduser().resolve()
    outer_dir = work_dir / "raw_outer"
    csv_dir = work_dir / "raw_csv"
    outer_dir.mkdir(parents=True, exist_ok=True)
    csv_dir.mkdir(parents=True, exist_ok=True)

    if not dataset_zip.is_file():
        raise FileNotFoundError(dataset_zip)

    marker = outer_dir / ".zip_extracted"
    if not marker.exists():
        with zipfile.ZipFile(dataset_zip) as archive:
            archive.extractall(outer_dir)
        marker.touch()

    catalog_dir = _resolve_dataset_dir(outer_dir)
    extractor = shutil.which("bsdtar") or shutil.which("7zz") or shutil.which("7z")
    if extractor is None:
        raise RuntimeError("Need bsdtar, 7zz, or 7z to extract yearly journal archives")

    for archive in sorted(catalog_dir.glob("ext-journal-*.7z")):
        output = csv_dir / f"{archive.stem}.csv"
        if output.is_file() and output.stat().st_size > 0:
            continue
        if Path(extractor).name == "bsdtar":
            subprocess.run(
                [extractor, "-xf", str(archive), "-C", str(csv_dir)], check=True
            )
        else:
            subprocess.run(
                [extractor, "x", "-y", f"-o{csv_dir}", str(archive)], check=True
            )
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError(f"Extraction did not create {output}")
    return catalog_dir, csv_dir


def read_channel_catalog(catalog_dir: Path) -> pl.DataFrame:
    path = catalog_dir / "справочник_каналов_датчиков.csv"
    frame = pl.read_csv(path, infer_schema_length=20_000)
    required = {
        "ид_канала_данных",
        "тип_инж_системы",
        "тип_датчика",
        "тег_инженерной_системы",
        "название_датчика",
    }
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Channel catalog lacks columns: {sorted(missing)}")
    if frame["ид_канала_данных"].n_unique() != frame.height:
        raise ValueError("Channel IDs must be unique in the channel catalog")
    frame = frame.with_columns(
        [
            pl.col("тег_инженерной_системы")
            .str.split(".")
            .list.get(0)
            .alias("site_raw"),
            pl.col("тег_инженерной_системы")
            .str.split(".")
            .list.get(0)
            .str.split("-")
            .list.get(0)
            .alias("site_family"),
            pl.col("тег_инженерной_системы")
            .str.strip_suffix(".")
            .str.replace(r"\.[^.]+$", "")
            .alias("zone_key"),
        ]
    )
    object_columns = {
        "ид_объект",
        "иерархия_уровень",
        "родитель",
        "вид_объекта",
        "диспетчерское_название_объекта",
    }
    object_path = catalog_dir / "справочник_объектов_диспетчер.csv"
    if "ид_объект" in frame.columns and object_path.is_file():
        objects = pl.read_csv(object_path, infer_schema_length=10_000)
        missing_object_columns = object_columns.difference(objects.columns)
        if missing_object_columns:
            raise ValueError(
                "Object catalog lacks columns: "
                f"{sorted(missing_object_columns)}"
            )
        if objects["ид_объект"].n_unique() != objects.height:
            raise ValueError("Object IDs must be unique in the object catalog")
        objects = objects.select(
            [
                pl.col("ид_объект").cast(pl.Int64),
                pl.col("иерархия_уровень")
                .cast(pl.Int64)
                .alias("object_level"),
                pl.col("родитель").cast(pl.Int64).alias("object_parent_id"),
                pl.col("вид_объекта").cast(pl.String).alias("object_kind"),
                pl.col("диспетчерское_название_объекта")
                .cast(pl.String)
                .alias("dispatcher_object_name"),
            ]
        )
        frame = frame.with_columns(pl.col("ид_объект").cast(pl.Int64)).join(
            objects,
            on="ид_объект",
            how="left",
            validate="m:1",
        )
        if frame["dispatcher_object_name"].null_count() > 0:
            raise ValueError("Some channel object IDs are absent from object catalog")
    else:
        frame = frame.with_columns(
            [
                pl.lit(None, dtype=pl.Int64).alias("ид_объект"),
                pl.lit(None, dtype=pl.Int64).alias("object_level"),
                pl.lit(None, dtype=pl.Int64).alias("object_parent_id"),
                pl.lit(None, dtype=pl.String).alias("object_kind"),
                pl.lit(None, dtype=pl.String).alias("dispatcher_object_name"),
            ]
        )
    return frame


def scan_journal(path: Path) -> pl.LazyFrame:
    """Read a journal defensively with every source field initially as text.

    The 2025 file contains a repeated header in the middle. Casting with
    ``strict=False`` and removing null IDs keeps valid rows while making that
    defect explicit and reproducible.
    """

    frame = pl.scan_csv(path, infer_schema_length=0)
    missing = set(JOURNAL_COLUMNS).difference(frame.collect_schema().names())
    if missing:
        raise ValueError(f"{path.name} lacks journal columns: {sorted(missing)}")
    return frame.with_columns(
        [
            pl.col("ид_события").cast(pl.Int64, strict=False),
            pl.col("ид_канала_данных").cast(pl.Int64, strict=False),
        ]
    )


def materialize_security_events(
    catalog_dir: Path,
    csv_dir: Path,
    cache_dir: Path,
    years: Iterable[int],
) -> dict[str, object]:
    """Create compact yearly Parquet files for security and guard-state events."""

    channels = read_channel_catalog(catalog_dir)
    relevant = channels.filter(
        (pl.col("тип_инж_системы") == SECURITY_SYSTEM)
        | (pl.col("тип_датчика") == GUARD_STATE_SENSOR)
    )
    relevant_ids = relevant["ид_канала_данных"].to_list()
    out_dir = cache_dir / "security_events"
    out_dir.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {
        "years": {},
        "channel_catalog_rows": channels.height,
        "channel_object_mapping": {
            "mapped_channels": int(channels["ид_объект"].is_not_null().sum()),
            "unique_object_ids": int(channels["ид_объект"].n_unique()),
            "security_mapped_channels": int(
                channels.filter(pl.col("тип_инж_системы") == SECURITY_SYSTEM)[
                    "ид_объект"
                ]
                .is_not_null()
                .sum()
            ),
        },
    }

    for year in years:
        raw_path = csv_dir / f"ext-journal-{year}.csv"
        out_path = out_dir / f"{year}.parquet"
        invalid = (
            scan_journal(raw_path)
            .select(
                (
                    pl.col("ид_события").is_null()
                    | pl.col("ид_канала_данных").is_null()
                )
                .sum()
                .alias("invalid_or_repeated_header_rows")
            )
            .collect(engine="streaming")
            .item()
        )
        frame = (
            scan_journal(raw_path)
            .filter(pl.col("ид_канала_данных").is_in(relevant_ids))
            .join(relevant.lazy(), on="ид_канала_данных", how="left")
            .with_columns(
                [
                    (pl.col("дата") + " " + pl.col("время"))
                    .str.to_datetime("%Y-%m-%d %H:%M:%S")
                    .alias("ts"),
                    alarm_flag_expression().alias("alarm"),
                ]
            )
            .drop(["дата", "время", "тревожное"])
            .collect(engine="streaming")
            .sort("ts")
        )
        frame.write_parquet(out_path, compression="zstd", statistics=True)
        core = ["ид_события", "ид_канала_данных", "значение_датчика", "ts", "alarm"]
        duplicate_core = frame.height - frame.select(pl.struct(core).n_unique()).item()
        duplicate_ids = frame.height - frame["ид_события"].n_unique()
        report["years"][str(year)] = {
            "rows": frame.height,
            "min_ts": frame["ts"].min().isoformat(),
            "max_ts": frame["ts"].max().isoformat(),
            "alarm_rows": int(frame["alarm"].sum()),
            "channels": frame["ид_канала_данных"].n_unique(),
            "invalid_or_repeated_header_rows": int(invalid),
            "duplicate_exact_core_rows": int(duplicate_core),
            "duplicate_event_id_excess_rows": int(duplicate_ids),
        }

    report_path = cache_dir / "data_audit.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report
