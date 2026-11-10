// The localStorage keys that hide the first-run guides. Each is owned here so a member can bring every guide back at once.
export const WELCOME_KEY = 'cvs.welcome.done'; // the Explore welcome card, dismissed for good
export const HINTS_KEY = 'cvs_tool_hint_hidden'; // the per-page PageHint tips the member has hidden
export const WIZARD_KEY = 'cvs.marketing.wizard'; // the Marketing Studio guided wizard on/off override

/** Clear every first-run guide so the welcome card, page hints, and the Marketing wizard (back to the team default) show again. */
export function resetOnboarding(): void {
  for (const key of [WELCOME_KEY, HINTS_KEY, WIZARD_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}
