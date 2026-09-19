"""Strict JSON/CSV inference for the compact multi-horizon CatBoost ensemble."""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier

HERE = Path(__file__).resolve().parent
MODEL_DIR = HERE / "model"


class FireRiskPredictor:
    def __init__(self) -> None:
        self.metadata = json.loads((MODEL_DIR / "metadata.json").read_text())
        self.object_ids = {int(k): str(v) for k, v in
                           json.loads((MODEL_DIR / "object_ids.json").read_text()).items()}
        self.constants = {int(k): float(v) for k, v in
                          json.loads((MODEL_DIR / "object_constants.json").read_text()).items()}
        self.seven_models = []
        for name in self.metadata["ensemble"]["seven_day_model_files"]:
            model = CatBoostClassifier()
            model.load_model(str(MODEL_DIR / name))
            self.seven_models.append(model)
        self.three_models = []
        for name in self.metadata["ensemble"]["three_day_model_files"]:
            model = CatBoostClassifier()
            model.load_model(str(MODEL_DIR / name))
            self.three_models.append(model)
        self.three_weight = float(self.metadata["ensemble"]["three_day_weight"])
        self.numeric = self.metadata["numeric_features"]
        self.features = self.metadata["features"]

    def _validate(self, payload: dict[str, Any]) -> tuple[dict, dict]:
        required_meta = {"object", "as_of", "features_through", "eligible"}
        meta = payload.get("meta")
        values = payload.get("features")
        if not isinstance(meta, dict) or not isinstance(values, dict):
            raise ValueError("payload requires objects 'meta' and 'features'")
        missing_meta = sorted(required_meta - set(meta))
        if missing_meta:
            raise ValueError(f"missing meta fields: {missing_meta}")
        object_id = int(meta["object"])
        if object_id not in self.object_ids:
            raise ValueError(f"unknown or ineligible object: {object_id}")
        if meta["eligible"] is not True:
            raise ValueError("object is ineligible: no fire-system event in prior 30 calendar days")
        as_of = pd.Timestamp(meta["as_of"])
        through = pd.Timestamp(meta["features_through"])
        if as_of.tz is not None or through.tz is not None:
            raise ValueError("as_of and features_through must be timezone-naive calendar dates")
        if through.normalize() != as_of.normalize() - pd.Timedelta(days=1):
            raise ValueError("features_through must equal as_of minus one calendar day")
        missing = sorted(set(self.numeric) - set(values))
        extra = sorted(set(values) - set(self.numeric))
        if missing or extra:
            raise ValueError(f"feature schema mismatch; missing={missing}, extra={extra}")
        clean = {}
        for name in self.numeric:
            value = values[name]
            value = np.nan if value is None else float(value)
            if not (math.isfinite(value) or math.isnan(value)):
                raise ValueError(f"feature {name!r} is infinite")
            clean[name] = value
        if int(clean["calendar_month"]) != as_of.month:
            raise ValueError("calendar_month does not match as_of")
        if clean["obj_smoke_channels_total"] != self.constants[object_id]:
            raise ValueError("obj_smoke_channels_total does not match the trained registry snapshot")
        clean["object_id"] = self.object_ids[object_id]
        return meta, clean

    def predict_one(self, payload: dict[str, Any]) -> dict[str, Any]:
        meta, clean = self._validate(payload)
        frame = pd.DataFrame([clean], columns=self.features)
        start = time.perf_counter()
        seven_score = float(np.mean(
            [model.predict_proba(frame)[0, 1] for model in self.seven_models]))
        three_score = float(np.mean(
            [model.predict_proba(frame)[0, 1] for model in self.three_models]))
        score = (1.0 - self.three_weight) * seven_score + self.three_weight * three_score
        elapsed_ms = (time.perf_counter() - start) * 1000
        threshold = float(self.metadata["threshold"])
        return {
            "object": int(meta["object"]), "as_of": str(meta["as_of"]),
            "horizon_hours": int(self.metadata["horizon_hours"]),
            "risk_score": score, "threshold": threshold,
            "risk_alert": bool(score >= threshold),
            "risk_level": "high" if score >= threshold else "low",
            "model_version": self.metadata["model_version"],
            "target_note": "proxy of a new smoke-sensor onset; not a confirmed fire probability",
            "inference_ms_excluding_model_load": elapsed_ms,
        }


def csv_payloads(path: Path, predictor: FireRiskPredictor) -> list[dict]:
    table = pd.read_csv(path)
    required = {"object", "as_of", "features_through", "eligible", *predictor.numeric}
    missing = sorted(required - set(table.columns))
    extra = sorted(set(table.columns) - required)
    if missing or extra:
        raise ValueError(f"CSV schema mismatch; missing={missing}, extra={extra}")
    rows = []
    for row in table.to_dict(orient="records"):
        eligible = row.pop("eligible")
        if isinstance(eligible, str):
            normalized = eligible.strip().lower()
            if normalized not in {"true", "false", "1", "0"}:
                raise ValueError(f"invalid eligible value: {eligible!r}")
            eligible = normalized in {"true", "1"}
        meta = {k: row.pop(k) for k in ("object", "as_of", "features_through")}
        meta["eligible"] = bool(eligible)
        rows.append({"meta": meta, "features": row})
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--input-json", type=Path)
    group.add_argument("--input-csv", type=Path)
    args = parser.parse_args()
    load_start = time.perf_counter()
    predictor = FireRiskPredictor()
    load_ms = (time.perf_counter() - load_start) * 1000
    if args.input_json:
        raw = json.loads(args.input_json.read_text())
        payloads = raw if isinstance(raw, list) else [raw]
    else:
        payloads = csv_payloads(args.input_csv, predictor)
    results = [predictor.predict_one(payload) for payload in payloads]
    output: Any = results if len(results) != 1 else results[0]
    print(json.dumps({"model_load_ms": load_ms, "predictions": output}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
