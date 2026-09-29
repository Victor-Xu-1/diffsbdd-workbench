/** Reframe visible containers after navigation, fullscreen or responsive layout. */
export function observeMolecularViewport(element, getViewer, reframe) {
  let width = element.clientWidth,
    height = element.clientHeight,
    pending;
  const observer = new ResizeObserver(([entry]) => {
    const next = entry.contentRect;
    if (Math.abs(next.width - width) < 1 && Math.abs(next.height - height) < 1)
      return;
    width = next.width;
    height = next.height;
    cancelAnimationFrame(pending);
    if (width < 100 || height < 100) return;
    pending = requestAnimationFrame(() => {
      const viewer = getViewer();
      if (!viewer?.getModel(0)) return;
      viewer.resize();
      reframe();
      viewer.render();
    });
  });
  observer.observe(element);
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    cancelAnimationFrame(pending);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) observer.observe(element);
  });
}
