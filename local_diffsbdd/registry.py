"""Only published, checksum-pinned official checkpoints are loadable."""

import json
from pathlib import Path

CATALOG = json.loads((Path(__file__).resolve().parents[1] / "models.json").read_text())[
    "models"
]


def model_spec(identifier):
    for item in CATALOG:
        if item["id"] == identifier:
            return dict(item)
    raise ValueError("未知模型，请从模型列表中选择。")


def available_models():
    from .runtime import ROOT

    return [
        dict(item, installed=(ROOT / "models" / item["file"]).is_file())
        for item in CATALOG
    ]
