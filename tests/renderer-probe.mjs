/** Observe the real renderer in tests; no production debug globals. */
export function installRendererProbe(page) {
  return page.addInitScript(() => {
    let library;
    window.testViewers = {};
    Object.defineProperty(window, "$3Dmol", {
      configurable: true,
      get: () => library,
      set: (value) => {
        library = new Proxy(value, {
          get(target, key) {
            if (key !== "createViewer") return Reflect.get(target, key);
            return (element, options) => {
              const viewer = target.createViewer(element, options);
              window.testViewers[element.id] = viewer;
              return viewer;
            };
          },
        });
      },
    });
  });
}
