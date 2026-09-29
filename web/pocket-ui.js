import { $, readFile, syncControls } from "./controls.js";
import { api } from "./api.js";
import { showPocket, setupPocketViewer } from "./pocket-viewer.js";

let referenceId = "A:330",
  proteinText = "",
  referenceText = "",
  current = null,
  sequence = 0,
  getSource = () => null,
  onError = () => {},
  onReady = () => {};
const selected = new Set();

export async function readPocketInputs() {
  const mode = $("mode").value;
  if (mode === "demo") return { mode };
  if (mode === "result") {
    const source = getSource();
    if (!source) throw new Error("请在任务结果中选择一个起始分子。");
    const payload = { mode, ...source };
    if ($("pocket-type").value === "residues")
      payload.residues = $("reference")
        .value.trim()
        .split(/[\s,，]+/)
        .filter(Boolean);
    return payload;
  }
  if ($("protein").files[0])
    proteinText = await readFile("protein", 5000000, "蛋白 PDB");
  if (!proteinText) throw new Error("请先上传蛋白 PDB 文件。");
  const payload = { mode: "custom", protein_text: proteinText };
  const type = $("pocket-type").value;
  if (type === "sdf") {
    if ($("reference-sdf").files[0])
      referenceText = await readFile("reference-sdf", 1000000, "参考 SDF");
    if (!referenceText) throw new Error("请上传参考配体 SDF。");
    payload.reference_sdf = referenceText;
  } else if (type === "residues")
    payload.residues = $("reference")
      .value.trim()
      .split(/[\s,，]+/)
      .filter(Boolean);
  else payload.reference = $("reference").value.trim();
  return payload;
}

export async function inspectPocket() {
  const version = ++sequence;
  onError();
  onReady(false);
  $("pocket-confirmed").classList.add("pending");
  $("pocket-confirm-title").textContent = "正在读取结构";
  $("pocket-confirm-detail").textContent = "解析蛋白、参考结构与所选残基…";
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
      `已识别结合口袋，包含 ${data.residue_count} 个残基。`;
    $("protein-read").hidden = false;
    onReady(true);
  } catch (error) {
    if (version !== sequence) return;
    $("pocket-confirm-title").textContent = "请检查输入结构";
    $("pocket-confirm-detail").textContent = error.message;
    $("protein-read").hidden = true;
    onError(error.message);
  }
}

function setMethod(method) {
  document.querySelectorAll("[name=pocket-method]").forEach((input) => {
    input.checked = input.value === method;
    input.closest("label").classList.toggle("selected", input.checked);
  });
  if (method === "residues") {
    if ($("pocket-type").value === "reference")
      referenceId = $("reference").value;
    $("pocket-type").value = "residues";
    $("reference").value = [...selected].join(" ");
    if ($("mode").value === "demo") $("mode").value = "custom";
  } else {
    $("pocket-type").value = referenceText ? "sdf" : "reference";
    if (!referenceText) $("reference").value = referenceId;
  }
  $("reference-file-area").hidden = method === "residues";
  syncControls();
}

function toggleResidue(id) {
  selected.has(id) ? selected.delete(id) : selected.add(id);
  setMethod("residues");
  onReady(false);
  $("pocket-confirm-title").textContent = "口袋选择已更改";
  $("pocket-confirm-detail").textContent =
    `已选择 ${selected.size} 个残基，点击“读取并确认口袋”应用。`;
  $("pocket-viewer-note").textContent =
    `${id} · ${selected.has(id) ? "已加入" : "已移除"}口袋选择`;
}

function residueDialog() {
  if (!current) {
    onError("请先读取蛋白结构。");
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

export async function loadExample() {
  referenceId = "A:330";
  $("mode").value = "demo";
  $("protein").value = "";
  $("reference-sdf").value = "";
  $("protein-name").textContent = "3rfm.pdb";
  $("reference-name").textContent = "PDB 内参考配体 · A:330";
  $("reference").value = "A:330";
  $("pocket-type").value = "reference";
  referenceText = "";
  setMethod("reference");
  syncControls();
  await inspectPocket();
}

export function setupPocketUI(callbacks) {
  ({ getSource, onError, onReady } = callbacks);
  setupPocketViewer();
  for (const id of ["reference", "pocket-type"])
    $(id).addEventListener("input", () => {
      sequence++;
      onReady(false);
      $("pocket-confirm-title").textContent = "输入已更改，请重新确认";
    });
  $("choose-protein").addEventListener("click", () => $("protein").click());
  $("choose-reference").addEventListener("click", () =>
    $("reference-sdf").click(),
  );
  $("protein").addEventListener("change", async () => {
    try {
      proteinText = await readFile("protein", 5000000, "蛋白 PDB");
      $("protein-name").textContent = $("protein").files[0].name;
      $("mode").value = "custom";
      syncControls();
      await inspectPocket();
    } catch (error) {
      onError(error.message);
    }
  });
  $("reference-sdf").addEventListener("change", async () => {
    try {
      referenceText = await readFile("reference-sdf", 1000000, "参考 SDF");
      $("reference-name").textContent = $("reference-sdf").files[0].name;
      if ($("mode").value === "demo") $("mode").value = "custom";
      setMethod("reference");
      await inspectPocket();
    } catch (error) {
      onError(error.message);
    }
  });
  $("clear-reference").addEventListener("click", () => {
    referenceText = "";
    referenceId = "";
    if ($("mode").value === "demo") $("mode").value = "custom";
    $("reference-sdf").value = "";
    $("reference-name").textContent = "未选择文件 · 可使用 PDB 配体编号";
    setMethod("reference");
    onReady(false);
  });
  document.querySelectorAll("[name=pocket-method]").forEach((input) =>
    input.addEventListener("change", () => {
      setMethod(input.value);
      onReady(false);
      if (input.value === "residues") residueDialog();
    }),
  );
  $("confirm-pocket").addEventListener("click", inspectPocket);
  $("show-residues").addEventListener("click", residueDialog);
  $("apply-residues").addEventListener("click", async () => {
    selected.clear();
    document
      .querySelectorAll("#residue-list input:checked")
      .forEach((input) => selected.add(input.value));
    setMethod("residues");
    $("residue-dialog").close();
    await inspectPocket();
  });
}
