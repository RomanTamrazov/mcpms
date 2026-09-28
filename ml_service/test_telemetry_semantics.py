import unittest
from pathlib import Path

from telemetry_semantics import StateCatalog, interpret_channel_name, triage_telemetry_event


CATALOG = StateCatalog.from_csv(Path(__file__).parent / "reference" / "state_catalog.csv")


class TelemetryTriageTests(unittest.TestCase):
    def test_smoke_alarm_is_fire_signal_but_not_confirmed_incident(self) -> None:
        triage = triage_telemetry_event("КД АВ", "Обнаружен дым", CATALOG, alarm_message=True)

        self.assertEqual(triage.classification, "emergency_signal")
        self.assertEqual(triage.emergency_group, "fire")
        self.assertTrue(triage.requires_dispatcher_verification)
        self.assertEqual(triage.incident_status, "not_confirmed")

    def test_security_signal_is_intrusion_group(self) -> None:
        triage = triage_telemetry_event("КД Люк", "Не замкнут", CATALOG, alarm_message=True)

        self.assertEqual(triage.classification, "emergency_signal")
        self.assertEqual(triage.emergency_group, "intrusion")

    def test_technical_alarm_remains_technical_until_checked(self) -> None:
        triage = triage_telemetry_event("КД Дверь", "Неисправен", CATALOG, alarm_message=True)

        self.assertEqual(triage.classification, "technical_signal")
        self.assertIsNone(triage.emergency_group)
        self.assertEqual(triage.incident_status, "not_confirmed")

    def test_conflicting_source_flag_is_not_silently_routed_as_emergency(self) -> None:
        triage = triage_telemetry_event("Газовый датчик", "1.00", CATALOG, alarm_message=False)

        self.assertTrue(triage.source_conflict)
        self.assertEqual(triage.classification, "requires_verification")
        self.assertEqual(triage.emergency_group, "gas")

    def test_channel_context_does_not_invent_power_source_or_picket_distance(self) -> None:
        context = interpret_channel_name("ФВ2 (В23), ПК 80")

        self.assertIsNotNone(context)
        assert context is not None
        self.assertIn("ФВ: фидер вентиляции", context.terms)
        self.assertIn("В23: вентилятор", context.terms)
        self.assertEqual(context.supplied_load, "В23")
        self.assertEqual(context.picket, 80)
        self.assertEqual(context.supply_source, "not_specified_in_source")


if __name__ == "__main__":
    unittest.main()
