import { openPlanningStore } from "./persistence/planning-store.js";
import { getTaskPlanningTotals } from "./domain/task-planning.js";

const $ = (id) => document.getElementById(id);
const form = $("task-form");
const fields = $("editor-fields");
const items = $("focus-items");
const status = $("v2-startup-status");
const errorBox = $("planner-error");
const viewDay = $("view-day");
let store;
let snapshot; // Projection of the last successful storage operation.
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
  viewDay.disabled = value || !snapshot;
  $("reload-plans").disabled = value || !store;
  $("task-list").setAttribute("aria-busy", String(value));
  for (const button of $("task-list").querySelectorAll("button")) button.disabled = value;
}

function clearError() {
  errorBox.textContent = "";
  for (const input of form.querySelectorAll("[aria-invalid]")) input.removeAttribute("aria-invalid");
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

function draftItems() {
  return [...items.children].map((row) => ({
    ...(editingTask?.sessionPlan.find((item) => item.id === row.dataset.id) ?? {}),
    id: row.dataset.id,
    activeMinutes: row.querySelector("input").value.trim() === ""
      ? NaN : Number(row.querySelector("input").value),
  }));
}

function updateTotals() {
  try {
    const totals = getTaskPlanningTotals({
      id: "draft", ownershipScopeId: "draft", planDayId: "draft",
      title: "draft", plannedStart: "draft", sessionPlan: draftItems(),
    });
    $("focus-totals").textContent = `${totals.sessionCount} sessions · ${totals.plannedFocusMinutes} minutes total focus`;
  } catch {
    $("focus-totals").textContent = "Add at least one session and enter a duration for each to see the total.";
  }
}

function labelItems() {
  [...items.children].forEach((row, index) => {
    row.querySelector("label").textContent = `Session ${index + 1} duration (minutes, required)`;
    for (const button of row.querySelectorAll("button")) {
      button.setAttribute("aria-label", `${button.textContent} session ${index + 1}`);
      button.disabled = (button.dataset.action === "up" && index === 0)
        || (button.dataset.action === "down" && index === items.children.length - 1);
    }
  });
  updateTotals();
}

function addItem(item = { id: crypto.randomUUID() }) {
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
  for (const [action, text] of [["up", "Move up"], ["down", "Move down"], ["remove", "Remove"]]) {
    const button = element("button", text);
    button.type = "button";
    button.dataset.action = action;
    row.append(button);
  }
  items.append(row);
  labelItems();
  return input;
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
  items.replaceChildren();
  for (const item of task?.sessionPlan ?? [{ id: crypto.randomUUID() }]) addItem(item);
}

function renderTasks() {
  for (const classification of ["primary", "extra"]) {
    const container = $(`${classification}-tasks`);
    container.replaceChildren();
    const tasks = snapshot.tasks.filter((task) => task.planDayId === viewDay.value && task.classification === classification);
    if (!tasks.length) container.append(element("p", `No ${classification === "primary" ? "Primary" : "Extra"} tasks for this day.`));
    for (const task of tasks) {
      const card = element("article");
      card.dataset.taskId = task.id;
      const totals = getTaskPlanningTotals(task);
      const start = task.plannedStart?.time ?? task.plannedStart;
      const zone = task.plannedStart?.timezone;
      card.append(element("h3", task.title), element("p", `Planned start: ${String(start)}${zone ? ` (${zone})` : ""}`),
        element("p", `${totals.sessionCount} sessions · ${totals.plannedFocusMinutes} minutes total focus`),
        element("p", `Session durations: ${task.sessionPlan.map((item) => item.activeMinutes).join(" → ")} minutes`));
      if (task.note) card.append(element("p", task.note, "note"));
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
      container.append(card);
    }
  }
}

function unsaved() {
  clearError();
  status.textContent = "Unsaved changes. Save task to keep them.";
  updateTotals();
}
form.addEventListener("input", unsaved);
form.addEventListener("change", unsaved);
$("add-focus").addEventListener("click", () => { addItem().focus(); unsaved(); });
items.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const row = button.closest("li");
  const neighbor = button.dataset.action === "up" ? row.previousElementSibling : row.nextElementSibling;
  if (button.dataset.action === "remove") {
    row.remove();
    (neighbor?.querySelector("input") ?? $("add-focus")).focus();
  } else if (neighbor) {
    if (button.dataset.action === "up") items.insertBefore(row, neighbor);
    else items.insertBefore(neighbor, row);
    row.querySelector("input").focus();
  }
  labelItems();
  unsaved();
});
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
  const day = $("task-day").value;
  const time = $("task-start").value;
  const previousTime = editingTask?.plannedStart?.time ?? editingTask?.plannedStart;
  const plannedStart = editingTask && previousTime === time && editingTask.planDayId === day
    ? editingTask.plannedStart : { time, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  const changes = {
    title: $("task-title").value, plannedStart, sessionPlan: draftItems(), note: $("task-note").value,
  };
  const classification = $("task-classification").value;
  if (!editingTask) return [{ type: "create", task: {
    id: crypto.randomUUID(), ownershipScopeId: store.localScopeId, planDayId: day, classification, ...changes,
  } }];
  const taskId = editingTask.id;
  const commands = [];
  // Demote before moving to a full day; every command still passes domain checks.
  if (classification === "extra") commands.push({ type: "classify", taskId, classification });
  if (day !== editingTask.planDayId) commands.push({ type: "reschedule", taskId, planDayId: day, plannedStart });
  commands.push({ type: "edit", taskId, changes });
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

async function loadPlans() {
  setBusy(true);
  clearError();
  try {
    snapshot = await store.load();
    renderTasks();
    resetEditor();
  } catch (error) {
    status.textContent = "Error — local plans could not be loaded.";
    errorBox.textContent = error.message;
  } finally { setBusy(false); }
}
$("reload-plans").addEventListener("click", loadPlans);
planningStore.then(async (opened) => {
  store = opened;
  await loadPlans();
}).catch(() => { setBusy(false); });
