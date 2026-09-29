/** Preserve the validated SDF molecular graph at the renderer boundary. */
export function molGraph(text) {
  const lines = text.split(/\r?\n/),
    header = lines[3] || "";
  const count = Number(header.slice(0, 3)),
    bonds = Number(header.slice(3, 6));
  if (
    !header.includes("V2000") ||
    !Number.isInteger(count) ||
    count < 1 ||
    !Number.isInteger(bonds) ||
    bonds < 0
  )
    throw new Error("预览需要包含完整原子和键型的 MOL/SDF，不能使用原子点云。");
  const atoms = lines.slice(4, 4 + count).map((line) => ({
    elem: line.slice(31, 34).trim(),
    x: Number(line.slice(0, 10)),
    y: Number(line.slice(10, 20)),
    z: Number(line.slice(20, 30)),
  }));
  const edges = lines
    .slice(4 + count, 4 + count + bonds)
    .map((line) => [
      Number(line.slice(0, 3)) - 1,
      Number(line.slice(3, 6)) - 1,
      Number(line.slice(6, 9)),
    ]);
  if (
    atoms.length !== count ||
    edges.length !== bonds ||
    atoms.some(
      (atom) => !atom.elem || ![atom.x, atom.y, atom.z].every(Number.isFinite),
    ) ||
    edges.some(
      ([a, b, order]) =>
        !Number.isInteger(a) ||
        !Number.isInteger(b) ||
        a < 0 ||
        b < 0 ||
        a >= count ||
        b >= count ||
        a === b ||
        ![1, 2, 3].includes(order),
    )
  )
    throw new Error("分子的原子或键记录不完整，请重新导出有效 SDF。");
  return { atoms, edges };
}
export function addLigandModel(viewer, text) {
  const graph = molGraph(text),
    model = viewer.addModel(text, "sdf"),
    atoms = model.selectedAtoms({});
  const edge = (a, b, order) =>
    [Math.min(a, b), Math.max(a, b), order].join(":");
  const expected = graph.edges.map(([a, b, order]) => edge(a, b, order)).sort();
  const actual = atoms
    .flatMap((atom, i) =>
      atom.bonds
        .map((other, j) =>
          other > i ? edge(i, other, atom.bondOrder[j]) : null,
        )
        .filter(Boolean),
    )
    .sort();
  if (
    atoms.length !== graph.atoms.length ||
    atoms.some(
      (atom, i) =>
        atom.elem !== graph.atoms[i].elem ||
        ["x", "y", "z"].some(
          (axis) => Math.abs(atom[axis] - graph.atoms[i][axis]) > 0.00001,
        ),
    ) ||
    JSON.stringify(actual) !== JSON.stringify(expected)
  ) {
    viewer.removeModel(model);
    throw new Error(
      "三维渲染器未完整读取分子的原子、坐标或键型，已停止显示。请重新载入结构。",
    );
  }
  return model;
}
export function addProteinModel(viewer, text) {
  // Bound ligands, solvent and ions are separate molecular objects, never the protein.
  const protein = text
    .split(/\r?\n/)
    .filter((line) => /^(ATOM  |TER   |HELIX |SHEET |END)/.test(line))
    .join("\n");
  return viewer.addModel(protein, "pdb");
}
