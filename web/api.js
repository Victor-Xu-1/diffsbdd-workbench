export async function api(path, options = {}) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-DiffSBDD-Client": "local-ui",
        ...options.headers,
      },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "请求失败，请检查输入。",
      );
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "服务响应超时。请刷新历史记录确认任务是否已创建，再决定是否重试。",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function link(text, href) {
  const node = document.createElement("a");
  node.className = "download";
  node.textContent = text;
  node.href = href;
  return node;
}
export const labels = {
  running: "正在探索",
  completed: "已完成",
  failed: "未完成",
  cancelled: "已取消",
  interrupted: "计算被中断",
  no_valid_molecules: "本轮无有效结构",
};
export function friendlyError(message = "") {
  if (/out of memory/i.test(message))
    return "显存不足。请关闭其他占用显卡的程序，或缩小口袋、分子大小后重试。已生成结果仍保留。";
  if (/CUDA|GPU.*unavailable/i.test(message))
    return "显卡计算环境不可用，请运行启动目录中的环境检查，再重新开始。";
  if (/No protein pocket|No.*residues|Residue not found/i.test(message))
    return "未找到对应的蛋白口袋残基，请检查链号、残基编号及参考配体坐标。";
  if (/RDKit sanitization|valence|kekuliz/i.test(message))
    return "原子价态或芳香性未通过化学检查。";
  if (/Disconnected/i.test(message)) return "生成结构含不相连的片段。";
  if (/fixed|保留.*片段|所选片段/.test(message))
    return "未完整保留所选片段的结构或空间位置。";
  if (/One-hour/.test(message))
    return "已达到一小时计算上限。请减少候选数；已生成结果可以下载。";
  if (/Server restarted/.test(message))
    return "服务重启使计算中断，已完成结果仍保留，可复用设置重新开始。";
  return message;
}
