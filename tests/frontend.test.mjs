import test from "node:test";
import assert from "node:assert/strict";
import { parseAtomNumbers } from "../web/controls.js";
import { orderedMolecules } from "../web/results-ui.js";
import { friendlyError } from "../web/api.js";

test("atom selections use explicit one-based user numbering", () => {
  assert.deepEqual(parseAtomNumbers("3, 1，2"), [0, 1, 2]);
  for (const text of ["0", "1,1", "NaN", "2.5"])
    assert.throws(() => parseAtomNumbers(text));
});
test("sorting and filtering preserve original molecule identity", () => {
  const rows = [
    { qed: 0.2, sa: 5, fragments: 2, pocket_atom_pairs_under_1_2_angstrom: 0 },
    { qed: 0.8, sa: 2, fragments: 1, pocket_atom_pairs_under_1_2_angstrom: 3 },
  ];
  assert.deepEqual(
    orderedMolecules(rows, "qed").map((x) => x.index),
    [1, 0],
  );
  assert.deepEqual(
    orderedMolecules(rows, "original", "connected").map((x) => x.index),
    [1],
  );
  assert.deepEqual(
    orderedMolecules(rows, "original", "no-clashes").map((x) => x.index),
    [0],
  );
  assert.equal(rows[0].qed, 0.2);
});
test("model failures have actionable medicinal-chemistry wording", () => {
  assert.match(friendlyError("CUDA out of memory"), /显存不足/);
  assert.match(friendlyError("RDKit sanitization: valence"), /价态/);
});

import {
  validateFigureSettings,
  validateViewRecipe,
  ligandStyle,
  FIGURE_DEFAULTS,
} from "../web/molecular-style.js";
test("figure settings reject malformed colors, oversized radii and invalid camera rotations", () => {
  assert.throws(() => validateFigureSettings({ surfaceOpacity: 2 }));
  assert.throws(() => validateFigureSettings({ carbonColor: "url(secret)" }));
  assert.throws(() => validateFigureSettings({ stickRadius: NaN }));
  assert.throws(() =>
    validateViewRecipe({
      schema: 1,
      camera: [0, 0, 0, 0, 0, 0, 0, 0],
      settings: {},
    }),
  );
  assert.equal(
    validateViewRecipe({
      schema: 1,
      camera: [0, 0, 0, 0, 0, 0, 0, 1],
      settings: { surfaceOpacity: 0.4 },
    }).settings.surfaceOpacity,
    0.4,
  );
});
test("ligand representations retain conventional element colors and distinct geometry", () => {
  const style = ligandStyle("stick", FIGURE_DEFAULTS);
  assert.notEqual(
    style.stick.colorfunc({ elem: "N" }),
    style.stick.colorfunc({ elem: "O" }),
  );
  assert.equal(
    style.stick.colorfunc({ elem: "C" }),
    FIGURE_DEFAULTS.carbonColor,
  );
  assert.ok(ligandStyle("sphere", FIGURE_DEFAULTS).sphere);
  assert.ok(!ligandStyle("sticks", FIGURE_DEFAULTS).sphere);
});

import { presetOptions } from "../web/presets.js";
test("simple presets produce bounded, task-specific settings", () => {
  for (const task of ["generate", "inpaint", "optimize", "diversify"])
    for (const level of ["quick", "standard", "explore"]) {
      const options = presetOptions(task, level);
      assert.ok(options.count <= 100);
      assert.ok(options.steps <= 500);
      if (task === "inpaint") {
        assert.equal(options.relaxation, 0);
        assert.equal(options.fragment_policy, "all");
      }
      if (task === "optimize") {
        assert.ok(options.population * options.rounds <= 100);
        assert.ok(options.survivors <= options.population);
      }
    }
  assert.equal(presetOptions("generate", "quick").steps, 100);
  assert.equal(presetOptions("generate", "standard").steps, 500);
  assert.notEqual(
    presetOptions("diversify", "quick").change_steps,
    presetOptions("diversify", "explore").change_steps,
  );
  assert.throws(() => presetOptions("generate", "missing"));
});
