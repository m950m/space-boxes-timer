import { requireReference } from "./logical-reference.js";

const EDITABLE_FIELDS = new Set(["title", "plannedStart", "sessionPlan", "plannedBreaks"]);
const COMPUTED_FIELDS = ["sessionCount", "plannedFocusMinutes"];

function requireRecord(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a record.`);
  }
}

function validateItems(items, name, durationField) {
  if (!Array.isArray(items)) throw new TypeError(`${name} must be an array.`);
  const identities = new Set();
  for (const item of items) {
    requireRecord(item, name);
    requireReference(item.id, `${name} id`);
    if (identities.has(item.id)) {
      throw new TypeError(`${name} identity must be unambiguous within its task.`);
    }
    identities.add(item.id);
    if (!Number.isFinite(item[durationField])) {
      throw new TypeError(`${durationField} must be a finite number.`);
    }
    if (durationField === "breakMinutes") {
      requireReference(item.afterFocusItemId, "afterFocusItemId");
      requireReference(item.beforeFocusItemId, "beforeFocusItemId");
    }
  }
  return identities;
}

function validateRetiredItems(record, field, activeIds, durationField) {
  const retiredIds = validateItems(Object.hasOwn(record, field) ? record[field] : [],
    field, durationField);
  for (const id of retiredIds) {
    if (activeIds.has(id)) {
      throw new TypeError(`${field} identity cannot also be in the current plan.`);
    }
  }
}

function validatePlanning(record) {
  requireRecord(record, "task");
  for (const key of ["id", "ownershipScopeId", "planDayId"]) {
    requireReference(record[key], key);
  }
  if (typeof record.title !== "string" || record.title.trim() === "") {
    throw new TypeError("title must be a non-empty string.");
  }
  // Scheduling intent is opaque; no timestamp format or clock interpretation.
  if (record.plannedStart === undefined || record.plannedStart === null
      || (typeof record.plannedStart === "string" && record.plannedStart.trim() === "")) {
    throw new TypeError("plannedStart is required.");
  }
  for (const key of COMPUTED_FIELDS) {
    if (Object.hasOwn(record, key)) {
      throw new TypeError(`${key} is computed from sessionPlan, not an editable field.`);
    }
  }
  if (!Array.isArray(record.sessionPlan) || record.sessionPlan.length === 0) {
    throw new TypeError("sessionPlan must contain identifiable planned focus items.");
  }

  const identities = validateItems(record.sessionPlan, "planned focus item", "activeMinutes");
  let plannedFocusMinutes = 0;
  for (const item of record.sessionPlan) {
    plannedFocusMinutes += item.activeMinutes;
  }
  if (!Number.isFinite(plannedFocusMinutes)) {
    throw new TypeError("The planned focus total must be a finite number.");
  }
  validateRetiredItems(record, "retiredFocusItems", identities, "activeMinutes");
  const breakIds = validateItems(Object.hasOwn(record, "plannedBreaks") ? record.plannedBreaks : [],
    "planned break", "breakMinutes");
  validateRetiredItems(record, "retiredPlannedBreaks", breakIds, "breakMinutes");
  const positions = new Map(record.sessionPlan.map((item, index) => [item.id, index]));
  for (const plannedBreak of record.plannedBreaks ?? []) {
    const after = positions.get(plannedBreak.afterFocusItemId);
    const before = positions.get(plannedBreak.beforeFocusItemId);
    if (after === undefined || before !== after + 1) {
      throw new TypeError("Planned breaks must be placed between adjacent current focus items.");
    }
  }
  return { sessionCount: record.sessionPlan.length, plannedFocusMinutes };
}

/**
 * Validate caller-supplied Task planning data and return a plan snapshot.
 * References follow V2-009A; array order is intent, not a persistence schema.
 * Durations are numeric minutes with no selected product bounds/defaults.
 */
export function createTaskPlanningRecord(record) {
  validatePlanning(record);
  const result = {
    ...record,
    sessionPlan: record.sessionPlan.map((item) => ({ ...item })),
  };
  for (const field of ["plannedBreaks", "retiredFocusItems", "retiredPlannedBreaks"]) {
    if (Object.hasOwn(record, field)) {
      result[field] = record[field].map((item) => ({ ...item }));
    }
  }
  return result;
}

// Retain every removed identity: historical references may live outside this task.
function retainRemovedItems(record, next, activeField, retiredField) {
  const current = record[activeField] ?? [];
  const nextIds = new Set((next[activeField] ?? []).map((item) => item?.id));
  const removed = current.filter((item) => !nextIds.has(item.id));
  if (removed.length > 0) {
    next[retiredField] = [...(record[retiredField] ?? []), ...removed];
  }
}

/** Edit only current metadata/plan; identity, Plan Day and history pass through. */
export function updateTaskPlanningRecord(record, changes) {
  validatePlanning(record);
  requireRecord(changes, "planning changes");
  for (const key of Reflect.ownKeys(changes)) {
    if (!EDITABLE_FIELDS.has(key)) {
      throw new TypeError(`${String(key)} is not an editable planning field.`);
    }
  }
  const next = { ...record, ...changes };
  // Validate input collections before computing their identity differences.
  validatePlanning(next);
  retainRemovedItems(record, next, "sessionPlan", "retiredFocusItems");
  retainRemovedItems(record, next, "plannedBreaks", "retiredPlannedBreaks");
  return createTaskPlanningRecord(next);
}

/** Derive a fresh projection; no separately stored/editable count or total. */
export function getTaskPlanningTotals(record) {
  return validatePlanning(record);
}

function findCurrentItem(record, field, id) {
  validatePlanning(record);
  requireReference(id, "planned item id");
  const index = (record[field] ?? []).findIndex((item) => item.id === id);
  if (index < 0) throw new RangeError("Planned item was not found in the current plan.");
  return index;
}

/** Insert a caller-identified focus item at an explicit zero-based position. */
export function addPlannedFocusItem(record, item, index) {
  validatePlanning(record);
  if (!Number.isInteger(index) || index < 0 || index > record.sessionPlan.length) {
    throw new RangeError("Focus insertion index must be within the current plan.");
  }
  const sessionPlan = [...record.sessionPlan];
  sessionPlan.splice(index, 0, item);
  return updateTaskPlanningRecord(record, { sessionPlan });
}

/** Edit duration under the same logical identity; no lifecycle/history edits. */
export function editPlannedFocusItem(record, id, activeMinutes) {
  const index = findCurrentItem(record, "sessionPlan", id);
  const sessionPlan = [...record.sessionPlan];
  sessionPlan[index] = { ...sessionPlan[index], activeMinutes };
  return updateTaskPlanningRecord(record, { sessionPlan });
}

/** Reorder by a complete permutation of current identities, never by new IDs. */
export function reorderPlannedFocusItems(record, ids) {
  validatePlanning(record);
  if (!Array.isArray(ids) || ids.length !== record.sessionPlan.length
      || new Set(ids).size !== ids.length) {
    throw new TypeError("Focus order must contain every current identity exactly once.");
  }
  const items = new Map(record.sessionPlan.map((item) => [item.id, item]));
  const sessionPlan = Array.from(ids, (id) => {
    requireReference(id, "planned focus item id");
    if (!items.has(id)) throw new RangeError("Focus order contains an unknown identity.");
    return items.get(id);
  });
  return updateTaskPlanningRecord(record, { sessionPlan });
}

/** Retire a focus item without deleting it or any recorded session evidence. */
export function removePlannedFocusItem(record, id) {
  const index = findCurrentItem(record, "sessionPlan", id);
  return updateTaskPlanningRecord(record, {
    sessionPlan: record.sessionPlan.filter((_, position) => position !== index),
  });
}

/** Place deliberate rest between explicit adjacent focus identities. */
export function addPlannedBreak(record, plannedBreak) {
  validatePlanning(record);
  return updateTaskPlanningRecord(record, {
    plannedBreaks: [...(record.plannedBreaks ?? []), plannedBreak],
  });
}

/** Edit rest duration/placement while preserving its logical identity. */
export function editPlannedBreak(record, id, changes) {
  const index = findCurrentItem(record, "plannedBreaks", id);
  requireRecord(changes, "planned break changes");
  for (const key of Reflect.ownKeys(changes)) {
    if (!["breakMinutes", "afterFocusItemId", "beforeFocusItemId"].includes(key)) {
      throw new TypeError(`${String(key)} is not an editable planned break field.`);
    }
  }
  const plannedBreaks = [...record.plannedBreaks];
  plannedBreaks[index] = { ...plannedBreaks[index], ...changes };
  return updateTaskPlanningRecord(record, { plannedBreaks });
}

export function removePlannedBreak(record, id) {
  const index = findCurrentItem(record, "plannedBreaks", id);
  return updateTaskPlanningRecord(record, {
    plannedBreaks: record.plannedBreaks.filter((_, position) => position !== index),
  });
}

function getPlannedItem(record, id, currentField, retiredField) {
  validatePlanning(record);
  requireReference(id, "planned item id");
  const item = [...(record[currentField] ?? []), ...(record[retiredField] ?? [])]
    .find((candidate) => candidate.id === id);
  if (!item) throw new RangeError("Planned item identity was not found in this task.");
  return { ...item };
}

/** Resolve history associations even when an item is no longer in the plan. */
export function getPlannedFocusItem(record, id) {
  return getPlannedItem(record, id, "sessionPlan", "retiredFocusItems");
}

export function getPlannedBreak(record, id) {
  return getPlannedItem(record, id, "plannedBreaks", "retiredPlannedBreaks");
}
