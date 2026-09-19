from __future__ import annotations

from typing import Any, Protocol


class ModelAdapter(Protocol):
    model_id: str
    display_name: str

    def describe(self) -> dict[str, Any]: ...

    def predict(self, payload: dict[str, Any], display: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]: ...

