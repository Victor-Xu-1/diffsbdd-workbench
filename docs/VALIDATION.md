# Validation record

Local release verification, 2026-09-29 (UTC). Hardware: Windows 11 / Ubuntu WSL2, NVIDIA RTX 5060 Laptop 8151 MiB, 32 GB host RAM. Python 3.10.20, PyTorch 2.7.1+cu128. This records observed behavior; it is not a drug-discovery benchmark or a guarantee of model validity for other targets.

## Scope and acceptance criteria

| Change | Main risk | Actual validation / acceptance |
|---|---|---|
| Modern scientific dependencies and reviewed upstream patch | Model load / numerical incompatibility | All eight published checkpoints loaded and generated at least one chemically valid candidate using real CUDA and full 500-step generation |
| Unified pocket preparation | Preview and inference use different residues | Real PDB parser and HTTP tests compare selected residue identities; uploaded/custom and example inputs exercised |
| Generation, inpainting, diversity and optimization | Incorrect model entry point, lost constraints, disconnected output | Real native sampling, strict fragment growth, atom-constrained linking, QED/SA rounds and diversity; chemical validity and geometry checked by RDKit |
| Ketcher replacement | Lost atom/bond/stereo data or unusable 3D pose | Real editor import/export preserves canonical isomeric SMILES on the inspected generated structure; graphical O→F replacement, a real bond-order edit/alignment regression, real alignment, saved feedback and subsequent GPU optimization |
| Scientific 3D figures | Misleading geometry, poor export, unstable camera | Native 3Dmol surfaces and labels, actual canvas atom selection and distance measurement, view recipe export/import, 2400-pixel PNG exported from enlarged render buffer |
| Local API and persistence | Origin bypass, path traversal, partial writes, concurrent feedback | Real Uvicorn integration, rejected origins and requests, allowlisted downloads, atomic JSON updates, concurrent edit saves, isolated cross-process inference lock |
| New reference-aligned UI | Broken navigation, hidden controls, stale readiness | Real Chrome desktop/mobile tests, residue dialog, draft, editor, download, source reuse, trajectory playback and cancellation; no browser console/page errors |

## Commands actually run

- `python -m unittest discover -s tests -v`: **34 tests passed**, real chemistry and local HTTP included.
- `npm test`: **5 frontend behavior tests passed** (selection indexing, candidate identity, user error text, figure validation and element styles).
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: **passed** against the installed GPU service. Real generated tasks produced 2 valid candidates, 6 valid candidates across two optimization rounds, and a valid fixed-atom result with diffusion playback. Cancellation was tested separately. Later figure-only changes were verified again through the same real browser integration in CPU fixture mode.
- `DIFFSBDD_TEST_URL=http://127.0.0.1:17865 PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- --ui-only`: **passed** with the explicitly labelled real generated fixture, not simulated model output. The HTTP server, RDKit, Ketcher, 3Dmol and PNG renderer are real.
- `python -m tests.gpu_smoke`: strict growth **3/3**, native atom-constrained linking **3/3**, SA optimization **6/6**, automatic size with UFF **2/2**, base generation **1/1** valid in the recorded local run.
- `python -m tests.gpu_smoke --case diversify`: **2/2** valid and connected; 10.776 seconds in this run.
- All eight model families were also run individually after the dependency upgrade: full-atom/Cα, conditional/joint, CrossDocked/Binding MOAD; each produced a valid result at 500 steps.
- `ruff check local_diffsbdd tests tools`, `ruff format --check local_diffsbdd tests tools`, Python `compileall`, `bash -n install.sh web.sh`: passed.
- `python tools/vendor_assets.py --verify` and `--restore`: **53 files verified**, including restored official archives and license notices.
- Installed environment `pip-audit 2.10.0`: no known vulnerabilities reported after upgrades; `uv pip check`: passed. `npm audit`: no known vulnerabilities in the development lock. Scope caveat for prebuilt third-party bundles is in SECURITY.md.

Test artifacts, logs, GPU output and feedback stay in ignored local directories. The repository includes only a public protein example and an explicitly labelled generated chemistry fixture. CI repeats CPU, API, static, asset and real browser checks; it does not claim to exercise CUDA.

## Practical limits

- One inference job at a time; small batches are sequential. The default requests three candidates, not the illustrative 100 in the UI design reference.
- Strict fragment checks can reject all candidates for some masks, sizes and seeds. Raw attempted structures and rejection reasons remain available. Connectivity is measured, not guaranteed.
- QED, SA and distance summaries are not affinity, selectivity, ADMET, synthetic accessibility experiments or binding-pose validation.
- Ketcher is the unmodified official standalone editor. Its native chemistry tooltips use English; surrounding workflows, settings and feedback use medicinal-chemistry Chinese.
- Full research training, dataset curation and paper benchmark runs were not executed: their datasets and training resources are outside this 8 GB inference deployment. The corresponding sidebar entries explain this scope rather than reporting simulated jobs or scores.
- Figure styles are configurable scientific conventions, not journal certification. Label overlap and the final physical publication size should be reviewed for each selected camera and structure.

## Clean checkout and installation

A separate Git clone under a temporary Linux directory was installed into a new CPU virtual environment using the production dependency constraints: 34 tests passed and all 53 vendor hashes matched. Re-running the documented full installer verified all eight weight files, 91 installed packages, the pinned upstream patch, real CUDA/scatter and chemistry kernels. The Windows background-service installer also completed and its HTTP readiness check passed.

