import { createBrowserFocus } from "./browser-focus.js";
import { getSessionActivity, validateReconciliation } from "./activity-evidence.js";
import { renderPlanArtwork } from "../artwork/presentation.js";

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
const instant = (at) => new Date(at).toISOString();
// Fixed-width clock for the prominent live display; evidence summaries keep duration().
const clock = (ms) => {
  const total = Math.round(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
};
const localTime = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
  let planDay;
  let busy = false;
  let failed = false;
  let polling;
  let clockTimer;
  let stopped = false;
  // Presentation-only anchor for projecting the open running interval between
  // confirmed checkpoints; it never writes evidence or changes credit.
  let liveBase = null;
  const forms = new Map();
  const history = new Map();
  const controller = createBrowserFocus(store, {
    onState(next) { state = next; render(); },
    onError: fail,
  });

  function fail(error) {
    failed = true;
    liveBase = null;
    controller.stop();
    $("focus-error").textContent = `${error.message} Focus changes were not confirmed. Refresh saved focus before retrying.`;
    render();
  }

  function statusMessage() {
    if (failed) return "Error — showing the last confirmed focus state; refresh required.";
    if (!state) return "Loading saved focus…";
    if (state.reservation) {
      const reserved = state.reservation.state === "running" ? "Running" : "Paused";
      const holder = state.reservation.controllerId === controller.contextId
        ? "controlled here" : "reserved elsewhere; explicit recovery required";
      return `${reserved} — ${holder}.`;
    }
    if (!state.sessions.length) return "No active reservation. Start a saved session explicitly.";
    // The live status must say what happened to the session, not just that control ended.
    const ended = state.sessions.at(-1);
    const activity = getSessionActivity(state, ended.id);
    return `No active reservation. Last session ${activity.effectiveOutcome === "completed" ? "completed its planned focus duration" : "ended early"}; confirmed focus ${duration(activity.confirmedActiveMs)}. Start a saved session explicitly.`;
  }

  function currentSession() {
    const reservation = state?.reservation;
    return state?.sessions.find((item) => item.id === reservation?.sessionId) ?? state?.sessions.at(-1);
  }

  const setOnce = (element, text) => {
    if (element.textContent !== text) element.textContent = text;
  };

  // The display projects the open interval only while this tab owns the running
  // reservation; observers show confirmed facts without inventing observations.
  function updateClock() {
    const session = currentSession();
    if (!state || !session) {
      $("focus-clock").dataset.state = state ? "none" : "loading";
      setOnce($("focus-clock-remaining"), "--:--");
      setOnce($("focus-clock-caption"), state ? "No focus sessions yet." : "Loading saved focus…");
      $("focus-progress").value = 0;
      return;
    }
    const activity = getSessionActivity(state, session.id);
    const reservation = state.reservation;
    const owns = reservation?.controllerId === controller.contextId;
    const runningHere = owns && reservation.state === "running";
    const focusedMs = runningHere && liveBase
      ? Math.min(session.targetMs, liveBase.focusedMs + Math.max(0, Date.now() - liveBase.at))
      : activity.confirmedActiveMs;
    const phase = runningHere ? "running" : reservation ? (owns ? reservation.state : "elsewhere") : "ended";
    const label = { running: "Running", paused: "Paused", elsewhere: "Controlled in another tab",
      ended: "Session ended" }[phase] ?? "Focus";
    $("focus-clock").dataset.state = phase;
    setOnce($("focus-clock-remaining"), clock(session.targetMs - focusedMs));
    setOnce($("focus-clock-caption"), `${label} · focused ${clock(focusedMs)} of ${clock(session.targetMs)} planned`);
    // Same display projection as the clock; this never records or credits time.
    $("focus-progress").max = session.targetMs;
    $("focus-progress").value = Math.min(session.targetMs, focusedMs);
  }

  function renderOutcome() {
    const box = $("focus-outcome");
    const last = state && !state.reservation ? state.sessions.at(-1) : null;
    if (!last) { box.hidden = true; return; }
    const activity = getSessionActivity(state, last.id);
    const outcome = activity.effectiveOutcome ?? "unfinished";
    box.hidden = false;
    box.dataset.outcome = outcome;
    setOnce(box, outcome === "completed"
      ? `Completed — planned focus reached: ${duration(activity.confirmedActiveMs)} of ${duration(last.targetMs)}.`
      : outcome === "ended-early"
        ? `Ended early — confirmed focus ${duration(activity.confirmedActiveMs)} of ${duration(last.targetMs)} planned.`
        : `No ending recorded — confirmed focus ${duration(activity.confirmedActiveMs)} of ${duration(last.targetMs)} planned.`);
  }

  function render() {
    const focused = document.activeElement;
    const hadFocus = $("focus-panel").contains(focused);
    const reservation = state?.reservation;
    const owns = reservation?.controllerId === controller.contextId;
    const disabled = busy || failed || !state;
    $("focus-panel").setAttribute("aria-busy", String(busy));
    const message = statusMessage();
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
    const session = currentSession();
    setOnce($("focus-task-title"), session?.startingSnapshot.title ?? "Ready when you are");
    if (session) {
      const activity = getSessionActivity(state, session.id);
      const context = session.startingSnapshot;
      $("focus-context").textContent = `${context.title} · Original Plan Day: ${context.planDayId} (${context.timezone}) · Planned duration: ${duration(session.targetMs)}.`;
      $("focus-duration").textContent = `Confirmed focus: ${duration(activity.confirmedActiveMs)} · Remaining: ${duration(activity.remainingMs)} · Confirmed pause: ${duration(activity.pauseMs)} · Interruption: ${duration(activity.interruptionMs)} · Unresolved measured time: ${duration(activity.uncertainMs)} · Unknown intervals: ${activity.unknownUncertainIntervals} focus / ${activity.unknownPauseIntervals} pause.`;
    } else {
      $("focus-context").textContent = "";
      $("focus-duration").textContent = "No saved focus sessions.";
    }
    renderOutcome();
    liveBase = owns && reservation?.state === "running" && session?.id === reservation.sessionId
      ? { focusedMs: getSessionActivity(state, session.id).confirmedActiveMs, at: Date.now() }
      : null;
    updateClock();
    // Artwork derives here so every existing render path (Start, pause, reload,
    // observer polling, planner edits via setPlan) updates it in one place.
    renderPlanArtwork({ plan, day: planDay,
      focus: state ? { state, contextId: controller.contextId } : null });
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
    // Automatic completion or a remote update can remove the focused control.
    // Keep its keyboard context without stealing focus from Planner or Activity.
    if (!busy && hadFocus && (!focused.isConnected || focused.hidden || focused.matches(":disabled"))) {
      $("focus-heading").focus();
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
    } catch (error) { fail(error); }
    finally {
      busy = false;
      render();
      if (focusAfter) $("focus-heading").focus();
    }
  }

  function reconciliationForm(evidence) {
    const form = node("form");
    form.noValidate = true;
    form.dataset.evidenceId = evidence.id;
    form.setAttribute("aria-describedby", "focus-error");
    const session = state.sessions.find((item) => item.id === evidence.sessionId);
    const pause = evidence.kind === "pause";
    const fields = node("fieldset");
    fields.append(
      node("legend", pause ? `Unknown pause duration — ${session.startingSnapshot.title}`
        : `Decide how this uncertain time was spent — ${session.startingSnapshot.title}`),
      node("p", `Observed ${localTime(evidence.startAt)} → ${localTime(evidence.endAt)} (local time). ${pause ? "The pause duration is unknown; explicit pause never counts as focus." : "Only work you explicitly confirm counts. Keep unresolved if you cannot confirm."}`));
    const totalId = `elapsed-${evidence.id}`;
    const label = node("label", evidence.elapsedMs === null ? "Interval duration (seconds, required; clock difference is not assumed)" : "Measured duration (seconds, fixed)");
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
    // Common single-answer shortcuts; they only prefill the explicit parts below.
    function applyQuick(kind) {
      const seconds = Number(total.value);
      if (total.readOnly === false && (total.value.trim() === "" || !Number.isFinite(seconds) || seconds < 0)) {
        $("focus-error").textContent = total.validationMessage || "Enter a finite, non-negative interval duration in seconds.";
        total.setAttribute("aria-invalid", "true");
        total.setAttribute("aria-describedby", "focus-error");
        total.focus();
        return;
      }
      total.removeAttribute("aria-invalid");
      while (parts.children.length > 1) parts.lastElementChild.remove();
      const row = parts.firstElementChild;
      const kindSelect = row.querySelector("select");
      kindSelect.value = kind;
      kindSelect.dispatchEvent(new Event("change", { bubbles: true }));
      row.querySelector("input[id^=seconds-]").value = total.value;
    }
    if (!pause) {
      const quick = node("div");
      quick.className = "reconcile-quick";
      for (const [kind, text] of [["focus", "All confirmed work"], ["interruption", "All interruption"]]) {
        const button = node("button", text);
        button.type = "button";
        button.addEventListener("click", () => applyQuick(kind));
        quick.append(button);
      }
      fields.append(quick);
    }
    const parts = node("div");
    fields.append(node("p", pause
      ? "Enter the pause duration above, then confirm it below as one explicit-pause part."
      : "Account for the entire interval, in order, as confirmed work and/or interruption. Parts must add up to the interval duration. Use the shortcuts above for a single answer, or add parts for a split."), parts);
    function addPart() {
      const row = node("div");
      row.className = "part-row";
      const id = crypto.randomUUID();
      const kind = node("select");
      kind.id = `kind-${id}`;
      kind.required = true;
      kind.append(new Option("Choose type", ""));
      for (const [value, text] of pause ? [["pause", "Explicit pause"]]
        : [["focus", "Confirmed work"], ["interruption", "Interruption"]]) kind.append(new Option(text, value));
      const kindLabel = node("label", `Part ${parts.children.length + 1} (required)`);
      kindLabel.htmlFor = kind.id;
      const seconds = node("input");
      seconds.id = `seconds-${id}`;
      seconds.type = "number";
      seconds.min = "0";
      seconds.step = "any";
      seconds.required = true;
      const secondsLabel = node("label", "Seconds (required)");
      secondsLabel.htmlFor = seconds.id;
      const group = node("input");
      group.id = `group-${id}`;
      group.value = `interruption-${id}`;
      group.hidden = true;
      const groupLabel = node("label", "Interruption group (joins repeated interruptions)");
      groupLabel.htmlFor = group.id;
      groupLabel.hidden = true;
      kind.addEventListener("change", () => {
        group.hidden = groupLabel.hidden = kind.value !== "interruption";
        group.required = kind.value === "interruption";
      });
      const remove = node("button", "Remove part");
      remove.type = "button";
      remove.addEventListener("click", () => { row.remove(); add.focus(); });
      row.append(kindLabel, kind, secondsLabel, seconds, groupLabel, group, remove);
      parts.append(row);
      return kind;
    }
    const add = node("button", "Add part");
    add.type = "button";
    add.addEventListener("click", () => addPart().focus());
    const submit = node("button", "Confirm decision");
    submit.type = "submit";
    fields.append(add, submit);
    form.append(fields);
    addPart();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (failed || busy) return;
      for (const field of form.querySelectorAll("[aria-invalid]")) field.removeAttribute("aria-invalid");
      const invalid = [...form.elements].find((field) => field.willValidate
        && (!field.validity.valid || (field.type === "number" && !Number.isFinite(Number(field.value) * 1000))));
      if (invalid) {
        $("focus-error").textContent = invalid.validationMessage || "Enter a smaller duration in seconds.";
        invalid.setAttribute("aria-invalid", "true");
        invalid.setAttribute("aria-describedby", "focus-error");
        invalid.focus();
        return;
      }
      const decision = {
        evidenceId: evidence.id,
        elapsedMs: evidence.elapsedMs ?? Number(total.value) * 1000,
        parts: [...parts.children].map((row) => {
          const [seconds, group] = row.querySelectorAll("input");
          const kind = row.querySelector("select").value;
          return { kind, elapsedMs: Number(seconds.value) * 1000,
            ...(kind === "interruption" ? { episodeId: group.value.trim() } : {}) };
        }),
      };
      try {
        // Validate explicit input before invoking the controller. Bad form data
        // must not stop sampling or require a storage/authority recovery.
        validateReconciliation(evidence, { ...decision, id: crypto.randomUUID(),
          originContextId: controller.contextId, decidedAt: Date.now() });
      } catch (error) {
        $("focus-error").textContent = error.message;
        const field = parts.querySelector("input[id^=seconds-]") ?? add;
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", "focus-error");
        field.focus();
        return;
      }
      act(() => controller.reconcile(decision));
    });
    return form;
  }

  function setPlan(snapshot, day) {
    plan = snapshot;
    planDay = day;
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
    if (!clockTimer && !stopped) clockTimer = setInterval(updateClock, 250);
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
  return { setPlan, load, stop() { stopped = true; controller.stop(); clearInterval(polling); clearInterval(clockTimer); } };
}
