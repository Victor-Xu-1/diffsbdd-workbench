# Security and privacy

This is a single-user localhost research workbench, not an internet-facing service.

- Uvicorn binds only to `127.0.0.1`. Host headers are restricted. Mutations require the local UI header and, for browsers, a matching Origin. There is no permissive CORS configuration.
- Uploaded files are parsed as PDB/SDF data; no uploaded checkpoint, script, server path, or shell command is accepted. Input lengths, molecule sizes, pocket sizes, task counts, and numerical ranges are bounded.
- Download names and job/edit identifiers are allowlisted. Resolved result paths must remain inside the job directory. HTML feedback is displayed using text nodes.
- Model files are accepted only from the eight SHA-256-pinned official assets in `models.json`. Legacy Python checkpoint deserialization is used only after this check; never change the loader to accept arbitrary files.
- Upstream source revision and the complete reviewed patch are checked before every model load. There is one process lock for GPU inference. Cancellation terminates only the owned process group and escalates after a bounded grace period.
- Protein structures, molecules and feedback remain under the local data directory. Browser libraries are served locally. No LLM API, telemetry session, cloud upload, docking service or external chemistry search is used during inference. W&B is installed only because the upstream module imports it; its session is disabled and never initialized by the workbench.
- Technical logs are downloadable from a collapsed support area. They may contain model diagnostics and local paths. Do not publish them without inspection.

## Dependency review

The initial research-compatible environment was audited with `pip-audit 2.10.0`. It reported known vulnerabilities affecting old BioPython, Protobuf, PyTorch Lightning and setuptools. The release configuration updates those packages and W&B, regenerates `requirements.lock`, and revalidates the models. The updated installed environment returned **no known vulnerabilities** in the audit run on 2026-09-29. This is a point-in-time result, not a guarantee about future disclosures.

The model runtime remains pinned to PyTorch/CUDA and chemistry versions that were actually tested. GPU weights and arbitrary Python pickle files must never be treated as safe merely because the UI calls them models. `models.json` is a trust boundary; changes require source/provenance review.

Run the installed-environment audit with:

```bash
uvx --from pip-audit==2.10.0 pip-audit --path /opt/diffsbdd/venv/lib/python3.10/site-packages
npm audit
```

The npm audit covers the workbench development dependency lock, not transitive packages embedded in the official Ketcher release bundle. Bundled assets are version-pinned, hash-verified and retain the publisher’s notices; update them when upstream security releases appear.

The frontend's stricter CSP is relaxed only for the locally bundled Ketcher/Indigo editor, which requires inline/evaluated scripts and local WebAssembly. Blob workers are permitted for molecular rendering. The parent page has a self-only script policy and cannot be framed by other origins.

Report security issues privately through GitHub's available private reporting channel or directly to the repository owner. Do not include confidential molecular structures in public issues.
