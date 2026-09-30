import unittest
from local_diffsbdd.options import DesignOptions


class CapabilityTests(unittest.TestCase):
    def test_form_limits_defaults_and_choices_come_from_validated_options(self):
        from local_diffsbdd.capabilities import capabilities

        contract = capabilities()
        schema = DesignOptions.model_json_schema()["properties"]
        self.assertEqual(set(contract["fields"]), set(schema) - {"task", "model"})
        for name, field in contract["fields"].items():
            for key in ("minimum", "maximum", "default", "enum"):
                self.assertEqual(field.get(key), schema[name].get(key))

    def test_all_presets_are_real_valid_native_task_options(self):
        from local_diffsbdd.capabilities import capabilities

        contract = capabilities()
        for task, spec in contract["tasks"].items():
            for preset in spec["presets"]:
                options = dict(preset["options"], task=task)
                if task == "inpaint":
                    options["fixed_atoms"] = [0]
                validated = DesignOptions.model_validate(options)
                self.assertEqual(validated.attempts, preset["attempts"])
        self.assertNotIn("selectivity", contract["tasks"])
        self.assertNotIn("train", contract["tasks"])

    def test_task_operations_and_simple_size_are_available_without_expert_mode(self):
        from local_diffsbdd.capabilities import capabilities

        contract = capabilities()
        tasks = contract["tasks"]
        self.assertEqual(len({spec["settings_title"] for spec in tasks.values()}), 4)
        for task, spec in tasks.items():
            self.assertEqual(bool(spec["source_label"]), task != "generate")
        for name in ("atoms", "change_steps", "rounds", "population", "objective"):
            self.assertNotEqual(contract["fields"][name]["section"], "advanced-fields")

    def test_model_choices_and_applicability_use_the_registry(self):
        from local_diffsbdd.capabilities import capabilities
        from local_diffsbdd.registry import CATALOG

        contract = capabilities()
        self.assertEqual(
            {m["id"] for m in contract["models"]}, {m["id"] for m in CATALOG}
        )
        for model in contract["models"]:
            self.assertEqual("inpaint" in model["tasks"], model["strategy"] == "cond")
        self.assertNotIn("optimize", contract["fields"]["atoms"]["when"][0]["task"])
