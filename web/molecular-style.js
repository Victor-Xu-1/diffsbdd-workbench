import { addFigureLabel } from "./figure-labels.js";
/** Shared publication figure conventions for both real molecular viewers. */
export const FIGURE_DEFAULTS = Object.freeze({
  proteinColor: "#9c63df",
  carbonColor: "#18ba26",
  surfaceOpacity: 0.3,
  proteinOpacity: 0.5,
  stickRadius: 0.14,
  representation: "cartoon",
  proteinScope: "full",
  ligandRepresentation: "stick",
  background: "#ffffff",
  projection: "orthographic",
  labels: true,
  sidechains: true,
  sidechainStyle: "line",
  contextRadius: 5,
  fog: true,
  surfaceType: "SES",
  showSurface: false,
});
export const FIGURE_PRESETS = Object.freeze({
  site: {
    label: "结合位点",
    settings: { ...FIGURE_DEFAULTS },
    focus: "ligand",
  },
  surface: {
    label: "口袋表面",
    settings: {
      ...FIGURE_DEFAULTS,
      labels: false,
      sidechains: false,
      surfaceOpacity: 0.5,
      proteinOpacity: 0.25,
      showSurface: true,
    },
    focus: "ligand",
  },
  protein: {
    label: "完整蛋白",
    settings: {
      ...FIGURE_DEFAULTS,
      labels: false,
      sidechains: false,
      proteinOpacity: 0.8,
    },
    focus: "protein",
  },
});
const ELEMENTS = {
  N: 0x315cc4,
  O: 0xd83c36,
  S: 0xd6b532,
  P: 0xe58b35,
  F: 0x70b657,
  Cl: 0x48a54c,
  Br: 0xa45c32,
  I: 0x82549d,
  H: 0xe4e4e4,
};
export const atomColor = (carbon) => (atom) =>
  atom.elem === "C" ? carbon : (ELEMENTS[atom.elem] ?? 0xa0a8af);
export function ligandStyle(kind, settings) {
  const colorfunc = atomColor(settings.carbonColor);
  if (kind === "sphere") return { sphere: { scale: 1, colorfunc } };
  if (kind === "line") return { line: { colorfunc, linewidth: 2 } };
  if (kind === "sticks")
    return { stick: { radius: settings.stickRadius, colorfunc } };
  return {
    stick: { radius: settings.stickRadius, colorfunc },
    sphere: { scale: 0.23, colorfunc },
  };
}
export function proteinStyle(settings) {
  const color = settings.proteinColor,
    opacity = settings.proteinOpacity;
  if (settings.representation === "line") return { line: { color, opacity } };
  if (settings.representation === "stick")
    return { stick: { color, opacity, radius: 0.1 } };
  return { cartoon: { color, opacity, thickness: 0.18, arrows: true } };
}
export function nearbyAtoms(model, points, radius) {
  const squared = radius * radius;
  return model
    .selectedAtoms({ hetflag: false })
    .filter((a) =>
      points.some(
        (b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 < squared,
      ),
    );
}
export function residueContext(
  viewer,
  settings,
  points,
  modelId = 0,
  allowedResidues = null,
) {
  const near = nearbyAtoms(
    viewer.getModel(modelId),
    points,
    settings.contextRadius,
  );
  const contextual = allowedResidues
    ? near.filter((atom) => allowedResidues.has(`${atom.chain}:${atom.resi}`))
    : near;
  const ids = new Set(contextual.map((a) => `${a.chain}:${a.resi}`));
  const selection = {
    model: modelId,
    predicate: (a) => ids.has(`${a.chain}:${a.resi}`),
  };
  // Thin cylinders remain legible in high-resolution export on GPUs with 1px GL lines.
  if (settings.sidechains)
    viewer.addStyle(
      selection,
      settings.sidechainStyle === "line"
        ? {
            stick: {
              radius: 0.025,
              colorfunc: atomColor("#777777"),
              opacity: 1,
            },
          }
        : {
            stick: {
              radius: 0.075,
              colorfunc: atomColor("#9a9a9a"),
              opacity: 0.8,
            },
          },
    );
  if (settings.labels) {
    const candidates = [];
    for (const atom of contextual) {
      if (
        candidates.some((a) => a.chain === atom.chain && a.resi === atom.resi)
      )
        continue;
      candidates.push(atom);
    }
    candidates.sort(
      (a, b) =>
        Math.min(
          ...points.map((p) => Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z)),
        ) -
        Math.min(
          ...points.map((p) => Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z)),
        ),
    );
    for (const atom of candidates.slice(0, 10)) {
      const anchor =
        viewer.getModel(modelId).selectedAtoms({
          chain: atom.chain,
          resi: atom.resi,
          atom: "CA",
        })[0] || atom;
      addFigureLabel(viewer, `${atom.resn} ${atom.chain}:${atom.resi}`, {
        position: anchor,
        font: "Arial",
        fontSize: 12,
        fontColor: 0x727272,
        backgroundOpacity: 0,
        inFront: false,
      });
    }
  }
}
export function applyCamera(viewer, settings) {
  viewer.setBackgroundColor(settings.background, 1);
  viewer.setProjection(settings.projection);
  viewer.enableFog(settings.fog);
}

export function validateFigureSettings(input) {
  const result = { ...FIGURE_DEFAULTS };
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("视图设置格式无效。");
  const limits = {
    surfaceOpacity: [0, 1],
    proteinOpacity: [0.1, 1],
    stickRadius: [0.08, 0.3],
    contextRadius: [3, 8],
  };
  const choices = {
    representation: ["cartoon", "stick", "line"],
    proteinScope: ["full", "pocket", "none"],
    ligandRepresentation: ["stick", "sticks", "sphere", "line"],
    projection: ["orthographic", "perspective"],
    surfaceType: ["SES", "VDW", "SAS"],
    sidechainStyle: ["line", "stick"],
  };
  for (const [key, value] of Object.entries(input)) {
    if (!(key in FIGURE_DEFAULTS)) throw new Error("视图设置包含未知字段。");
    if (
      limits[key] &&
      (!Number.isFinite(value) ||
        value < limits[key][0] ||
        value > limits[key][1])
    )
      throw new Error("显示参数超出允许范围。");
    if (choices[key] && !choices[key].includes(value))
      throw new Error("不支持的显示方式。");
    if (
      ["proteinColor", "carbonColor", "background"].includes(key) &&
      !/^#[0-9a-f]{6}$/i.test(value)
    )
      throw new Error("颜色必须为六位十六进制值。");
    if (
      ["labels", "sidechains", "fog", "showSurface"].includes(key) &&
      typeof value !== "boolean"
    )
      throw new Error("标注参数必须为布尔值。");
    result[key] = value;
  }
  return result;
}
export function validateViewRecipe(recipe) {
  if (
    recipe?.schema !== 1 ||
    !Array.isArray(recipe.camera) ||
    recipe.camera.length !== 8 ||
    recipe.camera.some((x) => !Number.isFinite(x) || Math.abs(x) > 100000)
  )
    throw new Error("视角文件无效或不受支持。");
  const q = recipe.camera.slice(4);
  if (Math.abs(Math.hypot(...q) - 1) > 0.01) throw new Error("视角旋转无效。");
  return {
    settings: validateFigureSettings(recipe.settings),
    camera: recipe.camera,
  };
}

export function resetCamera(viewer, model, zoom, rotation = 0) {
  viewer.zoomTo({ model });
  const view = viewer.getView();
  viewer.setView([...view.slice(0, 4), 0, 0, 0, 1]);
  viewer.zoom(zoom);
  if (rotation) viewer.rotate(rotation, "y");
  viewer.setSlab(-40, 40);
  viewer.render();
}
