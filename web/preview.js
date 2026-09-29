import { addFigureLabel, clearFigureLabels } from "./figure-labels.js";
import {
  applyCamera,
  resetCamera,
  fitBindingSite,
  ligandStyle,
  proteinStyle,
  nearbyAtoms,
  residueContext,
} from "./molecular-style.js";
import { registerFigure } from "./figure-panel.js";
import { addLigandModel, addProteinModel } from "./molecular-model.js";
import { observeMolecularViewport } from "./molecular-viewport.js";
import {
  analyzeInteractions,
  clearInteractions,
  drawInteractions,
  interactionResidues,
} from "./interactions.js";
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
  revision = 0;
const cache = new Map();
async function read(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("无法读取三维结构，请刷新任务后重试。");
  return response.text();
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
      0,
      null,
      interactionResidues("result", figureSettings),
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
  drawInteractions(viewer, "result", figureSettings);
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
  addProteinModel(
    viewer,
    figureSettings.proteinScope === "pocket" ? pocket : protein,
  );
  addLigandModel(viewer, ligand);
  comparisonModel = initial ? addLigandModel(viewer, initial) : null;
  style();
  fitBindingSite(viewer, figureSettings, interactionResidues("result"));
}
function analyze() {
  void analyzeInteractions(
    "result",
    protein,
    ligand,
    () => {
      fitBindingSite(viewer, figureSettings, interactionResidues("result"));
      style();
    },
    (item) => {
      viewer.zoomTo({
        or: [
          { model: 1 },
          { model: 0, chain: item.residue.chain, resi: item.residue.number },
        ],
      });
      viewer.zoom(0.85);
      viewer.render();
    },
  );
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
  clearInteractions("result");
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
  $("compare-input").checked = false;
  await loadEditor(ligand);
  if (current !== revision) return;
  scene();
  analyze();
}
export async function showEdited(job, edit) {
  clearInteractions("result");
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
  $("compare-input").disabled = false;
  $("compare-input").checked = false;
  ligand = pose.molblock;
  rings = pose.rings;
  selected.clear();
  $("fixed-atoms").value = "";
  await loadEditor(ligand);
  if (current !== revision) return false;
  scene();
  analyze();
  return true;
}
export function setupPreview() {
  setupEditorSelection({
    layoutError: () => {
      $("selection-sync").textContent =
        "二维编辑器取景未完成，请重新打开结构编辑页面。";
    },
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
      resetCamera(viewer, target === "protein" ? 0 : 1, 0.85);
    },
  });
  for (const id of ["atom-labels", "compare-input", "click-mode"])
    $(id).addEventListener("change", style);
  $("reset-view").addEventListener("click", () => {
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
  observeMolecularViewport(
    $("viewer"),
    () => viewer,
    () => {
      if (
        document.querySelector('[data-figure-preset="result"]').value ===
        "protein"
      )
        resetCamera(viewer, 0, 0.85, 0, null, true);
      else
        fitBindingSite(
          viewer,
          figureSettings,
          interactionResidues("result"),
          true,
        );
    },
  );
}
