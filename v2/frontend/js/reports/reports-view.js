import { getDayActivityReport } from "./activity-reports.js";

const unit = (value, name) => `${value} ${name}${value === 1 ? "" : "s"}`;
const duration = (ms) => {
  const tenths = Math.round(ms / 100);
  if (tenths === 0) return "0 seconds";
  if (tenths < 600) return tenths === 10 ? "1 second" : `${(tenths / 10).toFixed(1)} seconds`;
  let seconds = Math.round(tenths / 10);
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  return [hours && unit(hours, "hour"), minutes && unit(minutes, "minute"),
    seconds && unit(seconds, "second")].filter(Boolean).join(" ");
};

function node(tag, text) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}

/** Read-only factual projection of recorded evidence; no report data is ever written back. */
export function mountReports(store) {
  const $ = (id) => document.getElementById(id);
  const day = $("view-day");
  const output = $("reports-output");
  const status = $("reports-status");
  const error = $("reports-error");
  let busy = false;

  const counted = (report) => {
    const outcomes = [];
    if (report.completedSessions) outcomes.push(unit(report.completedSessions, "session") + " completed");
    if (report.endedEarlySessions) outcomes.push(unit(report.endedEarlySessions, "session") + " ended early");
    if (report.unfinishedSessions) outcomes.push(unit(report.unfinishedSessions, "session") + " without a recorded ending");
    return outcomes.join(", ") || "no sessions";
  };

  function render(report) {
    output.replaceChildren();
    const list = node("dl");
    const row = (label, value) => {
      const metric = node("div");
      metric.append(node("dt", label), node("dd", value));
      list.append(metric);
    };
    row("Sessions", counted(report));
    row("Active focus", `${duration(report.activeFocusMs)} (planned duration of started sessions: ${duration(report.plannedFocusMs)})`);
    row("Pause", report.unknownPauseIntervals
      ? `${duration(report.pauseMs)}, plus ${unit(report.unknownPauseIntervals, "interval")} with unknown duration — reconcile in Focus`
      : duration(report.pauseMs));
    row("Interruptions", `${unit(report.interruptionCount, "episode")}, ${duration(report.interruptionMs)} total`);
    if (report.uncreditedFocusMs > 0) {
      row("Confirmed focus after reaching the planned target", duration(report.uncreditedFocusMs));
    }
    if (report.uncertainMs > 0 || report.unresolvedEvidenceCount > 0) {
      row("Unresolved measured time", `${duration(report.uncertainMs)} across ${unit(report.unresolvedEvidenceCount, "interval")} — not counted as focus`);
    }
    output.append(list);
    if (report.tasks.length) {
      const breakdown = node("ul");
      for (const task of report.tasks) {
        breakdown.append(node("li", `${task.title} — active focus ${duration(task.activeFocusMs)} of ${duration(task.plannedFocusMs)} planned; ${counted(task)}.`));
      }
      output.append(node("h3", "Task focus totals for this Plan Day"), breakdown);
    }
  }

  async function refresh() {
    if (busy) return;
    const refreshButton = $("reports-refresh");
    const hadFocus = document.activeElement === refreshButton;
    busy = true;
    output.setAttribute("aria-busy", "true");
    refreshButton.disabled = true;
    error.textContent = "";
    try {
      const state = await store.loadFocus();
      if (!day.validity.valid || !day.value) {
        status.textContent = "Choose a Plan Day above to see its activity.";
        output.replaceChildren();
      } else {
        const report = getDayActivityReport(state, day.value);
        render(report);
        status.textContent = report.sessionCount
          ? `Showing confirmed activity for ${day.value}: ${counted(report)}.`
          : `No recorded focus sessions for ${day.value} yet.`;
      }
    } catch (caught) {
      output.replaceChildren();
      status.textContent = "Error — activity could not be read.";
      error.textContent = `${caught.message} Refresh activity to retry.`;
    } finally {
      busy = false;
      output.setAttribute("aria-busy", "false");
      refreshButton.disabled = false;
      // Disabling the button can move focus to body; preserve keyboard position
      // unless the user has moved to another control while the read was pending.
      if (hadFocus && document.activeElement === document.body) refreshButton.focus();
    }
  }

  day.addEventListener("change", () => { if (day.validity.valid) refresh(); });
  $("reports-refresh").addEventListener("click", refresh);
  return { refresh };
}
