import { requireReference } from "../domain/logical-reference.js";
import { createTaskPlanningRecord, getPlannedFocusItem } from "../domain/task-planning.js";
import { validateTaskHierarchy } from "../domain/task-hierarchy.js";
import { validateFocusState } from "../focus/focus-lifecycle.js";

export const BACKUP_FORMAT = "space-boxes-local-workspace";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export function validateTasks(tasks, scopeId) {
  validateTaskHierarchy(tasks);
  const primaryCounts = new Map();
  for (const task of tasks) {
    createTaskPlanningRecord(task);
    if (task.ownershipScopeId !== scopeId) throw new TypeError("Task ownership does not match scope.");
    if (!["primary", "extra"].includes(task.classification)) throw new TypeError("Invalid classification.");
    if (task.classification === "primary" && !task.cancelledAt) {
      const count = (primaryCounts.get(task.planDayId) ?? 0) + 1;
      if (count > 3) throw new RangeError("A Plan Day permits at most three Primary tasks per scope.");
      primaryCounts.set(task.planDayId, count);
    }
  }
}

function record(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${name} record.`);
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new TypeError("Invalid Plan Day date.");
  }
}
function instant(value) {
  if (!Number.isFinite(value) || value < 0 || value > 8640000000000000) throw new TypeError("Invalid decision timestamp.");
}
function start(value) {
  const time = typeof value === "object" && value !== null ? value.time : value;
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new TypeError("Invalid planned start time.");
}

/** Versioned JSON boundary plus the same planning/focus invariant validators as storage. */
export function validateWorkspaceBackup(input) {
  record(input, "backup");
  if (input.format !== BACKUP_FORMAT || input.version !== BACKUP_VERSION) throw new TypeError("Unsupported Space Boxes backup format or version.");
  if (typeof input.exportedAt !== "string" || !Number.isFinite(Date.parse(input.exportedAt))) throw new TypeError("Invalid export timestamp.");
  const { planning, focus } = input;
  record(planning, "planning");
  requireReference(planning.ownershipScopeId, "ownershipScopeId");
  if (!Number.isSafeInteger(planning.revision) || planning.revision < 0
      || (planning.revision === 0 && planning.tasks?.length)) throw new TypeError("Invalid planning revision.");
  validateTasks(planning.tasks, planning.ownershipScopeId);
  for (const task of planning.tasks) {
    date(task.planDayId); start(task.plannedStart);
    if (task.planDay !== undefined) {
      record(task.planDay, "Plan Day");
      if (typeof task.planDay.timezone !== "string") throw new TypeError("Invalid Plan Day timezone.");
      new Intl.DateTimeFormat("en", { timeZone: task.planDay.timezone });
    }
    for (const key of ["completedAt", "cancelledAt"]) if (task[key] != null) instant(task[key]);
    if (task.completedAt != null && task.cancelledAt != null) throw new TypeError("Task cannot be both completed and cancelled.");
  }
  validateFocusState(focus);
  if (focus.ownershipScopeId !== planning.ownershipScopeId) throw new TypeError("Focus scope does not match planning.");
  for (const session of focus.sessions) {
    const task = planning.tasks.find(task => task.id === session.taskId);
    if (!task) throw new TypeError("Session references a missing task.");
    getPlannedFocusItem(task, session.plannedItemId);
    date(session.startingSnapshot.planDayId); start(session.startingSnapshot.plannedStart);
    new Intl.DateTimeFormat("en", { timeZone: session.startingSnapshot.timezone });
  }
  return input;
}
