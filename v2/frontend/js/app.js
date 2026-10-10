import { openPlanningStore } from "./persistence/planning-store.js";

const startupStatus = document.getElementById("v2-startup-status");

export const planningStore = openPlanningStore({
  onStatus({ state, error }) {
    const messages = {
      loading: "Loading local plans…", ready: "V2 frontend ready. Local plans loaded.",
      saving: "Saving…", saved: "Saved.",
    };
    startupStatus.textContent = state === "error"
      ? `Error: ${error.message}` : messages[state];
  },
});
// The visible status reports startup failure; callers still receive its rejection.
planningStore.catch(() => {});
