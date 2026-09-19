from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any


class PredictionStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _read(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        try:
            value = json.loads(self.path.read_text())
            return value if isinstance(value, list) else []
        except (OSError, json.JSONDecodeError):
            return []

    def upsert(self, prediction: dict[str, Any]) -> None:
        with self.lock:
            items = self._read()
            items = [item for item in items if item.get("id") != prediction["id"]]
            items.append(prediction)
            items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(items, ensure_ascii=False, indent=2))
            temporary.replace(self.path)

    def list(self, district: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
        with self.lock:
            items = self._read()
        if district:
            items = [item for item in items if item.get("district") in {district, "Все округа"}]
        if status == "active":
            items = [item for item in items if item.get("risk_alert") is True]
        return items

