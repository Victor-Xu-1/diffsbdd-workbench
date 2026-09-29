import { $, readFile, syncControls, setAtomSelection } from "./controls.js";
import { api } from "./api.js";
import { getContract } from "./contract.js";
import {
  showPocket,
  setupPocketViewer,
  highlightPocketSelection,
  clearPocket,
} from "./pocket-viewer.js";
let proteinText = "",
  referenceText = "",
  initialText = "",
  referenceId = "",
  current = null,
  sequence = 0,
  timer = null;
let getSource = () => null,
  onError = () => {},
  onReady = () => {};
const selected = new Set();
export async function readInitialPose() {
  if (!initialText)
    throw new Error("请先上传三维起始分子，或选择一个历史结果。");
  return initialText;
}
export async function currentProtein() {
  if (!proteinText) throw new Error("请先载入蛋白。");
  return proteinText;
}
export async function readPocketInputs() {
  const mode = $("mode").value;
  let payload;
  if (mode === "demo") payload = { mode };
  else if (mode === "result") {
    const source = getSource();
    if (!source) throw new Error("请先选择一个历史候选。");
    payload = { mode, ...source };
    if ($("pocket-type").value === "residues") payload.residues = [...selected];
  } else {
    if (!proteinText) throw new Error("请先上传蛋白 PDB。");
    payload = { mode: "custom", protein_text: proteinText };
    if ($("pocket-type").value === "sdf") {
      if (!referenceText) throw new Error("请选择参考配体 SDF。");
      payload.reference_sdf = referenceText;
    } else if ($("pocket-type").value === "residues")
      payload.residues = $("reference")
        .value.trim()
        .split(/[\s,，]+/)
        .filter(Boolean);
    else payload.reference = $("reference").value.trim();
  }
  if (initialText && mode !== "result" && $("task").value !== "generate")
    payload.initial_sdf = initialText;
  return payload;
}
function pending(message = "选择已更改，正在更新口袋…") {
  sequence++;
  onReady(false);
  $("pocket-confirmed").classList.add("pending");
  $("pocket-confirm-title").textContent = message;
  $("protein-read").hidden = !proteinText;
}
export async function inspectPocket() {
  clearTimeout(timer);
  pending("正在读取结构");
  const version = sequence;
  onError();
  try {
    const payload = await readPocketInputs();
    const data = await api("/api/pockets/inspect", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (version !== sequence) return;
    current = data;
    proteinText = data.protein;
    selected.clear();
    data.residues.forEach((id) => selected.add(id));
    showPocket(data, toggleResidue);
    $("pocket-confirmed").classList.remove("pending");
    $("pocket-confirm-title").textContent = "口袋已确认";
    $("pocket-confirm-detail").textContent =
      `已识别 ${data.residue_count} 个口袋残基。可直接在预览上点击调整。`;
    $("protein-read").hidden = false;
    $("show-residues").disabled = false;
    $("prepare-open").disabled = false;
    onReady(true);
    return true;
  } catch (error) {
    if (version !== sequence) return false;
    $("pocket-confirm-title").textContent = "请检查结构或选择口袋";
    $("pocket-confirm-detail").textContent = error.message;
    onError(error.message);
    return false;
  }
}
function method(value) {
  document.querySelectorAll("[name=pocket-method]").forEach((input) => {
    input.checked = input.value === value;
    input.closest("label").classList.toggle("selected", input.checked);
  });
  $("reference-file-area").hidden = value === "residues";
  if (value === "residues") {
    if ($("pocket-type").value === "reference")
      referenceId = $("reference").value;
    $("pocket-type").value = "residues";
    $("reference").value = [...selected].join(" ");
    if ($("mode").value === "demo") $("mode").value = "custom";
  } else {
    $("pocket-type").value = referenceText ? "sdf" : "reference";
    $("reference").value = referenceId;
  }
  syncControls();
}
function toggleResidue(id) {
  selected.has(id) ? selected.delete(id) : selected.add(id);
  method("residues");
  pending();
  highlightPocketSelection(selected);
  $("pocket-confirm-detail").textContent = `已选择 ${selected.size} 个残基。`;
  clearTimeout(timer);
  if (selected.size) timer = setTimeout(() => void inspectPocket(), 450);
  else $("pocket-confirm-title").textContent = "请在蛋白预览上点选残基";
}
function residueDialog() {
  if (!current) {
    onError("请先载入蛋白。");
    return;
  }
  $("residue-list").replaceChildren();
  for (const residue of current.inventory) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected.has(residue.id);
    input.value = residue.id;
    label.append(input, `${residue.id} ${residue.name}`);
    $("residue-list").append(label);
  }
  $("residue-dialog").showModal();
}
function resetFiles() {
  clearTimeout(timer);
  for (const id of ["protein", "reference-sdf", "initial-sdf"])
    $(id).value = "";
  initialText = "";
  referenceText = "";
  setAtomSelection([]);
}
export async function loadProtein(text, name = "蛋白.pdb") {
  pending("正在识别蛋白与参考配体");
  onError();
  resetFiles();
  const version = sequence;
  const data = await api("/api/structures/prepare", {
    method: "POST",
    body: JSON.stringify({
      protein_text: text,
      remove_water: false,
      keep_ligands: true,
    }),
  });
  if (version !== sequence) return;
  proteinText = data.protein;
  $("protein-name").textContent = name;
  $("mode").value = "custom";
  selected.clear();
  const ligands = data.ligands.filter((ligand) => ligand.atoms >= 3);
  $("detected-ligand").replaceChildren();
  for (const ligand of ligands)
    $("detected-ligand").add(
      new Option(
        `${ligand.name} · ${ligand.id} · ${ligand.atoms} 原子`,
        ligand.id,
      ),
    );
  $("ligand-choice").hidden = !ligands.length;
  if (ligands.length) {
    referenceId = ligands[0].id;
    $("reference-name").textContent = `${ligands[0].name} · ${referenceId}`;
    method("reference");
    await inspectPocket();
  } else {
    referenceId = "";
    method("residues");
    current = {
      protein: proteinText,
      pocket: "",
      reference: "",
      reference_format: "pdb",
      residues: [],
      residue_count: 0,
      inventory: data.inventory,
    };
    showPocket(current, toggleResidue);
    $("pocket-confirm-title").textContent = "请点选蛋白上的口袋残基";
    $("pocket-confirm-detail").textContent =
      "没有参考配体也可以设计：直接在右侧蛋白上点选。";
    $("protein-read").hidden = false;
    $("show-residues").disabled = false;
    $("prepare-open").disabled = false;
  }
}
export async function restorePocketInputs(data) {
  resetFiles();
  $("mode").value = data.mode;
  proteinText = data.protein_text || "";
  referenceText = data.reference_sdf || "";
  initialText = data.initial_sdf || "";
  referenceId = data.reference || "";
  selected.clear();
  (data.residues || []).forEach((id) => selected.add(id));
  $("protein-name").textContent = "已保存的蛋白.pdb";
  $("reference-name").textContent = referenceText
    ? "已保存的参考配体.sdf"
    : referenceId || "手动选择的口袋";
  $("ligand-choice").hidden = true;
  method(data.residues?.length ? "residues" : "reference");
  return inspectPocket();
}
export async function loadExample() {
  resetFiles();
  $("mode").value = "demo";
  const example = getContract().example;
  referenceId = example.reference;
  $("protein-name").textContent = example.name;
  $("reference-name").textContent = `PDB 内参考配体 · ${example.reference}`;
  $("ligand-choice").hidden = true;
  method("reference");
  return inspectPocket();
}
export function setupPocketUI(callbacks) {
  ({ getSource, onError, onReady } = callbacks);
  setupPocketViewer();
  const safely = (fn) => async () => {
    try {
      await fn();
    } catch (error) {
      pending("请检查输入文件");
      onError(error.message);
    }
  };
  $("choose-protein").addEventListener("click", () => $("protein").click());
  $("choose-reference").addEventListener("click", () =>
    $("reference-sdf").click(),
  );
  $("protein").addEventListener(
    "change",
    safely(async () => {
      const name = $("protein").files[0]?.name;
      await loadProtein(await readFile("protein", 5000000, "蛋白 PDB"), name);
    }),
  );
  $("reference-sdf").addEventListener(
    "change",
    safely(async () => {
      referenceText = await readFile("reference-sdf", 1000000, "参考 SDF");
      $("reference-name").textContent = $("reference-sdf").files[0].name;
      if ($("mode").value === "demo") $("mode").value = "custom";
      method("reference");
      await inspectPocket();
    }),
  );
  $("initial-sdf").addEventListener(
    "change",
    safely(async () => {
      initialText = await readFile("initial-sdf", 1000000, "三维起始 SDF");
      await api("/api/poses/inspect", {
        method: "POST",
        body: JSON.stringify({ sdf: initialText }),
      });
      setAtomSelection([]);
      await inspectPocket();
    }),
  );
  $("task").addEventListener("change", () => {
    if (current) void inspectPocket();
  });
  $("detected-ligand").addEventListener(
    "change",
    safely(async () => {
      referenceId = $("detected-ligand").value;
      referenceText = "";
      $("reference-name").textContent =
        $("detected-ligand").selectedOptions[0].textContent;
      method("reference");
      await inspectPocket();
    }),
  );
  $("clear-reference").addEventListener("click", () => {
    referenceText = "";
    referenceId = "";
    $("reference-name").textContent = "未选择参考配体";
    method("residues");
    pending("请在预览中选择口袋残基");
    residueDialog();
  });
  for (const id of ["reference", "pocket-type"])
    $(id).addEventListener("input", () => pending("输入已改变，请确认口袋"));
  document.querySelectorAll("[name=pocket-method]").forEach((input) =>
    input.addEventListener("change", () => {
      method(input.value);
      if (input.value === "residues") {
        $("pocket-selection-mode").value = "pocket";
        residueDialog();
      } else void inspectPocket();
    }),
  );
  $("show-residues").addEventListener("click", residueDialog);
  $("apply-residues").addEventListener("click", async () => {
    selected.clear();
    document
      .querySelectorAll("#residue-list input:checked")
      .forEach((input) => selected.add(input.value));
    method("residues");
    $("residue-dialog").close();
    await inspectPocket();
  });
}

export function hasInitialPose() {
  return $("mode").value === "result"
    ? Boolean(getSource())
    : Boolean(initialText);
}

export function clearInputs() {
  resetFiles();
  pending("请先选择蛋白");
  proteinText = "";
  referenceId = "";
  current = null;
  selected.clear();
  $("mode").value = "custom";
  $("protein-name").textContent = "尚未选择蛋白";
  $("reference-name").textContent = "尚未选择参考配体";
  $("reference").value = "";
  $("protein-read").hidden = true;
  $("show-residues").disabled = true;
  $("prepare-open").disabled = true;
  $("ligand-choice").hidden = true;
  $("pocket-confirm-detail").textContent =
    "上传 PDB，或点击右上角载入官方示例。";
  clearPocket();
}
