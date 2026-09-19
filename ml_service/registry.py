from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from models.base import ModelAdapter


@dataclass
class RegisteredModel:
    model_id: str
    display_name: str
    factory: Callable[[], ModelAdapter] | None
    adapter: ModelAdapter | None = None
    error: str | None = None

    def load(self) -> None:
        if self.factory is None or self.adapter is not None:
            return
        try:
            self.adapter = self.factory()
        except Exception as exc:  # noqa: BLE001 - health must survive one broken model
            self.error = f"{type(exc).__name__}: {exc}"

    def describe(self) -> dict[str, Any]:
        if self.adapter is not None:
            return self.adapter.describe()
        if self.factory is None:
            return {
                "id": self.model_id,
                "display_name": self.display_name,
                "status": "not_configured",
            }
        return {
            "id": self.model_id,
            "display_name": self.display_name,
            "status": "error",
            "error": self.error,
        }


class ModelRegistry:
    def __init__(self) -> None:
        from models.fire_risk import FireRiskAdapter
        from models.infrastructure_wear import InfrastructureWearAdapter
        from models.unauthorized_access import UnauthorizedAccessAdapter

        self.models = {
            "fire_risk": RegisteredModel("fire_risk", "Пожарный риск", FireRiskAdapter),
            "infrastructure_wear": RegisteredModel(
                "infrastructure_wear", "Износ инфраструктуры", InfrastructureWearAdapter
            ),
            "unauthorized_access": RegisteredModel(
                "unauthorized_access",
                "Несанкционированный доступ",
                UnauthorizedAccessAdapter,
            ),
            "model_4": RegisteredModel("model_4", "Модель 4", None),
        }
        for model in self.models.values():
            model.load()

    def list(self) -> list[dict[str, Any]]:
        return [model.describe() for model in self.models.values()]

    def get(self, model_id: str) -> RegisteredModel | None:
        return self.models.get(model_id)
