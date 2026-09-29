/** Presentation only: both modes use the same options, state and API contracts. */
export function setupExperience() {
  const selector = document.getElementById("experience-mode"),
    advanced = document.getElementById("advanced-settings");
  function apply() {
    if (selector.value === "simple") {
      const invalid = [...advanced.querySelectorAll("input,select")].find(
        (field) => !field.disabled && !field.checkValidity(),
      );
      if (invalid) {
        selector.value = "expert";
        invalid.reportValidity();
        return;
      }
    }
    document.body.dataset.experience = selector.value;
    advanced.hidden = selector.value !== "expert";
  }
  selector.addEventListener("change", apply);
  document.body.dataset.experience = "simple";
  advanced.hidden = true;
}
