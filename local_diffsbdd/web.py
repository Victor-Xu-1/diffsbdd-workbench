"""Loopback-only web interface over the same validated CLI generation path."""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import subprocess

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .jobs import JobManager, PACKAGE
from .runtime import CHECKPOINT, COMMIT
from .contracts import GenerationInput, EditInput
from .registry import available_models
from .config import PORT, DATA
from .designs import DesignStore
from .workspace_api import router as workspace_router
from . import __version__
from .build import build_identity
from .messages import public_message, validation_message


@asynccontextmanager
async def lifespan(app):
    app.state.jobs = JobManager()
    app.state.designs = DesignStore(DATA / "designs")
    yield
    app.state.jobs.close()


app = FastAPI(title="DiffSBDD Local", docs_url=None, redoc_url=None, lifespan=lifespan)
app.include_router(workspace_router)
app.add_middleware(
    TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]"]
)


@app.middleware("http")
async def local_boundary(request: Request, call_next):
    if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
        size = request.headers.get("content-length", "")
        if not size.isdigit() or int(size) > 8 * 1024 * 1024:
            return JSONResponse(
                {"detail": "请求需带长度，且不得超过 8 MiB。"}, status_code=413
            )
        # Drain bounded bodies before an early rejection. Closing an HTTP/1.1
        # connection with unread input can reset it before the error is received.
        try:
            body = await asyncio.wait_for(request.body(), timeout=10)
        except asyncio.TimeoutError:
            return JSONResponse(
                {"detail": "结构上传超时，请重新选择文件。"}, status_code=408
            )
        if len(body) > 8 * 1024 * 1024:
            return JSONResponse({"detail": "输入超过 8 MiB。"}, status_code=413)
        origin = request.headers.get("origin")
        allowed = {f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"}
        if request.headers.get("x-diffsbdd-client") != "local-ui" or (
            origin and origin not in allowed
        ):
            return JSONResponse(
                {"detail": "仅接受本机界面的同源操作。"}, status_code=403
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'"
    )
    if request.url.path.startswith("/editor"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self' blob:; connect-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self'; frame-ancestors 'self'"
        )
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_request, exc):
    details = "；".join(validation_message(e) for e in exc.errors())
    return JSONResponse({"detail": details}, status_code=422)


@app.get("/")
def index():
    return FileResponse(PACKAGE / "web/index.html")


app.mount(
    "/editor",
    StaticFiles(directory=PACKAGE / "web/vendor/ketcher", html=True),
    name="editor",
)


@app.get("/api/example")
def example():
    return FileResponse(PACKAGE / "examples/3rfm.pdb", media_type="chemical/x-pdb")


app.mount("/assets", StaticFiles(directory=PACKAGE / "web"), name="assets")


@app.get("/api/health")
def health():
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.free,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        ready, gpu = result.returncode == 0, result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        ready, gpu = False, ""
    return {
        "version": __version__,
        **build_identity(),
        "ready": CHECKPOINT.is_file() and ready,
        "gpu": gpu,
        "commit": COMMIT,
        "models": available_models(),
        "batch_size": 1,
    }


@app.get("/api/jobs")
def jobs(
    request: Request,
    offset: int = Query(default=0, ge=0, le=100000),
    limit: int = Query(default=20, ge=1, le=100),
):
    return request.app.state.jobs.history(offset, limit)


@app.post("/api/jobs", status_code=202)
def submit(payload: GenerationInput, request: Request):
    try:
        return request.app.state.jobs.submit(payload)
    except ValueError as exc:
        raise HTTPException(422, public_message(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, public_message(exc)) from exc


@app.post("/api/pockets/inspect")
def pocket_preview(payload: GenerationInput, request: Request):
    from .pockets import preview_pocket

    try:
        return preview_pocket(payload, request.app.state.jobs)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(422, public_message(exc)) from exc


@app.get("/api/jobs/{job_id}")
def job(job_id: str, request: Request):
    try:
        return request.app.state.jobs.get(job_id)
    except ValueError as exc:
        raise HTTPException(404, public_message(exc)) from exc


@app.post("/api/jobs/{job_id}/cancel")
def cancel(job_id: str, request: Request):
    try:
        return request.app.state.jobs.cancel(job_id)
    except ValueError as exc:
        raise HTTPException(404, public_message(exc)) from exc


@app.get("/api/jobs/{job_id}/files/{name}")
def download(job_id: str, name: str, request: Request):
    try:
        path = request.app.state.jobs.result_file(job_id, name)
        return FileResponse(path, filename=name)
    except ValueError as exc:
        raise HTTPException(404, public_message(exc)) from exc


@app.get("/api/jobs/{job_id}/molecules/{index}.svg")
def depiction(job_id: str, index: int, request: Request):
    from rdkit import Chem
    from rdkit.Chem.Draw import rdMolDraw2D

    try:
        info = request.app.state.jobs.get(job_id)
        molecules = info.get("report", {}).get("molecules", [])
        if index < 0 or index >= len(molecules):
            raise ValueError("Molecule not found.")
        molecule = Chem.MolFromSmiles(molecules[index]["smiles"])
        if molecule is None:
            raise ValueError("Molecule cannot be depicted.")
        drawer = rdMolDraw2D.MolDraw2DSVG(360, 230)
        rdMolDraw2D.PrepareAndDrawMolecule(drawer, molecule)
        drawer.FinishDrawing()
        return Response(drawer.GetDrawingText(), media_type="image/svg+xml")
    except ValueError as exc:
        raise HTTPException(404, public_message(exc)) from exc


@app.get("/api/jobs/{job_id}/molecules/{index}.mol")
def molfile(job_id: str, index: int, request: Request):
    from rdkit import Chem

    try:
        path = request.app.state.jobs.result_file(job_id, "molecules.sdf")
        supplier = Chem.SDMolSupplier(str(path))
        if index < 0 or index >= len(supplier) or supplier[index] is None:
            raise ValueError("Molecule not found.")
        return Response(
            Chem.MolToMolBlock(supplier[index]), media_type="chemical/x-mdl-molfile"
        )
    except ValueError as exc:
        raise HTTPException(404, public_message(exc)) from exc


@app.post("/api/jobs/{job_id}/edits", status_code=201)
def edit(job_id: str, payload: EditInput, request: Request):
    from .editing import save_edit

    try:
        return save_edit(
            request.app.state.jobs,
            job_id,
            payload.index,
            payload.molblock,
            payload.notes,
            payload.rating,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(422, public_message(exc)) from exc


@app.get("/api/jobs/{job_id}/edits/{edit_id}.sdf")
def edited_download(job_id: str, edit_id: str, request: Request):
    from .editing import edit_file

    try:
        path = edit_file(request.app.state.jobs, job_id, edit_id)
        return FileResponse(path, filename=f"edited_{edit_id[:8]}.sdf")
    except ValueError as exc:
        raise HTTPException(404, public_message(exc)) from exc


class PoseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sdf: str = Field(min_length=20, max_length=1_000_000)


@app.post("/api/poses/inspect")
def inspect_pose(payload: PoseInput):
    import tempfile
    from rdkit import Chem
    from .sampling import read_pose

    try:
        with tempfile.TemporaryDirectory(prefix="diffsbdd-pose-") as directory:
            path = Path(directory) / "pose.sdf"
            path.write_text(payload.sdf)
            molecule = read_pose(path)
            return {
                "molblock": Chem.MolToMolBlock(molecule),
                "atoms": molecule.GetNumAtoms(),
                "fragments": len(Chem.GetMolFrags(molecule)),
                "rings": [list(ring) for ring in molecule.GetRingInfo().AtomRings()],
            }
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(422, public_message(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT, workers=1)
