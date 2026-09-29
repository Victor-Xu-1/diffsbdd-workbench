/** Keep scientific labels crisp when the WebGL drawing buffer is enlarged. */
const labels = new WeakMap();
export function clearFigureLabels(viewer) {
  viewer.removeAllLabels();
  labels.set(viewer, []);
}
export function addFigureLabel(viewer, text, style) {
  const label = viewer.addLabel(text, style);
  if (!labels.has(viewer)) labels.set(viewer, []);
  labels.get(viewer).push({ label, style: { ...style } });
  return label;
}
export function scaleFigureLabels(viewer, scale) {
  for (const { label, style } of labels.get(viewer) || []) {
    viewer.setLabelStyle(label, {
      ...style,
      fontSize: Math.round((style.fontSize || 14) * scale),
      ...(style.screenOffset
        ? {
            screenOffset: {
              x: style.screenOffset.x * scale,
              y: style.screenOffset.y * scale,
            },
          }
        : {}),
    });
    // 3Dmol labels are texture sprites: increase texture resolution while
    // preserving their geometric footprint. Confined to this renderer adapter.
    label.sprite.scale.set(1 / scale, 1 / scale, 1);
  }
}
