/** Shared atom identity and selection rules; chemical rings are supplied by RDKit. */
export function selectionGroup(index, rings, mode) {
  const group = new Set([index]);
  if (mode === "ring") {
    let changed = true;
    while (changed) {
      changed = false;
      for (const ring of rings)
        if (ring.some((atom) => group.has(atom)))
          for (const atom of ring)
            if (!group.has(atom)) {
              group.add(atom);
              changed = true;
            }
    }
  }
  return [...group];
}
export function toggleGroup(selected, group) {
  const result = new Set(selected),
    remove = group.every((atom) => result.has(atom));
  for (const atom of group) remove ? result.delete(atom) : result.add(atom);
  return [...result].sort((a, b) => a - b);
}
export function editorAtomMap(molblock, struct) {
  const lines = molblock.split(/\r?\n/),
    count = Number(lines[3]?.slice(0, 3)),
    bonds = Number(lines[3]?.slice(3, 6));
  if (!lines[3]?.includes("V2000") || !Number.isInteger(count) || count < 1)
    return null;
  const ids = [...struct.atoms.keys()];
  if (ids.length !== count || struct.bonds.size !== bonds) return null;
  if (
    ids.some(
      (id, index) =>
        struct.atoms.get(id).label !== lines[index + 4]?.slice(31, 34).trim(),
    )
  )
    return null;
  const edge = (a, b, type) => [Math.min(a, b), Math.max(a, b), type].join(":");
  const expected = lines
    .slice(count + 4, count + bonds + 4)
    .map((line) =>
      edge(
        Number(line.slice(0, 3)) - 1,
        Number(line.slice(3, 6)) - 1,
        Number(line.slice(6, 9)),
      ),
    )
    .sort();
  const actual = [...struct.bonds.values()]
    .map((bond) =>
      edge(ids.indexOf(bond.begin), ids.indexOf(bond.end), bond.type),
    )
    .sort();
  return expected.every((bond, index) => bond === actual[index]) ? ids : null;
}
const hoverLabels = new WeakMap();
export function clearHover(viewer) {
  const label = hoverLabels.get(viewer);
  if (label) viewer.removeLabel(label);
  hoverLabels.delete(viewer);
}
export function enableMolecularHover(viewer) {
  clearHover(viewer);
  viewer.setHoverable(
    { model: [0, 1] },
    true,
    (atom) => {
      clearHover(viewer);
      const text =
        atom.model === 1
          ? `${atom.elem}${atom.index + 1}`
          : `${atom.resn} ${atom.chain}:${atom.resi} · ${atom.atom}`;
      hoverLabels.set(
        viewer,
        viewer.addLabel(text, {
          position: atom,
          fontSize: 13,
          fontColor: "#263446",
          backgroundColor: "#ffffff",
          backgroundOpacity: 0.9,
          borderThickness: 1,
          borderColor: "#b8c8de",
          inFront: true,
        }),
      );
      viewer.render();
    },
    () => {
      clearHover(viewer);
      viewer.render();
    },
  );
}
