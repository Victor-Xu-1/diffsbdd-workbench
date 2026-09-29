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

import {
  configureContract,
  fieldActive,
  projectOptions,
  presetOptions,
} from "../web/contract.js";
test("capability projection excludes inactive options and retains enforced native constraints", () => {
  configureContract({
    schema: 1,
    fields: {
      count: { when: [{ task: ["generate", "inpaint"] }] },
      atoms: { when: [{ task: ["generate"], size_mode: ["fixed"] }] },
      steps: { when: [{ task: ["generate", "inpaint"] }] },
      change_steps: { when: [{ task: ["optimize"] }] },
      fixed_atoms: { when: [{ task: ["inpaint"] }] },
    },
    tasks: {
      generate: {
        presets: [{ id: "trial", options: { count: 7, steps: 80 } }],
      },
      optimize: {},
      inpaint: { forced: { fragment_policy: "all", relaxation: 0 } },
    },
    models: [
      {
        id: "conditional",
        installed: true,
        strategy: "cond",
        tasks: ["generate", "optimize", "inpaint"],
      },
      { id: "joint", strategy: "joint", tasks: ["generate"] },
    ],
    rules: [
      { when: { task: ["inpaint"], trajectory: [true] }, set: { count: 1 } },
    ],
  });
  assert.deepEqual(presetOptions("generate", "trial"), { count: 7, steps: 80 });
  assert.throws(() => presetOptions("generate", "missing"));
  assert.equal(
    fieldActive({ when: [{ strategy: ["joint"] }] }, { strategy: "cond" }),
    false,
  );
  const result = projectOptions({
    task: "optimize",
    model: "conditional",
    steps: 9999,
    atoms: 1000,
    count: 1000,
    change_steps: 75,
  });
  assert.deepEqual(result, {
    task: "optimize",
    model: "conditional",
    change_steps: 75,
  });
  const inpaint = projectOptions({
    task: "inpaint",
    model: "conditional",
    count: 30,
    steps: 500,
    fixed_atoms: [1, 2],
    trajectory: true,
  });
  assert.equal(inpaint.count, 1);
  assert.equal(inpaint.fragment_policy, "all");
  assert.equal(inpaint.relaxation, 0);
  assert.throws(() => projectOptions({ task: "optimize", model: "joint" }));
});

import {
  selectionGroup,
  toggleGroup,
  editorAtomMap,
} from "../web/molecular-selection.js";
test("whole-ring selection includes shared rings but not a separate ring", () => {
  const rings = [
    [0, 1, 2],
    [2, 3, 4],
    [7, 8, 9],
  ];
  assert.deepEqual(
    selectionGroup(1, rings, "ring").sort((a, b) => a - b),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(selectionGroup(1, rings, "atom"), [1]);
  assert.deepEqual(toggleGroup([0, 1, 2, 7], [0, 1, 2]), [7]);
  assert.deepEqual(toggleGroup([0, 7], [0, 1, 2]), [0, 1, 2, 7]);
});
test("editor correspondence checks atom order and bond identity before synchronizing IDs", () => {
  const mol =
    "CO\n\n\n  2  1  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0\n    1.5000    0.0000    0.0000 O   0  0  0  0\n  1  2  1  0  0  0  0\nM  END\n";
  const struct = {
    atoms: new Map([
      [5, { label: "C" }],
      [9, { label: "O" }],
    ]),
    bonds: new Map([[0, { begin: 5, end: 9, type: 1 }]]),
  };
  assert.deepEqual(editorAtomMap(mol, struct), [5, 9]);
  struct.bonds.get(0).type = 2;
  assert.equal(editorAtomMap(mol, struct), null);
  struct.bonds.get(0).type = 1;
  struct.atoms.get(9).label = "N";
  assert.equal(editorAtomMap(mol, struct), null);
  assert.equal(editorAtomMap("invalid", struct), null);
});

import { ligandOrientation } from "../web/molecular-camera.js";
import { molGraph } from "../web/molecular-model.js";
test("view orientation exposes a tilted molecular plane without changing coordinates", () => {
  const atoms = [
    { x: -2, y: -1, z: -2 },
    { x: 2, y: -1, z: 2 },
    { x: 2, y: 1, z: 2 },
    { x: -2, y: 1, z: -2 },
  ];
  const before = JSON.stringify(atoms),
    q = ligandOrientation(atoms);
  assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-8);
  const rotated = atoms.map((p) => {
    const u = q.slice(0, 3),
      v = [p.x, p.y, p.z],
      dot = u.reduce((sum, x, i) => sum + x * v[i], 0),
      cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ],
      square = u.reduce((sum, x) => sum + x * x, 0);
    return v.map(
      (value, i) =>
        2 * dot * u[i] + (q[3] * q[3] - square) * value + 2 * q[3] * cross[i],
    );
  });
  assert.ok(rotated.every((point) => Math.abs(point[2]) < 1e-7));
  assert.equal(JSON.stringify(atoms), before);
});
test("renderer boundary rejects atom clouds and incomplete chemical bond records", () => {
  assert.throws(() => molGraph("2\nXYZ\nC 0 0 0\nO 1 0 0"));
  const text =
    "CO\n\n\n  2  1  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0\n    1.5000    0.0000    0.0000 O   0  0  0  0\n  1  2  1  0  0  0  0\nM  END\n";
  assert.deepEqual(molGraph(text).edges, [[0, 1, 1]]);
  assert.throws(() => molGraph(text.replace("  1  2  1", "  1  7  1")));
});
