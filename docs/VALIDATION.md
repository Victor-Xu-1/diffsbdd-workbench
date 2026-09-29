# Validation record

Local release verification, 2026-09-29 (UTC). Hardware: Windows 11 / Ubuntu WSL2, NVIDIA RTX 5060 Laptop 8151 MiB, 32 GB host RAM. Python 3.10.20, PyTorch 2.7.1+cu128. This records observed behavior; it is not a drug-discovery benchmark or a guarantee of model validity for other targets.

## Version 0.3 UI consolidation and molecular selection

Baseline: `bf51dad6fafa8871a6ed759fccabd79170ad9425`. This change removes the remaining duplicate presentation layers, rather than cloning every reference-image module. Native inference, weights and dependencies are unchanged.

| Change | Risk | Evidence |
|---|---|---|
| Capability-driven form, task list, models and presets | UI values diverge from backend; irrelevant options get submitted | `DesignOptions` schema supplies bounds/defaults/enums; backend preset validation; real API and browser compare the contract with controls; frontend projection excludes inactive values |
| Empty initial state and explicit example load | False filename/readiness; unavailable configuration appears usable | Chrome checks empty input and disabled submission, then actual parsing; controlled HTTP failure verifies visible error and no fake success |
| Remove duplicate modules/controls | Necessary functions become unreachable | Browser verifies saved designs, contextual protein preparation, model choice, candidate library, comparison and the advanced section; retired DOM entries are absent and IDs are unique |
| Unified continuation choices | Wrong molecule/task reaches native inference | Full CUDA browser run covers edit feedback, selected continuation, optimization, fixed-atom inference, trajectory and cancellation |
| Context-specific settings in result records | Ignored defaults misrepresented as active settings | Actual native task reports rendered through the same applicability contract; original downloadable records are unchanged |
| Shared molecular display settings and three presets | Two viewers diverge; exports omit scope/style | Real 3Dmol surfaces, labels, fractional context-radius and scope recipe roundtrip; 2400-pixel native PNG; four Chrome viewport checks and visual review |
| Ketcher/3D atom selection | Wrong atom identity after chemistry edits; incorrect ring expansion | RDKit ring API test, atom/bond correspondence tests, actual canvas clicks reaching Ketcher and native editor selection reaching the shared mask; graphical edit invalidates correspondence until saved-pose reload |
| Saved edit previews | Successful persistence misreported as failure; wrong parent overlaid | Real HTTP/RDKit save followed by controlled preview failure, persisted edit verification and reopening; historical edits use their actual parent molecule |

Current local results: **45 backend tests**, **8 frontend tests**; operational-page Chrome suite, original UI/editor/download suite and four viewport checks passed. The layout focus regression uses actual keyboard events. The delayed-response regression now releases and drains an explicit interception gate before browser teardown, preserving assertions that stale history responses cannot replace the chosen job. Ruff, Prettier, compileall, shell syntax and all 53 vendor hashes passed. No vendored editor or renderer code was modified.

Real GPU run with the molecular selection/editor changes: generation `870b85a404234ecf98890d8a6558c39c` (**2/2 valid**), optimization `6b72babf98574d7db6d9711395246d80` (**6/6 valid** over two rounds), inpainting `afe496521dbe47e7a510d85508c5fbb1` (**1/1 valid**) and cancellation. Commands are the README test commands, with `DIFFSBDD_TEST_URL=http://127.0.0.1:17865` and `PLAYWRIGHT_CHANNEL=chrome`. A subsequent surface-scope correction and strengthened view-recipe assertions were retested through the real browser UI suite; inference code was unchanged.

Compatibility: adds read-only `/api/capabilities`; existing input, job, edit and saved-design contracts remain intact. Rendering checks, text-safe DOM construction, same-origin mutation protections, and the pinned model loader remain in place. Training/full dataset evaluation remain outside the user-confirmed scope.

## Version 0.2 operational-page correction (historical)

Baseline: `eaf6ae4925719a08ce5a221ecb941adbf3807eb9`. No model, checkpoint, dependency or upstream-patch change. Development used an isolated worktree and port 17865; production data was not copied into test fixtures.

| Change | Risk | Acceptance and evidence |
|---|---|---|
| Remove informational-only selectivity/training/benchmark navigation | Implied unsupported capability | Real browser checks absent controls; each remaining tool has an actual operation |
| Task presets and Chinese parameter help | Hidden incorrect options, inaccessible explanation | Six frontend behavior tests; Chrome verifies applied count/steps, hover/focus/tap and dismissal |
| Saved designs | Lost uploads, wrong atom mask, stale updates | Real API creation/open/export/409; new store instance restores input; RDKit confirms fragment bonds, coordinates and mask; browser reload/reopen |
| PDB preparation | Changed coordinates, stale output | BioPython checks atom accounting, chain validation and exact retained coordinates; browser downloads real PDB and rejects delayed output after options change |
| Direct selection | Wrong residue or ligand atom indices | Real canvas residue/ring selection, RDKit ring/scaffold data, portable fragment roundtrip |
| Candidate collection and comparison | Wrong file/index or invented statistics | RDKit-parsed selected SDF, CSV, actual report-derived ratios; real browser export and comparison |
| Result selection and editor import | Slow requests overwrite current job | Two explicit UI fixtures plus delayed real HTTP-response regression; serialized Ketcher imports; full GPU edit/feedback workflow |

Commands run for this correction:

- `python -m unittest discover -s tests -v`: **41 passed**, including real HTTP, chemistry, persistence and failure paths.
- `npm test`: **6 passed**.
- `DIFFSBDD_TEST_URL=http://127.0.0.1:17865 PLAYWRIGHT_CHANNEL=chrome node tests/pages.mjs`: **passed**. Includes checksum calculation against an installed official model. CPU CI skips only that installed-weight operation when weights are absent.
- `DIFFSBDD_TEST_URL=http://127.0.0.1:17865 PLAYWRIGHT_CHANNEL=chrome node tests/browser.mjs`: **passed with actual CUDA inference**. Jobs `c3faff9fa632465ca73bd75340fc9438` (generation), `31c6a8919b534c2abdffc1bdf7a5ca06` (two-round optimization), `b1c1b95e9cb4425bbb39a5a37c79d7e7` (inpainting). Also verified graphical editing, feedback persistence, downloads, trajectory and cancellation. Later changes were confined to preparation response guards, help text and dead callback removal; their affected browser paths were retested.
- Same browser command with `--ui-only`: **passed** using a labelled real generated fixture, without claiming a new GPU calculation.
- `node tests/layout.mjs` with the same URL/channel: **passed**, widths 1536, 1024, 768 and 390; desktop and mobile captures manually reviewed.

Review covered API size/type/identifier boundaries, origin protections inherited by new routes, atomic saved-design writes and revision conflicts, safe text rendering, bounded export/compare sizes, async source-selection races and object-URL cleanup. There is no new outbound URL fetch, authentication system, database, model loader or LLM integration. Existing jobs are not migrated or modified; `designs/` is additive. No dependency changes require repeating the eight-checkpoint compatibility matrix; the earlier evidence below remains historical.

## Version 0.1 baseline validation (historical)

### Scope and acceptance criteria

| Change | Main risk | Actual validation / acceptance |
|---|---|---|
| Modern scientific dependencies and reviewed upstream patch | Model load / numerical incompatibility | All eight published checkpoints loaded and generated at least one chemically valid candidate using real CUDA and full 500-step generation |
| Unified pocket preparation | Preview and inference use different residues | Real PDB parser and HTTP tests compare selected residue identities; uploaded/custom and example inputs exercised |
| Generation, inpainting, diversity and optimization | Incorrect model entry point, lost constraints, disconnected output | Real native sampling, strict fragment growth, atom-constrained linking, QED/SA rounds and diversity; chemical validity and geometry checked by RDKit |
| Ketcher replacement | Lost atom/bond/stereo data or unusable 3D pose | Real editor import/export preserves canonical isomeric SMILES on the inspected generated structure; graphical O→F replacement, a real bond-order edit/alignment regression, real alignment, saved feedback and subsequent GPU optimization |
| Scientific 3D figures | Misleading geometry, poor export, unstable camera | Native 3Dmol surfaces and labels, actual canvas atom selection and distance measurement, view recipe export/import, 2400-pixel PNG exported from enlarged render buffer |
| Local API and persistence | Origin bypass, path traversal, partial writes, concurrent feedback | Real Uvicorn integration, rejected origins and requests, allowlisted downloads, atomic JSON updates, concurrent edit saves, isolated cross-process inference lock |
| New reference-aligned UI | Broken navigation, hidden controls, stale readiness | Real Chrome desktop/mobile tests, residue dialog, draft, editor, download, source reuse, trajectory playback and cancellation; no browser console/page errors |

### Commands actually run for the baseline

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

- One inference job at a time; candidates are sequential. Version 0.2 defaults to ten candidates; quick trial requests three.
- Strict fragment checks can reject all candidates for some masks, sizes and seeds. Raw attempted structures and rejection reasons remain available. Connectivity is measured, not guaranteed.
- QED, SA and distance summaries are not affinity, selectivity, ADMET, synthetic accessibility experiments or binding-pose validation.
- Ketcher is the unmodified official standalone editor. Its native chemistry tooltips use English; surrounding workflows, settings and feedback use medicinal-chemistry Chinese.
- Full research training, dataset curation, selectivity design and paper benchmark runs are outside this deployment and have no operational sidebar entries. Task comparison summarizes existing runs only. PDB preparation filters coordinates; it does not rebuild missing atoms or assign protonation.
- The library displays the most recent 100 jobs, exports at most 100 selected molecules and compares at most 20 jobs. Saved designs are limited to 500 records and require valid task inputs; old parameter-only browser drafts are not converted automatically.
- Figure styles are configurable scientific conventions, not journal certification. Label overlap and the final physical publication size should be reviewed for each selected camera and structure.

## Baseline clean checkout and installation (historical)

A separate Git clone under a temporary Linux directory was installed into a new CPU virtual environment using the production dependency constraints: 34 tests passed and all 53 vendor hashes matched. Re-running the documented full installer verified all eight weight files, 91 installed packages, the pinned upstream patch, real CUDA/scatter and chemistry kernels. The Windows background-service installer also completed and its HTTP readiness check passed.
