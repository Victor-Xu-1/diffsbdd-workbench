"""Typed HTTP contracts for saved designs and operational workspace pages."""

import hashlib
import json
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from .designs import SaveDesign, RevisionConflict
from .preparation import PreparationInput, prepare_structure
from .collections import MoleculeSelection, export_molecules, compare_jobs
from .registry import model_spec
from .config import RUNTIME
from .messages import public_message

router = APIRouter(prefix="/api")


@router.get("/capabilities")
def ui_capabilities():
    from .capabilities import capabilities

    return capabilities()


def failure(exc):
    return HTTPException(
        409 if isinstance(exc, RevisionConflict) else 422, public_message(exc)
    )


@router.get("/designs")
def designs(request: Request):
    return request.app.state.designs.list()


@router.get("/designs/{identifier}")
def design(identifier: str, request: Request):
    try:
        return request.app.state.designs.get(identifier)
    except ValueError as exc:
        raise HTTPException(404, public_message(exc)) from exc


@router.get("/designs/{identifier}/export")
def export_design(identifier: str, request: Request):
    try:
        record = request.app.state.designs.get(identifier)
    except ValueError as exc:
        raise HTTPException(404, public_message(exc)) from exc
    return Response(
        json.dumps(record, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="design.json"'},
    )


@router.post("/designs", status_code=201)
def create_design(payload: SaveDesign, request: Request):
    try:
        return request.app.state.designs.save(payload, request.app.state.jobs)
    except ValueError as exc:
        raise failure(exc) from exc


@router.put("/designs/{identifier}")
def update_design(identifier: str, payload: SaveDesign, request: Request):
    try:
        return request.app.state.designs.save(
            payload, request.app.state.jobs, identifier
        )
    except ValueError as exc:
        raise failure(exc) from exc


@router.post("/structures/prepare")
def prepare(payload: PreparationInput):
    try:
        return prepare_structure(payload)
    except ValueError as exc:
        raise failure(exc) from exc


class ExportInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selection: list[MoleculeSelection] = Field(min_length=1, max_length=100)
    format: Literal["sdf", "csv"] = "sdf"


@router.post("/library/export")
def molecule_export(payload: ExportInput, request: Request):
    try:
        body = export_molecules(
            request.app.state.jobs, payload.selection, payload.format
        )
    except ValueError as exc:
        raise failure(exc) from exc
    return Response(
        body,
        media_type="chemical/x-mdl-sdfile" if payload.format == "sdf" else "text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="selected-molecules.{payload.format}"'
        },
    )


class ComparisonInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    jobs: list[str] = Field(min_length=1, max_length=20)


@router.post("/jobs/compare")
def comparison(payload: ComparisonInput, request: Request):
    try:
        return compare_jobs(request.app.state.jobs, payload.jobs)
    except ValueError as exc:
        raise failure(exc) from exc


@router.post("/models/{identifier}/verify")
def verify_model(identifier: str):
    try:
        spec = model_spec(identifier)
    except ValueError as exc:
        raise failure(exc) from exc
    path = RUNTIME / "models" / spec["file"]
    if not path.is_file():
        raise HTTPException(422, "模型尚未安装，请运行安装器下载官方权重。")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    return {
        "model": identifier,
        "valid": actual == spec["sha256"],
        "sha256": actual,
        "bytes": path.stat().st_size,
    }
