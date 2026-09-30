# Validation record

Local release verification, 2026-09-29 (UTC). Hardware: Windows 11 / Ubuntu WSL2, NVIDIA RTX 5060 Laptop 8151 MiB, 32 GB host RAM. Python 3.10.20, PyTorch 2.7.1+cu128. This records observed behavior; it is not a drug-discovery benchmark or a guarantee of model validity for other targets.

## Version 0.4.1 task-focused pages

Verified on 2026-09-30 against baseline `55f365b195d126ec25f7e7ae00ff253fd4491dac`. Scope: remove the duplicate standalone preview page; expose distinct source/controls for four design tasks; allow direct result-to-design continuation; keep the editor focused on editing. Embedded molecular viewers remain. No inference adapter, dependency, job schema or model changes.

| Change | Risk / acceptance | Evidence |
|---|---|---|
| Remove preview workspace | Duplicate navigation or orphaned route | Fail-first browser assertion found the old entry; revised workspace test confirms it is absent and remaining navigation works. |
| Task-specific operations first | Hidden required settings, identical pages, duplicate inputs | Four different operation headings and applicable source/fields tested in simple mode. Fixed atom count is directly editable when size is specified. Real SDF upload, scaffold selection and projected options checked; expert switch preserves values. |
| Direct historical source | Unwanted optimizer default, editor detour, invalid source accepted | Fail-first test found source action invisible on results page. Now selection preserves the requested task, uses the real result/pose APIs and returns to design. Injected invalid pose response keeps results open and disables continuation; reselecting a real candidate recovers. |
| Shared DOM moved | Broken WebGL/editor sizing, clipping, lost state | Real Chrome screenshots inspected for design tasks, editor and 390-pixel layout. Four task layouts tested at widths 1536/1024/768/390. Ketcher selection, feedback, molecular graph and interaction regressions pass. |

Commands run using `/opt/diffsbdd/venv/bin/python`, `PLAYWRIGHT_CHANNEL=chrome` and the temporary real fixture service on port 17865:

- `python -m unittest discover -s tests -v`: **54 passed**.
- `npm test`: **10 passed**.
- `node tests/workspace_modes.mjs`, `node tests/layout.mjs`, `node tests/pages.mjs`, `node tests/molecular.mjs`, `node tests/browser.mjs --ui-only`: **all passed**. Fixture results are explicitly labelled historical generated structures, not new inference.
- Ruff check/format, compileall, `bash -n install.sh web.sh`, Prettier and `git diff --check`: **passed**; `python tools/vendor_assets.py --verify`: **53 files verified**.

Review: one authoritative form and molecular state; no added library or dynamic HTML injection. API validation, local-origin protections, persistent job formats and scientific rendering logic remain unchanged. Error handling prevents failed source loading from navigating to design. The unused preview route/CSS is removed. New GPU inference, full dataset evaluation, LLM and dependency vulnerability re-audit are not applicable to this presentation-only change; earlier GPU evidence below is historical, not rerun for 0.4.1.

## Version 0.4 molecular integrity and direct workspaces

Verified on 2026-09-30. Baseline: `903bb42b79dce465982a7dc50c6e46042f6a9946`. Scope remains local molecular design and analysis; training and full-dataset benchmarks are not operational modules.

| Change | Risk and acceptance | Actual evidence |
|---|---|---|
| Isolate raw diffusion states | Atom clouds must never replace final structures | Fail-first production reproduction changed a 24-atom/27-bond ligand to 140 distance-guessed bonds during playback. Playback and competing renderer path removed; native diagnostic JSON remains downloadable. Real 3Dmol graph now checked against canonical SDF. |
| PDB ligand topology and protein conformers | Lost bond orders, hidden B conformers, guessed missing atoms | Public caffeine: 14 heavy atoms, 15 bonds, 4 double bonds, matching CCD identity and unchanged coordinates. Unknown definition/missing heavy atoms explicitly blocked; aligned SDF recovery verified. Higher-occupancy B fixture coordinates retained as one visible conformer. |
| Typed local interactions | Distance alone mislabeled as hydrogen bond; stale analysis | Real ProLIF detects ASN A253 hydrogen-bond candidate at 3.334739 Å and PHE A168 stacking at 4.171988 Å; 100 Å translation removes all interactions; carbon-only ligand produces no hydrogen bonds. Native browser lines, details and JSON download checked. |
| Shared preview/editor layouts | Small/clipped molecules after navigation; missing editor text | Native projected atom bounds and ligand size checked. Ketcher refreshes cached text bounds after hidden-container layout without reimporting chemistry; graphical edits and navigation-preserved SMILES pass. Resizing preserves 3D rotation. |
| Simple/expert mode | Duplicate state, lost parameters, hidden invalid fields | Real browser checks every workspace, large preview, shared editor, parameter preservation, invalid-field recovery, Chinese help and four viewport widths. |
| Concurrent analysis | Quick view changes rejected as bad chemistry | Fail-first real HTTP test returned 200/422/422. Bounded lock wait now returns three identical successful analyses; cold-start browser workflow passes without console errors. |
| Dependencies | New chemistry packages break model runtime | ProLIF 2.2.2, Gemmi 0.7.5 and transitive dependencies hash-locked; existing versions retained. All eight checkpoints generated one valid connected molecule each on real CUDA. |

Commands actually run (Python used the isolated validation environment with the installed scientific runtime on `PYTHONPATH`; browser URL was port 17865 with `PLAYWRIGHT_CHANNEL=chrome`):

- `python -m unittest discover -s tests -q`: **53 passed**, including real HTTP, RDKit/CCD/ProLIF, persistence, concurrency and invalid-input/origin cases.
- `npm test`: **10 passed**.
- `node tests/browser.mjs --ui-only`, `node tests/pages.mjs`, `node tests/molecular.mjs`, `node tests/workspace_modes.mjs`, `node tests/layout.mjs`: **passed**. Native editor, real WebGL, 2400-pixel PNG, downloads and API; widths 1536, 1024, 768, 390. Screenshots inspected, including corrected loading layout.
- `node tests/browser.mjs`: **passed with real GPU inference**. Generation `6889a9182e6242558442bcf2e8881c93` **2/2**, two-round optimization `7948ab1b1da04d2d960a3e21cb100a9d` **6/6**, fixed-atom design `cc07aa9d0c0c46d2831c982ea8154dea` **1/1**; graphical editing, feedback, diagnostic download and cancellation passed. Later resize, label-margin and bounded analysis-wait corrections were retested through affected real UI/API paths; inference was unchanged.
- `python -m tests.gpu_smoke --all-models --case MODEL_ID --output OUTPUT`: all eight model IDs; **8/8 passed**, one valid connected candidate each, 11.5–23.6 seconds per case.
- Ruff check/format, Python compileall, shell syntax, Prettier and vendor verification: **passed**, all **53** vendor files unchanged.
- Real HTTPS CCD download/cache check for ATP: SHA-256 `06d876e9fe28b6981725288cd03943818ef6faf4839782c2a0a8929d65c85336`; second read used local definition. Only the public component ID was sent.
- `pip-audit 2.10.0`: no known vulnerabilities among audited packages; CUDA-tagged Torch and torch-scatter could not be matched against PyPI and remain explicitly unassessed by that audit.

Audit covered fixed-host/redirect-rejecting downloads, identifiers/body limits/timeouts, atomic cache writes, safe DOM text, same-origin mutation protection, bounded analysis locks/cache, request cancellation/revision guards, renderer graph validation and no duplicate molecular state. No authentication model, persisted job format, upstream model source or weight changed. LLM, docking and training tests are not applicable. User data and reference screenshots are not published.

Limits: ProLIF uses standard amino-acid templates and implicit hydrogens; incomplete protein residues may prevent analysis while preview remains available. Water bridges, metals, covalent interactions, pH preparation and binding affinity are not calculated. Counts represent one closest pair per residue/detector; exported `occurrences` records detected combinations. Figures follow scientific drawing conventions, not journal certification or equivalence to every commercial-suite function.

## Version 0.3 UI consolidation and molecular selection (historical)

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
