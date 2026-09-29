import { addFigureLabel, clearFigureLabels } from "./figure-labels.js";
import {
  applyCamera,
  resetCamera,
  ligandStyle,
  proteinStyle,
  nearbyAtoms,
  residueContext,
} from "./molecular-style.js";
import { registerFigure } from "./figure-panel.js";
import { loadEditor } from "./editor-bridge.js";
import { $, parseAtomNumbers, setAtomSelection } from "./controls.js";
let figureSettings,
  surfaceTask = Promise.resolve();
let comparisonModel = null;
let sceneVersion = 0,
  surfaceKey = "";
let viewer,
  ligand,
  pocket = "",
  protein = "",
  initial = "",
  selected = new Set(),
  measurement = [],
  animation = null,
  trajectory = null,
  revision = 0;
const cache = new Map();
async function read(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("无法读取三维结构，请刷新任务后重试。");
  return response.text();
}
function stopAnimation() {
  if (animation) clearInterval(animation);
  animation = null;
  $("trajectory-play").textContent = "播放生成过程";
}
function atomName(atom) {
  return atom.model === 1
    ? `${atom.elem}${atom.index + 1}`
    : `${atom.chain || ""}:${atom.resn || ""}${atom.resi || ""} ${atom.atom || atom.elem}`;
}
function clicked(atom) {
  const mode = $("click-mode").value;
  if (mode === "select" && atom.model === 1) {
    selected.has(atom.index)
      ? selected.delete(atom.index)
      : selected.add(atom.index);
    setAtomSelection([...selected]);
    style();
    $("viewer-note").textContent =
      `已保留 ${selected.size} 个原子；橙色标记。编号也可在左侧输入。`;
  } else if (mode === "measure") {
    measurement.push(atom);
    if (measurement.length > 2) measurement = [atom];
    if (measurement.length === 2) {
      const [a, b] = measurement;
      const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      viewer.addLine({ start: a, end: b, color: "#d16a37", dashed: true });
      addFigureLabel(viewer, `${distance.toFixed(2)} Å`, {
        position: {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          z: (a.z + b.z) / 2,
        },
        fontSize: 13,
        backgroundColor: "#ffffff",
        fontColor: "#233247",
      });
      viewer.render();
      $("viewer-note").textContent =
        `${atomName(a)} → ${atomName(b)}：${distance.toFixed(2)} Å（几何距离，不自动判定氢键）。`;
    } else
      $("viewer-note").textContent =
        `已选择 ${atomName(atom)}，请点击第二个原子。`;
  } else
    $("viewer-note").textContent =
      `${atomName(atom)} · 坐标 ${atom.x.toFixed(2)}, ${atom.y.toFixed(2)}, ${atom.z.toFixed(2)} Å`;
}
function style() {
  if (!viewer) return;
  clearFigureLabels(viewer);
  viewer.removeAllShapes();
  applyCamera(viewer, figureSettings);
  viewer.setStyle(
    { model: 0 },
    $("protein-view").value === "none" ? {} : proteinStyle(figureSettings),
  );
  const kind = $("ligand-view").value;
  viewer.setStyle({ model: 1 }, ligandStyle(kind, figureSettings));
  if ($("protein-view").value !== "none")
    residueContext(
      viewer,
      figureSettings,
      viewer.getModel(1).selectedAtoms({}),
    );
  if (selected.size)
    viewer.addStyle(
      { model: 1, index: [...selected] },
      { sphere: { scale: 0.4, color: "#f39b32" } },
    );
  if (comparisonModel) {
    comparisonModel.setStyle(
      {},
      $("compare-input").checked
        ? { stick: { radius: 0.1, color: "#9857ba", opacity: 0.7 } }
        : {},
    );
  }
  if ($("atom-labels").checked)
    for (const atom of viewer.getModel(1)?.selectedAtoms({}) || [])
      addFigureLabel(viewer, `${atom.elem}${atom.index + 1}`, {
        position: atom,
        fontSize: 11,
        backgroundOpacity: 0,
        fontColor: "#3f5363",
      });
  viewer.setClickable({ model: 1 }, true, clicked);
  viewer.setClickable({ model: 0 }, true, clicked);
  const nextSurfaceKey = `${sceneVersion}:${$("surface").checked}:${$("protein-view").value}:${figureSettings.surfaceType}:${figureSettings.surfaceOpacity}:${figureSettings.proteinColor}`;
  if (surfaceKey !== nextSurfaceKey) {
    surfaceKey = nextSurfaceKey;
    viewer.removeAllSurfaces();
    if ($("surface").checked && $("protein-view").value !== "none") {
      $("viewer-note").textContent = "正在绘制口袋表面…";
      surfaceTask = viewer
        .addSurface(
          window.$3Dmol.SurfaceType[figureSettings.surfaceType],
          {
            opacity: figureSettings.surfaceOpacity,
            color: figureSettings.proteinColor,
          },
          {
            model: 0,
            index: nearbyAtoms(
              viewer.getModel(0),
              viewer.getModel(1).selectedAtoms({}),
              10,
            ).map((a) => a.index),
          },
        )
        .then(() => {
          if (surfaceKey === nextSurfaceKey)
            $("viewer-note").textContent =
              "口袋表面已显示；表面形状仅用于几何观察。";
        })
        .catch(() => {
          if (surfaceKey === nextSurfaceKey)
            $("viewer-note").textContent =
              "表面生成失败，请关闭表面显示并重新勾选。";
        });
    }
  }
  viewer.resize();
  viewer.render();
}
function scene() {
  sceneVersion += 1;
  if (!viewer)
    viewer = window.$3Dmol.createViewer($("viewer"), {
      backgroundColor: "#ffffff",
      cartoonQuality: 10,
      disableFog: true,
      antialias: true,
    });
  viewer.removeAllModels();
  viewer.addModel($("protein-view").value === "full" ? protein : pocket, "pdb");
  viewer.addModel(ligand || "", "mol");
  comparisonModel = initial ? viewer.addModel(initial, "sdf") : null;
  style();
  resetCamera(viewer, 1, 0.8);
}
export async function showMolecule(job, index) {
  stopAnimation();
  const current = ++revision;
  const mol = await read(`/api/jobs/${job.id}/molecules/${index}.mol`);
  if (!cache.has(job.id)) {
    const texts = await Promise.all([
      read(`/api/jobs/${job.id}/files/pocket.pdb`),
      read(`/api/jobs/${job.id}/files/protein.pdb`),
    ]);
    if (cache.size >= 2) cache.delete(cache.keys().next().value);
    cache.set(job.id, texts);
  }
  const source =
    job.report?.mode === "optimization" || job.report?.mode === "inpaint"
      ? await read(`/api/jobs/${job.id}/files/edited_input.sdf`)
      : "";
  if (current !== revision) return;
  [pocket, protein] = cache.get(job.id);
  ligand = mol;
  initial = source;
  selected.clear();
  measurement = [];
  $("fixed-atoms").value = "";
  $("compare-input").disabled = !initial;
  $("compare-input").checked = !!initial;
  $("trajectory-controls").hidden = true;
  trajectory = null;
  await loadEditor(ligand);
  if (current !== revision) return;
  scene();
  if (job.status !== "running" && job.report?.settings?.trajectory) {
    const result = await fetch(`/api/jobs/${job.id}/files/trajectory.json`);
    if (result.ok && current === revision) {
      trajectory = await result.json();
      $("trajectory-controls").hidden = false;
      $("trajectory-frame").max = trajectory.frames.length - 1;
      $("trajectory-frame").value = 0;
    }
  }
}
export async function showEdited(job, edit) {
  stopAnimation();
  const text = await read(`/api/jobs/${job.id}/edits/${edit.id}.sdf`);
  initial = ligand;
  $("compare-input").disabled = false;
  $("compare-input").checked = true;
  ligand = text.split("$$$$")[0];
  selected.clear();
  $("fixed-atoms").value = "";
  await loadEditor(ligand);
  scene();
}
function frame() {
  if (!trajectory || !viewer) return;
  const i = Number($("trajectory-frame").value),
    snapshot = trajectory.frames[i];
  const xyz =
    `${snapshot.elements.length}\nDiffusion intermediate\n` +
    snapshot.elements
      .map((element, j) => `${element} ${snapshot.coordinates[j].join(" ")}`)
      .join("\n");
  viewer.removeAllModels();
  comparisonModel = null;
  viewer.addModel(pocket, "pdb");
  viewer.addModel(xyz, "xyz");
  viewer.setStyle({ model: 0 }, { line: { color: "#9baab9" } });
  viewer.setStyle(
    { model: 1 },
    { sphere: { scale: 0.25, colorscheme: "cyanCarbon" } },
  );
  viewer.render();
  $("trajectory-label").textContent =
    `第 ${i + 1} / ${trajectory.frames.length} 帧 · 中间状态不作为化学有效分子使用`;
}
export function setupPreview() {
  figureSettings = registerFigure("result", {
    viewer: () => viewer,
    element: () => $("viewer"),
    redraw: () => {
      style();
      return surfaceTask;
    },
    ready: () => surfaceTask,
  });
  for (const id of ["ligand-view", "surface", "atom-labels", "compare-input"])
    $(id).addEventListener("change", style);
  $("protein-view").addEventListener("change", () => {
    if (viewer) scene();
  });
  $("reset-view").addEventListener("click", () => {
    stopAnimation();
    if (viewer) scene();
  });
  $("clear-fixed").addEventListener("click", () => {
    selected.clear();
    $("fixed-atoms").value = "";
    style();
  });
  $("fixed-atoms").addEventListener("change", () => {
    try {
      selected = new Set(parseAtomNumbers($("fixed-atoms").value));
      style();
    } catch (e) {
      $("viewer-note").textContent = e.message;
    }
  });
  $("trajectory-frame").addEventListener("input", () => {
    stopAnimation();
    frame();
  });
  $("trajectory-play").addEventListener("click", () => {
    if (animation) {
      stopAnimation();
      return;
    }
    if (!trajectory) return;
    $("trajectory-play").textContent = "暂停";
    animation = setInterval(() => {
      $("trajectory-frame").value =
        (Number($("trajectory-frame").value) + 1) % trajectory.frames.length;
      frame();
    }, 180);
  });
  $("trajectory-exit").addEventListener("click", () => {
    stopAnimation();
    scene();
  });
  window.addEventListener("resize", () => {
    if (viewer) {
      viewer.resize();
      viewer.render();
    }
  });
}
