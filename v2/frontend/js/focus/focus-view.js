import { createBrowserFocus } from "./browser-focus.js";
import { getSessionActivity } from "./activity-evidence.js";

const duration = (ms) => `${(ms / 1000).toFixed(1)} seconds`;
const instant = (at) => new Date(at).toISOString();
function node(tag, text) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}

/** DOM projection only; every action and displayed credit comes from the existing controller. */
export function mountFocus(store) {
  const $ = (id) => document.getElementById(id);
  let state;
  let plan;
  let busy = false;
  let failed = false;
  let polling;
  let stopped = false;
  const forms = new Map();
  const history = new Map();
  const controller = createBrowserFocus(store, {
    onState(next) { state = next; render(); },
    onError: fail,
  });

  function fail(error) {
    failed = true;
    controller.stop();
    $("focus-error").textContent = `${error.message} Focus changes were not confirmed. Refresh saved focus before retrying.`;
    render();
  }

  function render() {
    const reservation = state?.reservation;
    const owns = reservation?.controllerId === controller.contextId;
    const disabled = busy || failed || !state;
    $("focus-panel").setAttribute("aria-busy", String(busy));
    const message = failed ? "Error — showing the last confirmed focus state; refresh required."
      : !state ? "Loading saved focus…"
        : reservation ? `${reservation.state === "running" ? "Running" : "Paused"} — ${owns ? "controlled here" : "reserved elsewhere; explicit recovery required"}.`
          : "No active reservation. Start a saved session explicitly.";
    // Do not announce every persisted one-second sample to assistive technology.
    if ($("focus-status").textContent !== message) $("focus-status").textContent = message;
    $("focus-selection").disabled = disabled || !!reservation || !plan;
    $("focus-start").disabled = disabled || !!reservation || !plan || !$("focus-selection").value;
    $("focus-refresh").disabled = busy;
    $("focus-recovery").hidden = !reservation || owns;
    $("focus-recover").disabled = disabled;
    for (const [id, visible] of [["focus-pause", owns && reservation.state === "running"],
      ["focus-resume", owns && reservation.state === "paused"], ["focus-end", owns]]) {
      $(id).hidden = !visible;
      $(id).disabled = disabled;
    }
    const session = state?.sessions.find((item) => item.id === reservation?.sessionId) ?? state?.sessions.at(-1);
    if (session) {
      const activity = getSessionActivity(state, session.id);
      const context = session.startingSnapshot;
      $("focus-context").textContent = `${context.title} · Original Plan Day: ${context.planDayId} (${context.timezone}) · Planned duration: ${duration(session.targetMs)}.`;
      $("focus-duration").textContent = `Confirmed focus: ${duration(activity.confirmedActiveMs)} · Remaining: ${duration(activity.remainingMs)} · Confirmed pause: ${duration(activity.pauseMs)} · Interruption: ${duration(activity.interruptionMs)} · Unresolved measured time: ${duration(activity.uncertainMs)} · Unknown intervals: ${activity.unknownUncertainIntervals} focus / ${activity.unknownPauseIntervals} pause.`;
    } else {
      $("focus-context").textContent = "";
      $("focus-duration").textContent = "No saved focus sessions.";
    }
    if (!state) return;
    for (const session of state.sessions) {
      let entry = history.get(session.id);
      if (!entry) {
        entry = node("article");
        entry.dataset.sessionId = session.id;
        history.set(session.id, entry);
        $("focus-history").append(entry);
      }
      const activity = getSessionActivity(state, session.id);
      const outcome = activity.effectiveOutcome ?? "unfinished";
      const point = activity.endingPoint;
      const ending = !point ? "No ending recorded"
        : point.at !== null ? `Ending: ${instant(point.at)}`
          : `Ending point: ${duration(point.offsetMs ?? 0)} into evidence ${point.evidenceId}; exact clock time unknown`;
      entry.textContent = `${session.startingSnapshot.title} · Plan Day ${session.startingSnapshot.planDayId} (${session.startingSnapshot.timezone}) · Started ${instant(session.actualStart)} · Planned ${duration(session.targetMs)} · Confirmed focus ${duration(activity.confirmedActiveMs)} · Pause ${duration(activity.pauseMs)} · Interruption ${duration(activity.interruptionMs)} (${activity.interruptionCount} groups) · Outcome: ${outcome} · Recorded outcome: ${session.ending?.outcome ?? "unfinished"} · ${ending} · Unresolved: ${activity.unresolvedEvidenceIds.length + activity.unresolvedPauseEvidenceIds.length}.`;
    }
    const unresolved = state.evidence.filter((item) => item.endAt !== null
      && (item.kind === "uncertain" || (item.kind === "pause" && item.elapsedMs === null))
      && !state.reconciliations.some((decision) => decision.evidenceId === item.id));
    for (const [id, form] of forms) {
      if (!unresolved.some((item) => item.id === id)) { form.remove(); forms.delete(id); }
    }
    for (const evidence of unresolved) {
      if (!forms.has(evidence.id)) {
        const form = reconciliationForm(evidence);
        forms.set(evidence.id, form);
        $("focus-reconciliation").append(form);
      }
      forms.get(evidence.id).querySelector("fieldset").disabled = disabled
        || (reservation?.sessionId === evidence.sessionId && !owns);
    }
  }

  async function act(run, focusAfter = true) {
    if (busy || stopped) return;
    busy = true;
    render();
    try {
      await run();
      failed = false;
      $("focus-error").textContent = "";
      controller.watch();
      if (focusAfter) $("focus-heading").focus();
    } catch (error) { fail(error); }
    finally { busy = false; render(); }
  }

  function reconciliationForm(evidence) {
    const form = node("form");
    form.dataset.evidenceId = evidence.id;
    const session = state.sessions.find((item) => item.id === evidence.sessionId);
    const pause = evidence.kind === "pause";
    const fields = node("fieldset");
    fields.append(node("legend", `${pause ? "Confirm unknown pause duration" : "Reconcile uncertain interval"}: ${session.startingSnapshot.title}`),
      node("p", `Observed boundaries: ${instant(evidence.startAt)} → ${instant(evidence.endAt)}. ${pause ? "Explicit pause never counts as focus." : "Only work you explicitly confirm counts. Keep unresolved if you cannot confirm."}`));
    const totalId = `elapsed-${evidence.id}`;
    const label = node("label", evidence.elapsedMs === null ? "Total interval duration (seconds, required; clock difference is not assumed)" : "Measured interval duration (seconds)");
    label.htmlFor = totalId;
    const total = node("input");
    total.id = totalId;
    total.type = "number";
    total.min = "0";
    total.step = "any";
    total.required = true;
    total.readOnly = evidence.elapsedMs !== null;
    total.value = evidence.elapsedMs === null ? "" : evidence.elapsedMs / 1000;
    fields.append(label, total);
    const parts = node("div");
    fields.append(node("p", "Account for the entire interval in order. Use one part for continued work or interruption; add parts for partial work. Reuse an interruption group name only to explicitly join its fragments."), parts);
    function addPart() {
      const row = node("div");
      const id = crypto.randomUUID();
      const kind = node("select");
      kind.id = `kind-${id}`;
      kind.required = true;
      kind.append(new Option("Choose interval type", ""));
      for (const [value, text] of pause ? [["pause", "Explicit pause"]]
        : [["focus", "Confirmed work"], ["interruption", "Interruption"]]) kind.append(new Option(text, value));
      const kindLabel = node("label", `Part ${parts.children.length + 1} type (required)`);
      kindLabel.htmlFor = kind.id;
      const seconds = node("input");
      seconds.id = `seconds-${id}`;
      seconds.type = "number";
      seconds.min = "0";
      seconds.step = "any";
      seconds.required = true;
      const secondsLabel = node("label", "Part duration (seconds, required)");
      secondsLabel.htmlFor = seconds.id;
      const group = node("input");
      group.id = `group-${id}`;
      group.value = `interruption-${id}`;
      group.hidden = true;
      const groupLabel = node("label", "Interruption group name (required for interruption)");
      groupLabel.htmlFor = group.id;
      groupLabel.hidden = true;
      kind.addEventListener("change", () => {
        group.hidden = groupLabel.hidden = kind.value !== "interruption";
        group.required = kind.value === "interruption";
      });
      const remove = node("button", "Remove interval part");
      remove.type = "button";
      remove.addEventListener("click", () => { row.remove(); add.focus(); });
      row.append(kindLabel, kind, secondsLabel, seconds, groupLabel, group, remove);
      parts.append(row);
      return kind;
    }
    const add = node("button", "Add interval part");
    add.type = "button";
    add.addEventListener("click", () => addPart().focus());
    const submit = node("button", "Confirm reconciliation");
    submit.type = "submit";
    fields.append(add, submit);
    form.append(fields);
    addPart();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (failed || busy) return;
      act(() => controller.reconcile({
        evidenceId: evidence.id,
        elapsedMs: evidence.elapsedMs ?? Number(total.value) * 1000,
        parts: [...parts.children].map((row) => {
          const [seconds, group] = row.querySelectorAll("input");
          const kind = row.querySelector("select").value;
          return { kind, elapsedMs: Number(seconds.value) * 1000,
            ...(kind === "interruption" ? { episodeId: group.value.trim() } : {}) };
        }),
      }));
    });
    return form;
  }

  function setPlan(snapshot, day) {
    plan = snapshot;
    const selection = $("focus-selection");
    const selected = selection.value;
    selection.replaceChildren(new Option("Choose a saved session", ""));
    for (const task of snapshot?.tasks ?? []) {
      if (task.planDayId !== day || task.completedAt || task.cancelledAt) continue;
      task.sessionPlan.forEach((item, index) => selection.append(new Option(
        `${task.title} — session ${index + 1} (${item.activeMinutes} minutes)`, JSON.stringify([task.id, item.id]))));
    }
    selection.value = [...selection.options].some((option) => option.value === selected) ? selected : "";
    render();
  }

  async function load() {
    await act(() => controller.load(), false);
    if (!polling && !stopped) polling = setInterval(() => {
      // Observers read; only the accepted controller's watch loop writes evidence.
      if (!busy && !failed && state?.reservation?.controllerId !== controller.contextId) {
        controller.load().catch(fail);
      }
    }, 1000);
  }
  $("focus-selection").addEventListener("change", render);
  $("focus-start").addEventListener("click", () => {
    if (failed || busy || !plan || !$("focus-selection").value) return;
    const [taskId, plannedItemId] = JSON.parse($("focus-selection").value);
    const task = plan.tasks.find((item) => item.id === taskId);
    act(() => controller.start({ taskId, plannedItemId, expectedPlanningRevision: plan.revision,
      timezone: task.planDay?.timezone ?? task.plannedStart?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone }));
  });
  for (const action of ["pause", "resume", "end"]) {
    $(`focus-${action}`).addEventListener("click", () => act(() => controller[action]()));
  }
  $("focus-recover").addEventListener("click", () => act(() => controller.recover({ confirmed: true })));
  $("focus-refresh").addEventListener("click", load);
  return { setPlan, load, stop() { stopped = true; controller.stop(); clearInterval(polling); } };
}
