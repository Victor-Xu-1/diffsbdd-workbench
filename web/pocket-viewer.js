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
  if (styleName !== "surface") {
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
  viewer.setClickable({ model: 0, hetflag: false }, true, (atom) =>
    selectResidue?.(`${atom.chain}:${atom.resi}`),
  );
  viewer.resize();
  viewer.render();
  surfaceTask = drawSurface(current);
  return surfaceTask;
}
export function showPocket(value, onResidue) {
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
  viewer.addModel(value.reference || "", value.reference_format || "pdb");
  viewer.addModel(value.pocket, "pdb");
  void style().catch(surfaceError);
  resetPocket();
}
export function resetPocket() {
  if (!viewer) return;
  resetCamera(viewer, data?.reference ? 1 : 2, data?.reference ? 0.65 : 1, 60);
}
export function setupPocketViewer() {
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
