# Design QA — passed

Reviewed the running implementation on 2026-09-29. Version 0.3 follows the user's clarified direction: use the reference for visual style, not a one-to-one module or geometry copy. The reference image is not redistributed.

## Visual style and usable workflow

| Surface | Result |
|---|---|
| Layout | Retains the restrained blue/white palette, sidebar, cards and input/preview relationship. Removed the decorative stepper, duplicate mode switches and collapsed-card controls. Input height follows content; no fixed y-position target. |
| Typography | Chinese UI font preference, navy headings, restrained blue secondary text, consistent input sizing and concise medicinal-chemistry labels. |
| Color and shape | Pale blue background, white cards, fine blue-gray borders, blue primary/selected states, green confirmed states, consistent corner radii. |
| Icons | A single licensed Tabler icon family; decorative icons have empty alt text and icon-only actions have accessible names. No custom illustration substitutes. |
| Scientific imagery | Actual PDB/SDF geometry rendered by 3Dmol, not a pasted or generated protein illustration. The public example is A:330 with 36 computed pocket residues; those facts deliberately differ from the reference's illustrative text and geometry. |
| Ketcher | Official standalone editor, one adapter module, real molecule import/export and chemical edit workflow verified. Native chemical tools are retained. |
| Figures | Protein cartoon/stick/line; ligand ball-and-stick/stick/space-fill/line; SES/VDW/SAS; custom colors and transparency; orthographic/perspective; nearby residues; high-resolution PNG and saved camera recipes. Shared style module for input and result views. |
| States | Initial input is empty and generation is disabled. Reading a real file or explicitly loading the example supplies file/ligand/residue state. API configuration failure shows an error without false read-success indicators. Loaded input, empty library, validation failure and actual job states are explicit. |
| Keyboard | Visible focus styles, labelled controls, semantic dialogs/buttons, keyboard-accessible navigation. |
| Responsive layouts | Actual Chrome at 1536×1024, 1024×900, 768×1024 and 390×844. No horizontal page overflow. Narrow-screen navigation works. Mobile preview toolbar wraps to a separate row; its heading and canvas no longer overlap the next card. Desktop is recommended for detailed molecular editing. |

## Fixes made during QA

- Removed the previous editor implementation and its assets from the product tree after the Ketcher workflow passed.
- Centralized scientific styles, controlled camera reset and high-resolution label texture regeneration; enlarged PNG exports preserve crisp labels rather than enlarging only a low-resolution screenshot.
- Corrected stale source selection/readiness and separated asynchronous editor loading from generation readiness.
- Replaced missing icon references, corrected surface worker CSP and fixed a real early-response connection-reset failure at the API boundary.
- Kept true calculated residue counts and replaced the apparent account menu with a static local-runtime indicator. The default is ten sequential candidates; quick trial offers three. No illustrative result counts are copied from the reference.
- Removed selectivity, training and paper-benchmark navigation. Saved designs and actual task comparison retain their distinct functions. PDB preparation is a contextual dialog over the current protein, not a separate upload/page.
- Consolidated model selection to one control; automatic inference-time checksum checks remain. Removed the standalone model page, redundant manual verification control, top saved-design dropdown, duplicate help and settings-reuse entry.
- Added choice-based task presets and parameter explanations on hover, focus and tap, including Escape/outside-click dismissal. All fine parameters now have one optional advanced section, filtered by actual task applicability.
- Tasks, model labels, presets and numerical bounds come from the backend capability contract. No example filename, readiness checkmark, residue count or result statistic is fabricated during startup.
- Added direct protein-residue and ligand-ring/atom selection. Ring/scaffold indices come from RDKit; retained fragments have visible selection state.
- Fixed delayed history responses overwriting a newer molecule selection, and prevented outdated PDB preparation from becoming usable after an option changes.
- Verified focus using actual Tab/Shift+Tab keyboard actions after clicking the example loader. Restored the example loader's icon at mobile widths now that example loading is explicit.

Automated verification is in `tests/browser.mjs`, `tests/pages.mjs`, `tests/layout.mjs` and `tests/frontend.test.mjs`. The documentation screenshot `docs/workbench.png` is an actual capture of the public example; diagnostic screenshots and user job data are ignored. The molecular drawing's exact geometry and camera naturally depend on the chosen structure; this QA does not claim an identical raster image or journal certification.
