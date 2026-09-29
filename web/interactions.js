/** One local analysis/display path for input, generated and edited complexes. */
import { api } from "./api.js";
import { addFigureLabel } from "./figure-labels.js";
const states = new Map();
const kinds = {
  hydrogen_bond: { label: "氢键候选", color: "#b8a125" },
  pi_stacking: { label: "π–π 堆积", color: "#885bb2" },
  salt_bridge: { label: "盐桥候选", color: "#d36c98" },
  hydrophobic: { label: "疏水接触", color: "#83929f" },
};
function state(id) {
  if (!states.has(id))
    states.set(id, { revision: 0, data: null, refresh: () => {} });
  return states.get(id);
}
export function clearInteractions(id) {
  const s = state(id);
  s.revision++;
  s.controller?.abort();
  s.data = null;
  s.protein = "";
  s.sdf = "";
  document.getElementById(`${id}-interactions`).replaceChildren();
}
function panel(id, s, content) {
  const container = document.getElementById(`${id}-interactions`);
  container.replaceChildren(content);
  container.hidden = false;
}
function drawPanel(id, s) {
  const details = document.createElement("details"),
    summary = document.createElement("summary");
  const entries = Object.entries(kinds);
  summary.textContent = entries
    .map(([key, value]) => `${value.label} ${s.data.summary[key]}`)
    .join(" · ");
  summary.title = "展开查看判定依据、残基与距离。显示开关在“显示与出图”中。";
  details.append(summary);
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = `${s.data.engine} · ${s.data.note}`;
  details.append(note);
  if (!s.data.interactions.length) {
    const p = document.createElement("p");
    p.textContent = "当前构象未检出这些类型的相互作用。";
    details.append(p);
  }
  for (const item of s.data.interactions) {
    const row = document.createElement("div");
    row.className = "interaction-row";
    const text = document.createElement("span");
    text.textContent = `${kinds[item.kind].label} · ${item.residue.name} ${item.residue.chain}:${item.residue.number} · ${item.distance.toFixed(2)} Å`;
    text.title = `${item.label}；配体原子 ${item.ligand_atoms.map((i) => i + 1).join(", ")}；蛋白 ${item.protein_atoms.join(", ")}。${item.kind === "pi_stacking" ? "环心距离" : "重原子距离"}。`;
    const focus = document.createElement("button");
    focus.type = "button";
    focus.textContent = "定位";
    focus.addEventListener("click", () => s.focus?.(item));
    row.append(text, focus);
    details.append(row);
  }
  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "下载相互作用记录";
  download.addEventListener("click", () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(s.data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "interactions.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  details.append(download);
  panel(id, s, details);
}
export async function analyzeInteractions(id, protein, sdf, refresh, focus) {
  const s = state(id);
  s.refresh = refresh;
  s.focus = focus;
  if (s.protein === protein && s.sdf === sdf && s.data) {
    drawPanel(id, s);
    return;
  }
  clearInteractions(id);
  s.protein = protein;
  s.sdf = sdf;
  if (!sdf) return;
  const revision = s.revision;
  s.controller = new AbortController();
  const pending = document.createElement("p");
  pending.className = "hint";
  pending.textContent = "正在分析配体与蛋白的相互作用…";
  panel(id, s, pending);
  try {
    const data = await api("/api/interactions/inspect", {
      method: "POST",
      signal: s.controller.signal,
      body: JSON.stringify({ protein_text: protein, sdf }),
    });
    if (revision !== s.revision) return;
    s.data = data;
    drawPanel(id, s);
    s.refresh();
  } catch (error) {
    if (revision !== s.revision) return;
    const row = document.createElement("div"),
      message = document.createElement("p"),
      retry = document.createElement("button");
    message.textContent = `相互作用未完成：${error.message}`;
    retry.type = "button";
    retry.textContent = "重新分析";
    retry.addEventListener(
      "click",
      () => void analyzeInteractions(id, protein, sdf, refresh, focus),
    );
    row.append(message, retry);
    panel(id, s, row);
  }
}
export function interactionResidues(id) {
  const data = state(id).data;
  return new Set(
    (data?.interactions || []).map(
      (item) => `${item.residue.chain}:${item.residue.number}`,
    ),
  );
}
export function drawInteractions(viewer, id, settings) {
  if (!settings.showInteractions || settings.proteinScope === "none") return;
  const data = state(id).data;
  if (!data) return;
  const records = data.interactions.filter(
    (item) => settings.hydrophobic || item.kind !== "hydrophobic",
  );
  for (const item of records.slice(0, 24)) {
    const start = { x: item.start[0], y: item.start[1], z: item.start[2] },
      end = { x: item.end[0], y: item.end[1], z: item.end[2] },
      color = kinds[item.kind].color;
    const distance = Math.hypot(
        end.x - start.x,
        end.y - start.y,
        end.z - start.z,
      ),
      segments = Math.max(1, Math.ceil(distance / 0.36));
    const at = (t) => ({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      z: start.z + (end.z - start.z) * t,
    });
    for (let i = 0; i < segments; i++)
      viewer.addCylinder({
        start: at(i / segments),
        end: at((i + 0.55) / segments),
        radius: 0.045,
        color,
        fromCap: 2,
        toCap: 2,
      });
    if (settings.labels)
      addFigureLabel(viewer, `${item.distance.toFixed(2)} Å`, {
        position: at(0.5),
        fontSize: 12,
        fontColor: color,
        backgroundColor: "#ffffff",
        backgroundOpacity: 0.85,
        borderThickness: 0,
        inFront: true,
      });
  }
}
