# Design QA — passed

Reviewed the supplied 1536 × 1024 reference and the running implementation side by side at the same viewport on 2026-09-29. Repeated the comparison after changing the scientific renderer. The reference image is not redistributed.

## Reference alignment

| Surface | Result |
|---|---|
| Layout | 52 px header, 246 px navigation, two input/preview columns starting at y=220, 438 px input cards, generation section starting at y=668, fixed bottom action bar. Desktop grid and card edges follow the reference. |
| Typography | Chinese UI font preference, navy headings, restrained blue secondary text, consistent input sizing and concise medicinal-chemistry labels. |
| Color and shape | Pale blue background, white cards, fine blue-gray borders, blue primary/selected states, green confirmed states, consistent corner radii. |
| Icons | A single licensed Tabler icon family; decorative icons have empty alt text and icon-only actions have accessible names. No custom illustration substitutes. |
| Scientific imagery | Actual PDB/SDF geometry rendered by 3Dmol, not a pasted or generated protein illustration. The public example is A:330 with 36 computed pocket residues; those facts deliberately differ from the reference's illustrative text and geometry. |
| Ketcher | Official standalone editor, one adapter module, real molecule import/export and chemical edit workflow verified. Native chemical tools are retained. |
| Figures | Protein cartoon/stick/line; ligand ball-and-stick/stick/space-fill/line; SES/VDW/SAS; custom colors and transparency; orthographic/perspective; nearby residues; high-resolution PNG and saved camera recipes. Shared style module for input and result views. |
| States | Loading pocket disables generation; verified input enables it only when runtime is available. Empty library, validation failures, running/cancelled/completed results and persisted edit feedback are explicit. |
| Keyboard | Visible focus styles, labelled controls, semantic dialogs/buttons, keyboard-accessible navigation. |
| Responsive layouts | Actual Chrome at 1536×1024, 1024×900, 768×1024 and 390×844. No horizontal page overflow. Narrow-screen navigation works. Mobile preview toolbar wraps to a separate row; its heading and canvas no longer overlap the next card. Desktop is recommended for detailed molecular editing. |

## Fixes made during QA

- Removed the previous editor implementation and its assets from the product tree after the Ketcher workflow passed.
- Centralized scientific styles, controlled camera reset and high-resolution label texture regeneration; enlarged PNG exports preserve crisp labels rather than enlarging only a low-resolution screenshot.
- Corrected stale source selection/readiness and separated asynchronous editor loading from generation readiness.
- Replaced missing icon references, corrected surface worker CSP and fixed a real early-response connection-reset failure at the API boundary.
- Kept true calculated residue counts, local user identity, and a three-candidate default suited to 8 GB inference instead of copying illustrative data from the reference.

Automated verification is in `tests/browser.mjs`, `tests/layout.mjs` and `tests/frontend.test.mjs`. The documentation screenshot `docs/workbench.png` is an actual capture of the public example; diagnostic screenshots and user job data are ignored. The molecular drawing's exact geometry and camera naturally depend on the chosen structure; this QA does not claim an identical raster image or journal certification.
