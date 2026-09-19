from __future__ import annotations

import argparse
import json
from pathlib import Path

from .runtime.lct26_access.data import materialize_security_events
from .runtime.lct26_access.features import (
    build_context_daily,
    build_site_feature_table,
    build_zone_feature_table,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build causal feature tables for current unauthorized-access scoring."
    )
    parser.add_argument("--catalog-dir", type=Path, required=True)
    parser.add_argument("--journal-csv-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--years", nargs="+", type=int, required=True)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = args.work_dir / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    audit = materialize_security_events(
        args.catalog_dir, args.journal_csv_dir, cache_dir, args.years
    )
    site_path = args.output_dir / "daily_site_features.parquet"
    context_path = args.output_dir / "daily_family_context.parquet"
    zone_path = args.output_dir / "daily_zone_features.parquet"
    site = build_site_feature_table(
        cache_dir / "security_events", args.catalog_dir, site_path
    )
    context = build_context_daily(
        args.journal_csv_dir, args.catalog_dir, args.years, context_path
    )
    zone = build_zone_feature_table(
        cache_dir / "security_events", args.catalog_dir, site_path, zone_path
    )
    print(
        json.dumps(
            {
                "site_shape": site.shape,
                "context_shape": context.shape,
                "zone_shape": zone.shape,
                "max_as_of": str(site["date"].max()),
                "audit": audit,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
