from __future__ import annotations

import os
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from registry import ModelRegistry
from store import PredictionStore
from telemetry_semantics import StateCatalog, normalize_sensor_value

app = FastAPI(title="МосКоллектор ML API", version="1.0.0")
origins = [
    origin.strip()
    for origin in os.getenv("ML_CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

registry = ModelRegistry()
store = PredictionStore(Path(__file__).resolve().parent / "data" / "predictions.json")
state_catalog = StateCatalog.from_csv(
    Path(__file__).resolve().parent / "reference" / "state_catalog.csv"
)


@app.exception_handler(Exception)
async def unhandled_error(_: Request, exc: Exception) -> JSONResponse:
    request_id = str(uuid.uuid4())
    return JSONResponse(
        status_code=500,
        content={"detail": "internal ML API error", "request_id": request_id},
    )


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": str(uuid.uuid4())},
        headers=exc.headers,
    )


@app.get("/health")
def health() -> dict[str, Any]:
    models = registry.list()
    return {
        "status": "ok" if any(item["status"] == "ready" for item in models) else "degraded",
        "models": models,
    }


@app.get("/api/v1/models")
def list_models() -> dict[str, Any]:
    return {"items": registry.list()}


@app.post("/api/v1/telemetry/normalize")
def normalize_telemetry(body: dict[str, Any]) -> dict[str, Any]:
    """Classify one raw journal value without changing a model score."""

    sensor_type = body.get("sensor_type")
    if not isinstance(sensor_type, str) or not sensor_type.strip():
        raise HTTPException(status_code=422, detail="sensor_type is required")
    if "value" not in body:
        raise HTTPException(status_code=422, detail="value is required")
    normalized = normalize_sensor_value(sensor_type, body["value"], state_catalog)
    return {
        "sensor_type": sensor_type,
        "normalized": asdict(normalized),
        "methane_reference_flammability_percent": [5.0, 15.0]
        if sensor_type == "Газовый датчик"
        else None,
    }


@app.post("/api/v1/models/{model_id}/predict")
def predict(model_id: str, body: dict[str, Any]) -> dict[str, Any]:
    registered = registry.get(model_id)
    if registered is None:
        raise HTTPException(status_code=404, detail=f"unknown model: {model_id}")
    if registered.adapter is None:
        detail = registered.error or "model is not configured yet"
        raise HTTPException(status_code=503, detail=detail)

    payload = body.get("payload", body)
    display = body.get("display", {})
    if not isinstance(payload, dict) or not isinstance(display, dict):
        raise HTTPException(status_code=422, detail="payload and display must be JSON objects")
    try:
        raw, prediction = registered.adapter.predict(payload, display)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if bool(body.get("store", True)):
        store.upsert(prediction)
    return {"model_id": model_id, "result": raw, "prediction": prediction}


@app.get("/api/v1/predictions")
def list_predictions(
    district: str | None = Query(default=None),
    status: str | None = Query(default=None),
) -> dict[str, Any]:
    return {"items": store.list(district=district, status=status)}
