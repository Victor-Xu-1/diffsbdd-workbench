# Design QA — version 0.4

Reviewed the running implementation in real Chrome on 2026-09-30. Reference images guide the restrained blue/white style and scientific drawing conventions; illustrative modules and user-provided images are not redistributed.

| Surface | Observed result |
|---|---|
| Navigation | Direct sidebar entries for four native design workflows, saved designs, preview/interactions, structure editing, protein preparation, results, library and comparison. Each operates on real inputs/results. Training, selectivity and full-dataset benchmark placeholders remain absent. |
| Simple/expert mode | Common presets and choices in simple mode; one flat expert section filtered by the capability contract. Mode changes preserve values and refuse to hide invalid fields. Help supports hover, focus and click. |
| Input and preview | Narrow input rail leaves over 850 px for native 3D at 1536 px desktop width. File identity, residue counts, integrity and readiness come from parsing. Loading status stays readable when the success icon is hidden. |
| Molecular correctness | Canonical SDF graph validated at renderer boundary. PDB ligands use matching CCD atom names/bonds with original coordinates. Missing/unknown chemistry reported explicitly. Raw diffusion clouds cannot replace final molecules. |
| Scientific layers | White background, green ligand sticks, conventional element colors, gray nearby residues and typed dashed interactions. Site, surface and complete-protein presets share detailed controls. Lavender cartoons remain selectable. No coordinates are altered for presentation. |
| Interactions | Real ProLIF chemistry/geometry, residue labels, distances, focus and downloadable records. Hydrogen-bond candidates are distinguished from manual measurements; unsupported interaction types are not shown as calculated. |
| Results | Full-width 3D preview, actual properties, candidate selection and exports. Diagnostic data stays in task details, separate from chemical structures. |
| Editing | Same 3D scene beside official Ketcher on wide screens. Native viewport/cache refresh fixes hidden-container clipping and missing atom text. Real graphical edits, alignment, feedback and continuation verified. Navigation preserves chemistry and orientation. |
| Responsive behavior | Chrome at 1536×1024, 1024×900, 768×1024 and 390×844; no horizontal page overflow. Narrow screens stack editor/preview and use a navigation drawer. Resizing refits structures rather than leaving thumbnails. |
| Other workspaces | Library cards/export, task comparison and portable saved designs visually inspected. Protein preparation uses the current protein in one contextual dialog. No duplicate upload state or ornamental dashboard. |
| Export | Native 2400-pixel WebGL PNG and camera/style recipe roundtrip verified. Label textures scale with output. Molecular graph and original coordinates survive styling/resizing/export. |

Regressions are in tests/browser.mjs, pages.mjs, molecular.mjs, workspace_modes.mjs, layout.mjs and frontend/backend tests. Test captures stay ignored; docs/workbench.png is an actual public-example capture. See [docs/VALIDATION.md](docs/VALIDATION.md) for measured evidence and scientific limits.

Publication output still needs review of the chosen camera, label overlap and intended physical size for each structure. These checks do not claim a universal journal style or every capability of a commercial molecular-modeling suite.
