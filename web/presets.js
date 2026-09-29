/** Task presets are concrete inference settings, with one shared expert form. */
export function presetOptions(task, level) {
  const counts = { quick: 3, standard: 10, explore: 30 };
  if (!(level in counts)) throw new Error("未知预设");
  const common = {
    count: counts[level],
    steps: level === "quick" ? 100 : 500,
    seed: 2026,
    relaxation: 0,
  };
  if (task === "optimize")
    return {
      ...common,
      population: level === "quick" ? 3 : level === "standard" ? 5 : 10,
      rounds: level === "quick" ? 1 : level === "standard" ? 3 : 5,
      survivors: level === "quick" ? 1 : level === "standard" ? 2 : 3,
      change_steps: level === "quick" ? 50 : level === "standard" ? 100 : 150,
    };
  if (task === "diversify")
    return {
      ...common,
      change_steps: level === "quick" ? 50 : level === "standard" ? 100 : 150,
    };
  if (task === "inpaint")
    return {
      ...common,
      steps: 500,
      resamplings: level === "explore" ? 3 : 1,
      fragment_policy: "all",
      preserve_bonds: true,
      size_mode: "sample",
      minimum_atoms: 8,
      size_bias: 0,
      trajectory: false,
    };
  return {
    ...common,
    atoms: 24,
    size_mode: level === "quick" ? "fixed" : "sample",
    minimum_atoms: 8,
    size_bias: 0,
    fragment_policy: "largest",
    resamplings: 1,
    jump_length: 1,
  };
}
