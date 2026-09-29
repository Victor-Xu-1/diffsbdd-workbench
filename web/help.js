/** Short medicinal-chemistry explanations available on hover, focus and tap. */
const explanations = {
  "detected-ligand":
    "请选择用于定位目标结合位点的小分子。一个文件中有多个配体时，请结合三维位置判断。",
  count:
    "这是模型尝试生成的数量。未通过化学检查的结构会被剔除，因此最终有效数量可能更少。",
  size_mode:
    "自动采样：按口袋选择重原子数，适合一般探索。指定大小：已有明确分子大小目标时使用。",
  atoms:
    "不计氢原子的原子数量。初次试用建议 20–40 个；过大分子更难得到合理结构。",
  "model-dataset":
    "训练数据来源。一般先使用 CrossDocked；需要比较模型时再尝试 Binding MOAD。",
  "model-strategy":
    "条件模型直接根据给定口袋设计分子，支持保留片段和优化。联合模型只用于从头生成。",
  "model-representation":
    "全原子使用更细的口袋信息；Cα 只使用蛋白主链代表点。默认全原子即可。",
  steps:
    "每个候选逐步形成结构的计算步数。500 步是原模型设置；减少步数可试跑，但可能降低结构质量。",
  resamplings:
    "重新探索同一个去噪阶段的次数。更多次数增加耗时，不保证一定产生更好的结构。",
  jump_length: "联合模型重新探索时回退的步数。一般保留默认值。",
  relaxation:
    "UFF 自由构象松弛不会考虑蛋白环境，可能把分子移出口袋。默认关闭；固定片段设计不使用此选项。",
  fragment_policy:
    "从头生成通常保留最大的连通结构；保留片段设计保留所有片段，再检查是否成功连接。",
  bond_mode:
    "完整片段会检查所选部分的元素、位置和内部键型。仅元素与位置采用原模型约束，内部键型可能改变。",
  added_atoms:
    "在已经保留的原子以外，尝试生成多少个新的重原子。自动大小时由模型决定。",
  "fixed-atoms":
    "通常直接在三维图中点选。编号从 1 开始，与当前起始分子对应；换起始分子后需要重新选择。",
  change_steps:
    "控制起始结构被扰动后重新设计的幅度。较小值偏向相近变体，较大值探索更多变化。",
  population: "每一轮探索的候选数量。数量越多，计算时间越长。",
  rounds: "重复探索与筛选多少轮。总候选数是每轮数量乘以轮数。",
  survivors: "从本轮保留多少个候选作为下一轮起点，不能超过每轮候选数量。",
  objective:
    "QED 是理化性质综合类药性指标，越高越好；SA 是合成难度估计，越低越好。它们都不是结合活性。",
  seed: "相同输入、模型与此编号可用于复现实验。换一个编号可探索不同候选。",
  minimum_atoms:
    "自动大小采样的下限；工作台同时把分子大小限制在本机支持的范围内。",
  size_bias:
    "在模型估计的重原子数基础上加减。一般保持 0，避免对大小施加过强偏好。",
  center: "新原子最初围绕保留片段或口袋中心放置。一般先选择保留片段周围。",
  "fragment-pick":
    "点选整环能避免只保留半个芳香环；相连的稠合环会一起选择。切换为单原子后可以精细选择。橙色表示已保留。",
  "figure-surfaceType":
    "SES：溶剂排除表面，常用于展示结合口袋。VDW：原子范德华体积。SAS：溶剂探针中心可到达的表面。",
  "figure-projection":
    "正交投影不会产生近大远小的透视变化，适合结构图；透视投影更有空间感。",
  "figure-surfaceOpacity":
    "越小越透明，便于观察口袋中的配体。表面颜色不代表静电势。",
  "figure-proteinOpacity": "控制蛋白主链显示的透明程度，不改变结构坐标。",
  "figure-stickRadius":
    "调整化学键的绘制粗细，只改变图形外观，不改变化学键或坐标。",
};
export function setupHelp() {
  for (const [id, text] of Object.entries(explanations)) {
    const input = document.getElementById(id);
    if (!input) continue;
    const label =
      document.querySelector(`label[for="${id}"]`) || input.closest("label");
    if (!label || label.querySelector(".field-help")) continue;
    const wrapper = document.createElement("span");
    wrapper.className = "field-help";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "?";
    const caption = label.cloneNode(true);
    caption
      .querySelectorAll("select, input, button")
      .forEach((node) => node.remove());
    button.setAttribute("aria-label", `${caption.textContent.trim()}说明`);
    const tip = document.createElement("span");
    tip.id = `help-${id}`;
    tip.className = "field-tooltip";
    tip.role = "tooltip";
    tip.textContent = text;
    button.setAttribute("aria-describedby", tip.id);
    input.setAttribute("aria-describedby", tip.id);
    function close() {
      wrapper.classList.remove("open");
      tip.style.display = "none";
    }
    function position() {
      wrapper.classList.add("open");
      tip.style.display = "block";
      const rect = button.getBoundingClientRect(),
        width = Math.min(280, innerWidth - 24);
      tip.style.width = `${width}px`;
      tip.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, rect.left))}px`;
      tip.style.right = "auto";
      const top =
        rect.top > tip.offsetHeight + 16
          ? rect.top - tip.offsetHeight - 8
          : rect.bottom + 8;
      tip.style.top = `${Math.max(12, Math.min(innerHeight - tip.offsetHeight - 12, top))}px`;
      tip.style.bottom = "auto";
    }
    wrapper.addEventListener("mouseenter", position);
    button.addEventListener("focus", position);
    wrapper.addEventListener("mouseleave", close);
    button.addEventListener("blur", close);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      position();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
      }
    });
    wrapper.append(button, tip);
    label.append(wrapper);
  }
  document.addEventListener("click", (event) => {
    for (const node of document.querySelectorAll(".field-help.open"))
      if (!node.contains(event.target)) {
        node.classList.remove("open");
        node.querySelector(".field-tooltip").style.display = "none";
      }
  });
}
