import { openPlanningStore } from "./persistence/planning-store.js";
import { getTaskPlanningTotals } from "./domain/task-planning.js";
import { mountFocus } from "./focus/focus-view.js";
import { mountReports } from "./reports/reports-view.js";
import { mountAccountPanel } from "./account-view.js";

const $ = (id) => document.getElementById(id);
const form = $("task-form");
const fields = $("editor-fields");
const items = $("focus-items");
const splitForm = $("split-form");
const splitFields = $("split-fields");
const splitItems = $("split-items");
const breakList = $("break-list");
const resourceList = $("resource-list");
const status = $("v2-startup-status");
const errorBox = $("planner-error");
const viewDay = $("view-day");
let store;
let snapshot; // Projection of the last successful storage operation.
let focusView;
let accountPanel;
let reportsView;
let editingTask;
let busy = true;
let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function showTimezone() {
  const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $("timezone-context").textContent = current === timezone
    ? `System timezone: ${current}.`
    : `Timezone changed from ${timezone} to ${current}. Existing plans keep their saved time context.`;
  timezone = current;
}
window.addEventListener("focus", showTimezone);
showTimezone();
viewDay.value = today();

function setBusy(value) {
  busy = value;
  fields.disabled = value || !snapshot;
  splitFields.disabled = value || !snapshot || !editingTask;
  viewDay.disabled = value || !snapshot;
  $("reload-plans").disabled = value || !store;
  $("task-list").setAttribute("aria-busy", String(value));
  for (const button of $("task-list").querySelectorAll("button")) {
    button.disabled = value || button.dataset.decided === "true";
  }
}

function clearError() {
  errorBox.textContent = "";
  for (const input of document.querySelectorAll("[aria-invalid]")) input.removeAttribute("aria-invalid");
}

function fail(error) {
  status.textContent = "Error — changes were not saved.";
  errorBox.textContent = error.message;
}

export const planningStore = openPlanningStore({
  onStatus({ state, error }) {
    const messages = {
      loading: "Loading local plans…", ready: "Local plans loaded.",
      saving: "Saving…", saved: "Saved.",
    };
    if (state === "error") {
      status.textContent = `Error: ${error.message}`;
      errorBox.textContent = error.message;
    } else status.textContent = messages[state];
  },
});

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function rowsDraft(container, sourcePlan) {
  return [...container.children].map((row) => ({
    ...(sourcePlan?.find((item) => item.id === row.dataset.id) ?? {}),
    id: row.dataset.id,
    activeMinutes: row.querySelector("input").value.trim() === ""
      ? NaN : Number(row.querySelector("input").value),
  }));
}

function draftItems() {
  return rowsDraft(items, editingTask?.sessionPlan);
}

function planTotals(container, emptyMessage) {
  try {
    const totals = getTaskPlanningTotals({
      id: "draft", ownershipScopeId: "draft", planDayId: "draft",
      title: "draft", plannedStart: "draft", sessionPlan: rowsDraft(container),
    });
    return `${totals.sessionCount} sessions · ${totals.plannedFocusMinutes} minutes total focus`;
  } catch {
    return emptyMessage;
  }
}

function updateTotals() {
  $("focus-totals").textContent = planTotals(items,
    "Add at least one session and enter a duration for each to see the total.");
}

function updateSplitTotals() {
  $("split-totals").textContent = planTotals(splitItems,
    "Add at least one session and enter a duration for each to see the total.");
}

function labelRows(container, movable) {
  [...container.children].forEach((row, index) => {
    row.querySelector("label").textContent = `Session ${index + 1} duration (minutes, required)`;
    for (const button of row.querySelectorAll("button")) {
      button.setAttribute("aria-label", `${button.textContent} session ${index + 1}`);
      if (movable) {
        button.disabled = (button.dataset.action === "up" && index === 0)
          || (button.dataset.action === "down" && index === container.children.length - 1);
      }
    }
  });
}

function labelItems() {
  labelRows(items, true);
  updateTotals();
  refreshBreaks();
}

function labelSplitItems() {
  labelRows(splitItems, false);
  updateSplitTotals();
}

function addSessionRow(container, item, movable) {
  const row = element("li", undefined, "focus-item");
  row.dataset.id = item.id;
  const input = element("input");
  input.id = `duration-${item.id}`;
  input.type = "number";
  input.step = "any";
  input.required = true;
  input.value = item.activeMinutes ?? "";
  const label = element("label");
  label.htmlFor = input.id;
  row.append(label, input);
  for (const [action, text] of movable
    ? [["up", "Move up"], ["down", "Move down"], ["remove", "Remove"]]
    : [["remove", "Remove"]]) {
    const button = element("button", text);
    button.type = "button";
    button.dataset.action = action;
    row.append(button);
  }
  container.append(row);
  (movable ? labelItems : labelSplitItems)();
  return input;
}

function addItem(item = { id: crypto.randomUUID() }) {
  return addSessionRow(items, item, true);
}

function addSplitItem(item = { id: crypto.randomUUID() }) {
  return addSessionRow(splitItems, item, false);
}

// Gaps of the current draft session order; breaks attach to adjacent identities.
function draftGaps() {
  const rows = [...items.children];
  const gaps = [];
  for (let index = 0; index + 1 < rows.length; index++) {
    gaps.push({ after: rows[index].dataset.id, before: rows[index + 1].dataset.id, index });
  }
  return gaps;
}

function refreshBreaks() {
  const gaps = draftGaps();
  $("add-break").disabled = gaps.length === 0;
  [...breakList.children].forEach((row, index) => {
    row.querySelector("label").textContent = `Break ${index + 1} duration (minutes, required)`;
    const select = row.querySelector("select");
    select.setAttribute("aria-label", `Placement of break ${index + 1} between adjacent sessions`);
    row.querySelector("button").setAttribute("aria-label", `Remove planned break ${index + 1}`);
    const current = row.dataset.placement ?? "";
    select.replaceChildren();
    for (const gap of gaps) {
      select.append(new Option(`Between session ${gap.index + 1} and ${gap.index + 2}`, `${gap.after}|${gap.before}`));
    }
    if (current && !gaps.some((gap) => `${gap.after}|${gap.before}` === current)) {
      select.append(new Option("Previous placement (sessions moved apart)", current));
    }
    if (current) select.value = current;
    else if (gaps.length) select.value = `${gaps[0].after}|${gaps[0].before}`;
    row.dataset.placement = select.value;
  });
}

function addBreakRow(plannedBreak = {}) {
  const row = element("div", undefined, "break-row");
  row.dataset.breakId = plannedBreak.id ?? crypto.randomUUID();
  if (plannedBreak.afterFocusItemId) {
    row.dataset.placement = `${plannedBreak.afterFocusItemId}|${plannedBreak.beforeFocusItemId}`;
  }
  const input = element("input");
  input.type = "number";
  input.step = "any";
  input.required = true;
  input.id = `break-minutes-${row.dataset.breakId}`;
  input.value = plannedBreak.breakMinutes ?? "";
  const label = element("label");
  label.htmlFor = input.id;
  const select = element("select");
  select.id = `break-placement-${row.dataset.breakId}`;
  const remove = element("button", "Remove");
  remove.type = "button";
  row.append(label, input, select, remove);
  breakList.append(row);
  refreshBreaks();
  return input;
}

function draftBreaks() {
  return [...breakList.children].map((row) => {
    const [afterFocusItemId, beforeFocusItemId] = row.querySelector("select").value.split("|");
    return {
      id: row.dataset.breakId,
      afterFocusItemId,
      beforeFocusItemId,
      breakMinutes: row.querySelector("input").value.trim() === ""
        ? NaN : Number(row.querySelector("input").value),
    };
  });
}

// Only web URLs open directly; every other stored value stays inert text.
function safeResourceUrl(resource) {
  try {
    const parsed = new URL(resource.url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function addResourceRow(resource = {}) {
  const row = element("div", undefined, "resource-row");
  const url = element("input", undefined, "resource-url");
  url.type = "text";
  url.required = true;
  url.id = `resource-url-${crypto.randomUUID()}`;
  url.value = resource.url ?? "";
  url.placeholder = "https://example.com/page";
  const urlLabel = element("label");
  urlLabel.htmlFor = url.id;
  const urlField = element("div", undefined, "resource-field");
  urlField.append(urlLabel, url);
  const text = element("input", undefined, "resource-label");
  text.type = "text";
  text.id = `resource-label-${crypto.randomUUID()}`;
  text.value = resource.label ?? "";
  text.placeholder = "Label (optional)";
  const textLabel = element("label");
  textLabel.htmlFor = text.id;
  const textField = element("div", undefined, "resource-field");
  textField.append(textLabel, text);
  const remove = element("button", "Remove");
  remove.type = "button";
  row.append(urlField, textField, remove);
  resourceList.append(row);
  labelResourceRows();
  return url;
}

function labelResourceRows() {
  [...resourceList.children].forEach((row, index) => {
    const [urlLabel, textLabel] = row.querySelectorAll("label");
    urlLabel.textContent = `Resource ${index + 1} URL (required)`;
    textLabel.textContent = `Resource ${index + 1} label (optional)`;
    row.querySelector("button").setAttribute("aria-label", `Remove resource link ${index + 1}`);
  });
}

function draftResources() {
  return [...resourceList.children].map((row) => {
    const resource = { url: row.querySelector(".resource-url").value.trim() };
    const label = row.querySelector(".resource-label").value.trim();
    if (label) resource.label = label;
    return resource;
  });
}

function resetEditor(task) {
  editingTask = task;
  form.reset();
  clearError();
  $("editor-heading").textContent = task ? "Edit task" : "Create task";
  $("task-title").value = task?.title ?? "";
  $("task-day").value = task?.planDayId ?? viewDay.value;
  $("task-start").value = task?.plannedStart?.time ?? task?.plannedStart ?? "";
  $("task-classification").value = task?.classification ?? "extra";
  $("task-note").value = task?.note ?? "";
  populateParents(task);
  $("task-parent").value = task?.parentTaskId ?? "";
  breakList.replaceChildren();
  items.replaceChildren();
  for (const item of task?.sessionPlan ?? [{ id: crypto.randomUUID() }]) addItem(item);
  for (const plannedBreak of task?.plannedBreaks ?? []) addBreakRow(plannedBreak);
  resourceList.replaceChildren();
  for (const resource of task?.resources ?? []) addResourceRow(resource);
  resetSplitDraft(task);
}

function resetSplitDraft(task) {
  splitForm.reset();
  $("split-day").value = task?.planDayId ?? viewDay.value;
  splitItems.replaceChildren();
  addSplitItem();
  splitFields.disabled = busy || !snapshot || !task;
}

function descendantsOf(tasks, rootId) {
  const childrenOf = new Map();
  for (const task of tasks) {
    if (task.parentTaskId) {
      if (!childrenOf.has(task.parentTaskId)) childrenOf.set(task.parentTaskId, []);
      childrenOf.get(task.parentTaskId).push(task.id);
    }
  }
  const excluded = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    for (const child of childrenOf.get(queue.pop()) ?? []) {
      if (!excluded.has(child)) { excluded.add(child); queue.push(child); }
    }
  }
  return excluded;
}

/** Offer saved tasks as parents; a task never chooses itself or a descendant. */
function populateParents(task) {
  if (!snapshot) return;
  const select = $("task-parent");
  const excluded = task ? descendantsOf(snapshot.tasks, task.id) : new Set();
  select.replaceChildren(new Option("No parent", ""));
  for (const candidate of snapshot.tasks) {
    if (!excluded.has(candidate.id)) {
      select.append(new Option(`${candidate.title} — ${candidate.planDayId}`, candidate.id));
    }
  }
}

function renderTasks() {
  accountPanel?.update(snapshot);
  focusView?.setPlan(snapshot, viewDay.value);
  for (const classification of ["primary", "extra"]) {
    const container = $(`${classification}-tasks`);
    container.replaceChildren();
    const tasks = snapshot.tasks.filter((task) => task.planDayId === viewDay.value && task.classification === classification);
    if (!tasks.length) container.append(element("p", `No ${classification === "primary" ? "Primary" : "Extra"} tasks for this day.`));
    for (const task of tasks) {
      const card = element("article");
      card.dataset.taskId = task.id;
      card.tabIndex = -1;
      if (classification === "primary") card.classList.add("primary-card");
      const totals = getTaskPlanningTotals(task);
      const start = task.plannedStart?.time ?? task.plannedStart;
      const zone = task.plannedStart?.timezone;
      card.append(element("p", classification === "primary" ? "Primary task" : "Extra task", "task-kind"),
        element("h4", task.title));
      if (task.parentTaskId) {
        const parent = snapshot.tasks.find((candidate) => candidate.id === task.parentTaskId);
        card.append(element("p", `Subtask of: ${parent ? parent.title : task.parentTaskId}`, "subtask-of"));
      }
      card.append(element("p", `Planned start: ${String(start)}${zone ? ` (${zone})` : ""}`),
        element("p", `${totals.sessionCount} sessions · ${totals.plannedFocusMinutes} minutes total focus`),
        element("p", `Session durations: ${task.sessionPlan.map((item) => item.activeMinutes).join(" → ")} minutes`));
      if (task.plannedBreaks?.length) {
        card.append(element("p", `Planned breaks: ${task.plannedBreaks.map((plannedBreak) => plannedBreak.breakMinutes).join(" → ")} minutes`));
      }
      if (task.resources?.length) {
        const links = element("ul", undefined, "resource-links");
        for (const resource of task.resources) {
          const item = element("li");
          const safe = safeResourceUrl(resource);
          if (safe) {
            const text = resource.label || resource.url;
            const link = element("a", text);
            link.href = safe;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.setAttribute("aria-label", `Open resource ${text} in a new browser tab`);
            item.append(link);
          } else {
            item.append(element("span", `${resource.label || resource.url} (not a web link)`));
          }
          links.append(item);
        }
        card.append(links);
      }
      if (task.note) card.append(element("p", task.note, "note"));
      if (task.completedAt && task.cancelledAt) {
        card.append(element("p", "Task has both completed and cancelled records.", "decision-conflict"));
      }
      if (task.completedAt) card.append(element("p", "Marked complete"));
      if (task.cancelledAt) card.append(element("p", "Cancelled"));
      const edit = element("button", "Edit task");
      edit.type = "button";
      edit.setAttribute("aria-label", `Edit task: ${task.title}`);
      edit.addEventListener("click", () => {
        resetEditor(task);
        status.textContent = "Editing task. Save to apply changes.";
        $("task-title").focus();
      });
      card.append(edit);
      const decisionMade = Boolean(task.completedAt || task.cancelledAt);
      for (const [type, field, text] of [["complete", "completedAt", "Mark complete"], ["cancel", "cancelledAt", "Cancel task"]]) {
        const button = element("button", text);
        button.type = "button";
        // One current decision per task; earlier decisions and history are never erased.
        button.dataset.decided = String(decisionMade);
        button.disabled = decisionMade;
        button.setAttribute("aria-label", !decisionMade
          ? `${text}: ${task.title}`
          : Boolean(task[field])
            ? `Task already ${field === "completedAt" ? "marked complete" : "cancelled"}`
            : `${text} unavailable: task was ${task.completedAt ? "completed" : "cancelled"}`);
        button.addEventListener("click", () => decideTask(task.id, type));
        card.append(button);
      }
      container.append(card);
    }
  }
  const dayTasks = snapshot.tasks.filter((task) => task.planDayId === viewDay.value);
  const primaryCount = dayTasks.filter((task) => task.classification === "primary").length;
  // Cancelled plans are not actionable; completed tasks keep their planned minutes.
  const plannedMinutes = dayTasks
    .filter((task) => !task.cancelledAt)
    .reduce((sum, task) => sum + getTaskPlanningTotals(task).plannedFocusMinutes, 0);
  $("day-summary").textContent = dayTasks.length
    ? `${primaryCount} of up to 3 Primary · ${dayTasks.length - primaryCount} Extra · ${plannedMinutes} minutes planned focus (completed included, cancelled excluded)`
    : "No tasks planned for this day yet.";
}

// Explicit lifecycle decisions only; no session outcome ever completes a task.
async function decideTask(taskId, type) {
  if (busy || !snapshot) return;
  const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
  if (task && (task.completedAt || task.cancelledAt)) return;
  clearError();
  try {
    setBusy(true);
    snapshot = await store.commit(store.localScopeId, snapshot.revision,
      [{ type, taskId, decidedAt: new Date().toISOString() }]);
    renderTasks();
    status.textContent = type === "complete"
      ? "Task marked complete. Planning records are kept."
      : "Task cancelled. Planning records are kept.";
  } catch (error) { fail(error); return; }
  finally { setBusy(false); }
  document.querySelector(`article[data-task-id="${taskId}"]`)?.focus();
}

function unsaved() {
  clearError();
  status.textContent = "Unsaved changes. Save task to keep them.";
  updateTotals();
}
form.addEventListener("input", unsaved);
form.addEventListener("change", unsaved);
$("add-focus").addEventListener("click", () => { addItem().focus(); unsaved(); });
function wireSessionRows(container, movable, focusFallbackId, afterChange) {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const row = button.closest("li");
    const neighbor = button.dataset.action === "up" ? row.previousElementSibling : row.nextElementSibling;
    if (button.dataset.action === "remove") {
      row.remove();
      (neighbor?.querySelector("input") ?? $(focusFallbackId)).focus();
    } else if (neighbor) {
      if (button.dataset.action === "up") container.insertBefore(row, neighbor);
      else container.insertBefore(neighbor, row);
      row.querySelector("input").focus();
    }
    (movable ? labelItems : labelSplitItems)();
    afterChange();
  });
}
wireSessionRows(items, true, "add-focus", unsaved);
wireSessionRows(splitItems, false, "add-split-focus", unsavedSplit);
breakList.addEventListener("change", (event) => {
  const select = event.target.closest("select");
  if (select) select.closest(".break-row").dataset.placement = select.value;
});
breakList.addEventListener("input", unsaved);
breakList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const row = button.closest(".break-row");
  const neighbor = row.nextElementSibling ?? row.previousElementSibling;
  row.remove();
  (neighbor?.querySelector("input") ?? $("add-break")).focus();
  refreshBreaks();
  unsaved();
});
$("add-break").addEventListener("click", () => { addBreakRow().focus(); unsaved(); });
resourceList.addEventListener("input", unsaved);
resourceList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const row = button.closest(".resource-row");
  const neighbor = row.nextElementSibling ?? row.previousElementSibling;
  row.remove();
  (neighbor?.querySelector("input") ?? $("add-resource")).focus();
  labelResourceRows();
  unsaved();
});
$("add-resource").addEventListener("click", () => { addResourceRow().focus(); unsaved(); });
$("cancel-edit").addEventListener("click", () => {
  resetEditor();
  status.textContent = "Editor cleared. Saved plans unchanged.";
  $("task-title").focus();
});
viewDay.addEventListener("change", () => { if (viewDay.validity.valid) renderTasks(); });

function invalid(input, message) {
  input.setAttribute("aria-invalid", "true");
  input.focus();
  throw new TypeError(message);
}

function commandsFromForm() {
  if (!$("task-title").value.trim()) invalid($("task-title"), "Enter a task title.");
  if (!$("task-day").value || !$("task-day").validity.valid) invalid($("task-day"), "Choose a valid Plan Day.");
  if (!$("task-start").value || !$("task-start").validity.valid) invalid($("task-start"), "Choose a planned start time.");
  if (!items.children.length) invalid($("add-focus"), "Add at least one focus session.");
  for (const input of items.querySelectorAll("input")) {
    if (!input.validity.valid || input.value.trim() === "" || !Number.isFinite(Number(input.value))) {
      invalid(input, "Enter a numeric duration in minutes for each focus session.");
    }
  }
  for (const row of breakList.children) {
    const input = row.querySelector("input");
    if (!input.validity.valid || input.value.trim() === "" || !Number.isFinite(Number(input.value))) {
      invalid(input, "Enter a numeric duration in minutes for each planned break.");
    }
    if (!row.querySelector("select").value) {
      invalid(row.querySelector("select"), "Choose a placement between adjacent sessions for each planned break.");
    }
  }
  for (const row of resourceList.children) {
    if (!row.querySelector(".resource-url").value.trim()) {
      invalid(row.querySelector(".resource-url"), "Enter a web address for each resource link, or remove the row.");
    }
  }
  const day = $("task-day").value;
  const time = $("task-start").value;
  const previousTime = editingTask?.plannedStart?.time ?? editingTask?.plannedStart;
  const plannedStart = editingTask && previousTime === time && editingTask.planDayId === day
    ? editingTask.plannedStart : { time, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  const changes = {
    title: $("task-title").value, plannedStart, sessionPlan: draftItems(), plannedBreaks: draftBreaks(),
    resources: draftResources(), note: $("task-note").value,
  };
  const classification = $("task-classification").value;
  const parentTaskId = $("task-parent").value || null;
  if (!editingTask) {
    const task = {
      id: crypto.randomUUID(), ownershipScopeId: store.localScopeId, planDayId: day, classification, ...changes,
    };
    if (parentTaskId) task.parentTaskId = parentTaskId;
    return [{ type: "create", task }];
  }
  const taskId = editingTask.id;
  const commands = [];
  // Demote before moving to a full day; every command still passes domain checks.
  if (classification === "extra") commands.push({ type: "classify", taskId, classification });
  if (day !== editingTask.planDayId) commands.push({ type: "reschedule", taskId, planDayId: day, plannedStart });
  commands.push({ type: "edit", taskId, changes });
  if ((editingTask.parentTaskId ?? null) !== parentTaskId) {
    commands.push({ type: "parent", taskId, parentTaskId });
  }
  if (classification === "primary") commands.push({ type: "classify", taskId, classification });
  return commands;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !snapshot) return;
  clearError();
  try {
    const commands = commandsFromForm();
    setBusy(true);
    snapshot = await store.commit(store.localScopeId, snapshot.revision, commands);
    viewDay.value = $("task-day").value;
    renderTasks();
    resetEditor();
  } catch (error) { fail(error); return; }
  finally { setBusy(false); }
  $("task-title").focus();
});

function unsavedSplit() {
  clearError();
  status.textContent = "Unsaved split work. Use Split work to create it.";
  updateSplitTotals();
}

function splitRecordFromForm() {
  if (!$("split-title").value.trim()) invalid($("split-title"), "Enter a title for the split work.");
  if (!$("split-day").value || !$("split-day").validity.valid) {
    invalid($("split-day"), "Choose a valid Plan Day for the split work.");
  }
  if (!$("split-start").value || !$("split-start").validity.valid) {
    invalid($("split-start"), "Choose a planned start for the split work.");
  }
  if (!splitItems.children.length) {
    invalid($("add-split-focus"), "Add at least one focus session for the split work.");
  }
  for (const input of splitItems.querySelectorAll("input")) {
    if (!input.validity.valid || input.value.trim() === "" || !Number.isFinite(Number(input.value))) {
      invalid(input, "Enter a numeric duration in minutes for each new work session.");
    }
  }
  const record = {
    id: crypto.randomUUID(),
    ownershipScopeId: store.localScopeId,
    planDayId: $("split-day").value,
    classification: $("split-classification").value,
    title: $("split-title").value,
    plannedStart: { time: $("split-start").value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    sessionPlan: rowsDraft(splitItems),
  };
  if ($("split-as-subtask").checked) record.parentTaskId = editingTask.id;
  return record;
}

splitForm.addEventListener("input", unsavedSplit);
splitForm.addEventListener("change", unsavedSplit);
splitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !snapshot || !editingTask) return;
  clearError();
  try {
    const record = splitRecordFromForm();
    setBusy(true);
    snapshot = await store.commit(store.localScopeId, snapshot.revision,
      [{ type: "split", taskId: editingTask.id, newWork: [record] }]);
    viewDay.value = record.planDayId;
    renderTasks();
    resetSplitDraft(editingTask);
    status.textContent = "Split work created. The edited task is unchanged.";
  } catch (error) { fail(error); return; }
  finally { setBusy(false); }
  $("split-title").focus();
});

async function loadPlans() {
  setBusy(true);
  clearError();
  try {
    snapshot = await store.load();
    accountPanel?.update(snapshot);
    renderTasks();
    resetEditor();
  } catch (error) {
    status.textContent = "Error — local plans could not be loaded.";
    errorBox.textContent = error.message;
  } finally { setBusy(false); }
  if (snapshot) $("task-title").focus();
}
$("reload-plans").addEventListener("click", loadPlans);
planningStore.then(async (opened) => {
  store = opened;
  accountPanel = mountAccountPanel({ planningStore });
  await loadPlans();
  // Independent status reporting keeps focus checkpoints from overwriting planner feedback.
  const focusStore = await openPlanningStore();
  focusView = mountFocus(focusStore);
  focusView.setPlan(snapshot, viewDay.value);
  await focusView.load();
  reportsView = mountReports(focusStore);
  await reportsView.refresh();
  window.addEventListener("pagehide", () => { focusView.stop(); focusStore.close(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
}).catch((error) => {
  setBusy(false);
  $("focus-status").textContent = "Error — saved focus could not be loaded.";
  $("focus-error").textContent = error.message;
  $("focus-panel").setAttribute("aria-busy", "false");
});
