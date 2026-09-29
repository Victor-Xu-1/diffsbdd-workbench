import { $, api, run, saveDownload } from "./workspace-utils.js";
let protein = "",
  result = null,
  revision = 0,
  callbacks;
function stale() {
  revision += 1;
  result = null;
  $("prepare-download").disabled = true;
  $("prepare-use").disabled = true;
  $("prepare-status").textContent = "选项已改变，点击“应用处理”重新生成。";
}
async function process(reset = false) {
  if (!protein) throw new Error("请先上传或读取一个蛋白 PDB。");
  stale();
  const token = revision;
  $("prepare-status").textContent = "正在处理结构…";
  const chains = reset
    ? []
    : [...$("prepare-chains").querySelectorAll("input:checked")].map(
        (node) => node.value,
      );
  if (!reset && !chains.length) throw new Error("请至少选择一条链。");
  const prepared = await api("/api/structures/prepare", {
    method: "POST",
    body: JSON.stringify({
      protein_text: protein,
      chains,
      remove_water: $("prepare-water").checked,
      keep_ligands: $("prepare-ligands").checked,
      remove_hydrogens: $("prepare-hydrogens").checked,
    }),
  });
  if (token !== revision) return;
  result = prepared;
  if (reset) {
    $("prepare-chains").replaceChildren();
    for (const chain of result.chains) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.value = chain.id;
      input.checked = true;
      input.addEventListener("change", stale);
      label.append(input, `链 ${chain.id} · ${chain.residues} 个残基/组分`);
      $("prepare-chains").append(label);
    }
  }
  $("prepare-status").textContent =
    `已处理：保留 ${result.output_atoms} 个原子，移除 ${result.removed_atoms} 个原子；检测到 ${result.ligands.length} 个非蛋白组分。${result.models_in_file > 1 ? "使用文件中的第一个模型。" : ""}`;
  $("prepare-download").disabled = false;
  $("prepare-use").disabled = false;
}
export function setupPreparation(handlers) {
  callbacks = handlers;
  $("prepare-file").addEventListener(
    "change",
    run(async () => {
      const file = $("prepare-file").files[0];
      if (!file || file.size > 5000000)
        throw new Error("请选择不超过 5 MB 的 PDB 文件。");
      stale();
      const token = revision;
      const text = await file.text();
      if (token !== revision) return;
      protein = text;
      await process(true);
    }, callbacks.onError),
  );
  $("prepare-current").addEventListener(
    "click",
    run(async () => {
      stale();
      const token = revision;
      const current = await callbacks.readInputs();
      if (token !== revision) return;
      if (!current.protein_text)
        throw new Error("请先在设计页读取蛋白，或直接上传 PDB。");
      protein = current.protein_text;
      await process(true);
    }, callbacks.onError),
  );
  for (const id of ["prepare-water", "prepare-ligands", "prepare-hydrogens"])
    $(id).addEventListener("change", stale);
  $("prepare-run").addEventListener(
    "click",
    run(() => process(), callbacks.onError),
  );
  $("prepare-download").addEventListener("click", () => {
    if (result)
      saveDownload(result.protein, "prepared-protein.pdb", "chemical/x-pdb");
  });
  $("prepare-use").addEventListener(
    "click",
    run(async () => {
      if (result)
        await callbacks.useProtein(result.protein, "处理后的蛋白.pdb");
    }, callbacks.onError),
  );
}
