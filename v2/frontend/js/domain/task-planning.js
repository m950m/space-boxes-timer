import { requireReference } from "./logical-reference.js";

const EDITABLE_FIELDS = new Set(["title", "plannedStart", "sessionPlan"]);
const COMPUTED_FIELDS = ["sessionCount", "plannedFocusMinutes"];

function requireRecord(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a record.`);
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

  const identities = new Set();
  let plannedFocusMinutes = 0;
  for (const item of record.sessionPlan) {
    requireRecord(item, "planned focus item");
    requireReference(item.id, "planned focus item id");
    if (identities.has(item.id)) {
      throw new TypeError("Planned focus item identity must be unambiguous within its task.");
    }
    identities.add(item.id);
    if (!Number.isFinite(item.activeMinutes)) {
      throw new TypeError("activeMinutes must be a finite number.");
    }
    plannedFocusMinutes += item.activeMinutes;
  }
  if (!Number.isFinite(plannedFocusMinutes)) {
    throw new TypeError("The planned focus total must be a finite number.");
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
  return {
    ...record,
    sessionPlan: record.sessionPlan.map((item) => ({ ...item })),
  };
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
  return createTaskPlanningRecord({ ...record, ...changes });
}

/** Derive a fresh projection; no separately stored/editable count or total. */
export function getTaskPlanningTotals(record) {
  return validatePlanning(record);
}
