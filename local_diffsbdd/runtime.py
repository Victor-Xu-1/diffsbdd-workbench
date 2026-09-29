"""Provenance checks and the single upstream model-loading path."""

import hashlib
import os
from pathlib import Path
import subprocess
import sys
from .config import RUNTIME

ROOT = RUNTIME
SOURCE = ROOT / "source"
CHECKPOINT = ROOT / "models/crossdocked_fullatom_cond.ckpt"
COMMIT = "5d0d38d16c8932a0339fd2ce3f67ade98bbdff27"
CHECKPOINT_SHA256 = "07f86764bf569aafbc40a9c15fc02de8e2550437dd0f17f657eab3abe66c372c"


def verify_installation(model_id="crossdocked_fullatom_cond"):
    from .registry import model_spec

    spec = model_spec(model_id)
    checkpoint = (
        CHECKPOINT
        if model_id == "crossdocked_fullatom_cond"
        else ROOT / "models" / spec["file"]
    )
    if not checkpoint.is_file():
        raise ValueError("Model checkpoint missing; run install.sh first.")
    digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if digest != spec["sha256"]:
        raise ValueError("Checkpoint SHA-256 mismatch. Refusing to load it.")
    head = subprocess.check_output(
        ["git", "-C", str(SOURCE), "rev-parse", "HEAD"], text=True, timeout=10
    ).strip()
    if head != COMMIT:
        raise ValueError(f"Unexpected source revision: {head}")
    actual_diff = subprocess.check_output(
        ["git", "-C", str(SOURCE), "diff", "--no-ext-diff", "HEAD", "--"],
        text=True,
        timeout=10,
    )
    expected_diff = (
        Path(__file__).resolve().parents[1] / "patches/upstream.patch"
    ).read_text()
    if actual_diff != expected_diff:
        raise ValueError(
            "Source differs from the pinned revision plus the reviewed CUDA/BioPython compatibility patch."
        )
    if str(SOURCE) not in sys.path:
        sys.path.insert(0, str(SOURCE))
    return checkpoint


def configure_runtime():
    os.environ["WANDB_MODE"] = "disabled"
    os.environ["MPLBACKEND"] = "Agg"
    import torch

    torch.set_num_threads(2)
    if not torch.cuda.is_available():
        raise ValueError("CUDA GPU is unavailable. Run the doctor command to diagnose.")
    return torch


def load_model(model_id="crossdocked_fullatom_cond"):
    checkpoint = verify_installation(model_id)
    torch = configure_runtime()
    from lightning_modules import LigandPocketDDPM

    # The upstream Lightning checkpoint includes Python Namespace objects.
    # Limit legacy pickle loading to this exact, hash-verified official asset.
    payload = torch.load(checkpoint, map_location="cpu", weights_only=False)
    parameters = dict(payload["hyper_parameters"])
    # Lightning's load_from_checkpoint discards constructor keys removed since
    # training. Only this audited legacy field from the pinned CA asset is allowed.
    if model_id == "crossdocked_ca_cond" and parameters.get("noise_factor") == 1.0:
        parameters.pop("noise_factor")
    model = LigandPocketDDPM(**parameters)
    model.load_state_dict(payload["state_dict"], strict=True)
    del payload
    return model.eval().to("cuda")


def doctor():
    verify_installation()
    torch = configure_runtime()
    from torch_scatter import scatter_add
    from rdkit import Chem
    from openbabel import openbabel

    values = torch.tensor([1.0, 2.0, 3.0], device="cuda")
    index = torch.tensor([0, 1, 0], device="cuda")
    if scatter_add(values, index).tolist() != [4.0, 2.0]:
        raise RuntimeError("GPU scatter test failed.")
    torch.cuda.synchronize()
    if Chem.MolFromSmiles("CCO") is None:
        raise RuntimeError("RDKit parsing failed.")
    free, total = torch.cuda.mem_get_info()
    return {
        "source_commit": COMMIT,
        "checkpoint_sha256": CHECKPOINT_SHA256,
        "python": sys.version.split()[0],
        "torch": torch.__version__,
        "cuda_runtime": torch.version.cuda,
        "gpu": torch.cuda.get_device_name(),
        "gpu_free_mib": round(free / 2**20, 1),
        "gpu_total_mib": round(total / 2**20, 1),
        "cuda_scatter_test": "passed",
        "rdkit_test": "passed",
        "openbabel": openbabel.OBReleaseVersion(),
    }
