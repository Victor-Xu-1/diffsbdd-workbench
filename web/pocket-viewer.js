import { $, parseAtomNumbers, setAtomSelection } from "./controls.js";
import { clearFigureLabels } from "./figure-labels.js";
/** Input pocket visualization in unmodified PDB coordinates. */
import {
  applyCamera,
  resetCamera,
  ligandStyle,
  proteinStyle,
  nearbyAtoms,
  residueContext,
} from "./molecular-style.js";
import { registerFigure } from "./figure-panel.js";
let viewer,
  data,
  styleName = "surface",
  serial = 0,
  selectResidue;
let surfaceTask = Promise.resolve(),
  settings;
const element = () => document.getElementById("pocket-viewer");
async function drawSurface(current) {
  viewer.removeAllSurfaces();
  if (styleName !== "surface" || !data.residues.length) {
    element().dataset.ready = "true";
    return;
  }
  const atoms = viewer.getModel(1).selectedAtoms({}),
    model = viewer.getModel(0);
  const visible = atoms.length
    ? nearbyAtoms(model, atoms, 12)
    : viewer.getModel(2).selectedAtoms({});
  const pocketIds = new Set(data.residues);
  const close = new Set(nearbyAtoms(model, atoms, 5).map((a) => a.index));
  const selection = atoms.length
    ? { model: 0, index: visible.map((a) => a.index) }
    : { model: 2 };
  try {
    await viewer.addSurface(
      window.$3Dmol.SurfaceType[settings.surfaceType],
      {
        opacity: settings.surfaceOpacity,
        colorfunc: (atom) =>
          close.has(atom.index) && pocketIds.has(`${atom.chain}:${atom.resi}`)
            ? 0xe4ae45
            : settings.proteinColor,
      },
      selection,
    );
    if (current !== serial) return;
    viewer.render();
    element().dataset.ready = "true";
  } catch (error) {
    if (current === serial)
      document.getElementById("pocket-viewer-note").textContent =
        "表面绘制未完成，可切换卡通或球棍后重试。";
    throw error;
  }
}
function surfaceError(error) {
  document.getElementById("pocket-viewer-note").textContent =
    `表面绘制失败：${error.message}。可切换卡通或球棍查看。`;
}
function style() {
  if (!viewer || !data) return Promise.resolve();
  const current = ++serial;
  element().dataset.ready = "false";
  clearFigureLabels(viewer);
  applyCamera(viewer, settings);
  viewer.setStyle({ model: 0 }, {});
  viewer.setStyle(
    { model: 0, hetflag: false },
    proteinStyle({
      ...settings,
      representation: styleName === "stick" ? "stick" : settings.representation,
    }),
  );
  viewer.setStyle({ model: 1 }, ligandStyle("stick", settings));
  viewer.setStyle({ model: 2 }, {});
  const reference = viewer.getModel(1).selectedAtoms({});
  residueContext(viewer, settings, reference);
  clickTargets();
  paintAtoms();
  viewer.resize();
  viewer.render();
  surfaceTask = drawSurface(current);
  return surfaceTask;
}
export function showPocket(value, onResidue) {
  const camera =
    viewer && data?.protein === value.protein && data?.initial === value.initial
      ? viewer.getView()
      : null;
  data = value;
  selectResidue = onResidue;
  if (!viewer)
    viewer = window.$3Dmol.createViewer(element(), {
      backgroundColor: "#ffffff",
      antialias: true,
      cartoonQuality: 10,
      disableFog: true,
    });
  viewer.removeAllModels();
  viewer.removeAllShapes();
  viewer.addModel(value.protein, "pdb");
  viewer.addModel(
    value.initial || value.reference || "",
    value.initial ? "mol" : value.reference_format || "pdb",
  );
  viewer.addModel(value.pocket, "pdb");
  void style().catch(surfaceError);
  if (camera) viewer.setView(camera);
  else resetPocket();
  viewer.render();
}
export function resetPocket() {
  if (!viewer) return;
  resetCamera(
    viewer,
    data?.initial || data?.reference ? 1 : data?.residues.length ? 2 : 0,
    data?.initial || data?.reference?.length ? 0.7 : 1,
    60,
  );
}
function clickTargets() {
  if (!viewer || !data) return;
  const fragment =
    $("task").value === "inpaint" &&
    $("pocket-selection-mode").value === "fragment";
  viewer.setClickable({ model: 0, hetflag: false }, !fragment, (atom) =>
    selectResidue?.(`${atom.chain}:${atom.resi}`),
  );
  viewer.setClickable({ model: 1 }, fragment && !!data.initial, (atom) =>
    pickFragment(atom.index),
  );
  viewer.render();
}
function paintAtoms() {
  const indices = parseAtomNumbers($("fixed-atoms").value);
  $("fragment-count").textContent = `已保留 ${indices.length} 个原子`;
  for (const id of ["keep-scaffold", "keep-periphery"])
    $(id).disabled = !data?.initial;
  if (!viewer || !data) return;
  viewer.setStyle({ model: 1 }, ligandStyle("stick", settings));
  if (data.initial && $("task").value === "inpaint" && indices.length)
    viewer.addStyle(
      { model: 1, index: indices },
      { sphere: { scale: 0.34, color: 0xefaa39 } },
    );
  viewer.render();
}
function pickFragment(index) {
  if (
    $("task").value !== "inpaint" ||
    !data.initial ||
    $("pocket-selection-mode").value !== "fragment"
  )
    return;
  const group = new Set([index]);
  if ($("fragment-pick").value === "ring") {
    let changed = true;
    while (changed) {
      changed = false;
      for (const ring of data.rings || [])
        if (ring.some((i) => group.has(i)))
          for (const i of ring)
            if (!group.has(i)) {
              group.add(i);
              changed = true;
            }
    }
  }
  const selected = new Set(parseAtomNumbers($("fixed-atoms").value));
  const remove = [...group].every((i) => selected.has(i));
  for (const i of group) remove ? selected.delete(i) : selected.add(i);
  setAtomSelection([...selected]);
}
export function highlightPocketSelection(ids) {
  if (!viewer || !data) return;
  viewer.setStyle({ model: 0, hetflag: false }, proteinStyle(settings));
  viewer.addStyle(
    { model: 0, predicate: (atom) => ids.has(`${atom.chain}:${atom.resi}`) },
    { stick: { radius: 0.12, color: 0xe5a12b } },
  );
  viewer.render();
}
export function setupPocketViewer() {
  $("pocket-selection-mode").addEventListener("change", clickTargets);
  $("fixed-atoms").addEventListener("change", paintAtoms);
  $("clear-fragment").addEventListener("click", () => setAtomSelection([]));
  $("keep-scaffold").addEventListener("click", () => {
    setAtomSelection(data?.scaffold_atoms || []);
    if (!data?.scaffold_atoms?.length)
      $("pocket-viewer-note").textContent =
        "起始分子没有可提取的环骨架，请直接点选原子。";
  });
  $("keep-periphery").addEventListener("click", () => {
    if (!data?.initial) return;
    const core = new Set(data.scaffold_atoms);
    setAtomSelection(
      viewer
        .getModel(1)
        .selectedAtoms({})
        .map((a) => a.index)
        .filter((i) => !core.has(i)),
    );
  });
  settings = registerFigure("pocket", {
    viewer: () => viewer,
    element,
    redraw: style,
    ready: () => surfaceTask,
  });
  for (const button of document.querySelectorAll("[data-pocket-style]"))
    button.addEventListener("click", () => {
      styleName = button.dataset.pocketStyle;
      document
        .querySelectorAll("[data-pocket-style]")
        .forEach((item) => item.classList.toggle("selected", item === button));
      void style().catch(surfaceError);
    });
  document
    .getElementById("pocket-reset")
    .addEventListener("click", resetPocket);
  document
    .getElementById("pocket-fullscreen")
    .addEventListener("click", async () => {
      const panel = document.querySelector(".pocket-preview-panel");
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await panel.requestFullscreen();
      } catch (error) {
        document.getElementById("pocket-viewer-note").textContent =
          "浏览器不允许全屏，可使用窗口最大化查看。";
      }
    });
  for (const event of ["resize", "fullscreenchange"])
    window.addEventListener(event, () => {
      if (viewer) {
        viewer.resize();
        viewer.render();
      }
    });
}
