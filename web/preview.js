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
import {
  loadEditor,
  setupEditorSelection,
  highlightEditorAtoms,
} from "./editor-bridge.js";
import { api } from "./api.js";
import {
  selectionGroup,
  toggleGroup,
  enableMolecularHover,
  clearHover,
} from "./molecular-selection.js";
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
  rings = [],
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
    selected = new Set(
      toggleGroup(
        [...selected],
        selectionGroup(atom.index, rings, $("result-pick").value),
      ),
    );
    setAtomSelection([...selected]);
    style();
    $("viewer-note").textContent =
      `已选择 ${selected.size} 个原子；橙色标记。可用于下一轮保留片段设计。`;
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
  clearHover(viewer);
  viewer.removeAllShapes();
  applyCamera(viewer, figureSettings);
  viewer.setStyle(
    { model: 0 },
    figureSettings.proteinScope === "none" ? {} : proteinStyle(figureSettings),
  );
  const kind = figureSettings.ligandRepresentation;
  viewer.setStyle({ model: 1 }, ligandStyle(kind, figureSettings));
  if (figureSettings.proteinScope !== "none")
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
  viewer.setClickable(
    { model: 0 },
    $("click-mode").value !== "select",
    clicked,
  );
  enableMolecularHover(viewer);
  const nextSurfaceKey = `${sceneVersion}:${figureSettings.showSurface}:${figureSettings.proteinScope}:${figureSettings.surfaceType}:${figureSettings.surfaceOpacity}:${figureSettings.proteinColor}`;
  if (surfaceKey !== nextSurfaceKey) {
    surfaceKey = nextSurfaceKey;
    viewer.removeAllSurfaces();
    if (figureSettings.showSurface && figureSettings.proteinScope !== "none") {
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
              "表面生成失败，请重新选择口袋表面方案。";
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
  viewer.addModel(
    figureSettings.proteinScope === "pocket" ? pocket : protein,
    "pdb",
  );
  viewer.addModel(ligand || "", "mol");
  comparisonModel = initial ? viewer.addModel(initial, "sdf") : null;
  style();
  resetCamera(viewer, 1, 1.05);
}
async function contextFor(job) {
  if (!cache.has(job.id)) {
    const texts = await Promise.all([
      read(`/api/jobs/${job.id}/files/pocket.pdb`),
      read(`/api/jobs/${job.id}/files/protein.pdb`),
    ]);
    if (cache.size >= 2) cache.delete(cache.keys().next().value);
    cache.set(job.id, texts);
  }
  return cache.get(job.id);
}
export async function showMolecule(job, index) {
  stopAnimation();
  const current = ++revision;
  const mol = await read(`/api/jobs/${job.id}/molecules/${index}.mol`);
  const pose = await api("/api/poses/inspect", {
    method: "POST",
    body: JSON.stringify({ sdf: mol }),
  });
  const context = await contextFor(job);
  const source =
    job.report?.mode === "optimization" || job.report?.mode === "inpaint"
      ? await read(`/api/jobs/${job.id}/files/edited_input.sdf`)
      : "";
  if (current !== revision) return;
  [pocket, protein] = context;
  ligand = pose.molblock;
  rings = pose.rings;
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
  const current = ++revision;
  const text = await read(`/api/jobs/${job.id}/edits/${edit.id}.sdf`);
  const pose = await api("/api/poses/inspect", {
    method: "POST",
    body: JSON.stringify({ sdf: text }),
  });
  const [context, parent] = await Promise.all([
    contextFor(job),
    read(`/api/jobs/${job.id}/molecules/${edit.parent_index}.mol`),
  ]);
  if (current !== revision) return false;
  [pocket, protein] = context;
  initial = parent;
  trajectory = null;
  $("trajectory-controls").hidden = true;
  $("compare-input").disabled = false;
  $("compare-input").checked = true;
  ligand = pose.molblock;
  rings = pose.rings;
  selected.clear();
  $("fixed-atoms").value = "";
  await loadEditor(ligand);
  if (current !== revision) return false;
  scene();
  return true;
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
  setupEditorSelection({
    mapped: () => {
      $("selection-sync").textContent =
        "二维与三维原子已建立对应，可点选联动。";
    },
    selected: (indices) => {
      if ($("results-view").hidden) return;
      setAtomSelection(indices);
      $("selection-sync").textContent =
        `二维与三维已对应选择 ${indices.length} 个原子。`;
    },
    changed: () => {
      setAtomSelection([]);
      $("selection-sync").textContent =
        "二维结构已修改；保存编辑后会更新三维构象和原子对应关系。";
    },
    unmapped: () => {
      $("selection-sync").textContent =
        "当前二维结构与三维原子无法可靠对应，请先保存编辑版。";
    },
  });
  figureSettings = registerFigure("result", {
    viewer: () => viewer,
    element: () => $("viewer"),
    redraw: () => {
      const camera = viewer?.getView();
      if (viewer) scene();
      if (camera) viewer.setView(camera);
      return surfaceTask;
    },
    ready: () => surfaceTask,
    focus: (target) => {
      resetCamera(
        viewer,
        target === "protein" ? 0 : 1,
        target === "protein" ? 0.95 : 1.05,
      );
    },
  });
  for (const id of ["atom-labels", "compare-input", "click-mode"])
    $(id).addEventListener("change", style);
  $("reset-view").addEventListener("click", () => {
    stopAnimation();
    if (viewer) scene();
  });
  $("clear-fixed").addEventListener("click", () => {
    setAtomSelection([]);
  });
  $("fixed-atoms").addEventListener("change", () => {
    try {
      selected = new Set(parseAtomNumbers($("fixed-atoms").value));
      if (!$("results-view").hidden && highlightEditorAtoms([...selected]))
        $("selection-sync").textContent =
          `二维与三维已对应选择 ${selected.size} 个原子。`;
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
