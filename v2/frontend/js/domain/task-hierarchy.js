import { requireReference } from "./logical-reference.js";
import { createTaskPlanningRecord } from "./task-planning.js";
import { setTaskClassification } from "./task-classification.js";

const NEW_WORK_FIELDS = new Set([
  "id", "ownershipScopeId", "planDayId", "classification", "title", "plannedStart",
  "sessionPlan", "plannedBreaks", "parentTaskId", "note", "resources",
]);

/** Validate a complete task collection; parent references are scope-local. */
export function validateTaskHierarchy(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError("tasks must be an array of task records.");
  const scopes = new Map();
  for (const task of tasks) {
    if (task === null || typeof task !== "object" || Array.isArray(task)) {
      throw new TypeError("Each task must be a task record.");
    }
    requireReference(task.id, "id");
    requireReference(task.ownershipScopeId, "ownershipScopeId");
    if (task.parentTaskId !== undefined && task.parentTaskId !== null) {
      requireReference(task.parentTaskId, "parentTaskId");
    }
    if (!scopes.has(task.ownershipScopeId)) scopes.set(task.ownershipScopeId, new Map());
    const scope = scopes.get(task.ownershipScopeId);
    if (scope.has(task.id)) {
      throw new TypeError("Task identity must be unambiguous within its scope.");
    }
    scope.set(task.id, task);
  }

  for (const scope of scopes.values()) {
    for (const task of scope.values()) {
      if (task.parentTaskId != null && !scope.has(task.parentTaskId)) {
        throw new RangeError("Parent task was not found in the same ownership scope.");
      }
    }
    // Iterative traversal: no call-stack limit, depth policy or ancestry snapshots.
    const checked = new Set();
    for (const task of scope.values()) {
      const path = new Set();
      let current = task;
      while (current && !checked.has(current.id)) {
        if (path.has(current.id)) throw new TypeError("Task hierarchy cannot contain cycles.");
        path.add(current.id);
        current = scope.get(current.parentTaskId);
      }
      for (const id of path) checked.add(id);
    }
  }
}

function requireTarget(tasks, ownershipScopeId, taskId) {
  requireReference(ownershipScopeId, "ownershipScopeId");
  requireReference(taskId, "taskId");
  const target = tasks.find((task) => (
    task.ownershipScopeId === ownershipScopeId && task.id === taskId
  ));
  if (!target) throw new RangeError("Task was not found in the requested ownership scope.");
  return target;
}

/** Replace the single current parent, or detach with null; history passes through. */
export function setTaskParent(tasks, ownershipScopeId, taskId, parentTaskId) {
  validateTaskHierarchy(tasks);
  const target = requireTarget(tasks, ownershipScopeId, taskId);
  if (parentTaskId !== null) requireReference(parentTaskId, "parentTaskId");
  const result = tasks.map((task) => task === target ? { ...task, parentTaskId } : task);
  validateTaskHierarchy(result);
  return result;
}

/**
 * Add caller-identified, separately planned work. The source stays unchanged.
 * No implicit replanning, lineage, parent assignment or historical credit copying.
 */
export function splitTaskPlanningRecord(tasks, ownershipScopeId, taskId, newWork) {
  validateTaskHierarchy(tasks);
  const source = requireTarget(tasks, ownershipScopeId, taskId);
  createTaskPlanningRecord(source);
  if (!Array.isArray(newWork) || newWork.length === 0) {
    throw new TypeError("newWork must contain separately planned task records.");
  }
  const additions = Array.from(newWork, (record) => {
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("New work must be a planning record.");
    }
    for (const key of Reflect.ownKeys(record)) {
      if (!NEW_WORK_FIELDS.has(key)) {
        throw new TypeError(`${String(key)} is not a new-work planning field.`);
      }
    }
    if (record.ownershipScopeId !== ownershipScopeId) {
      throw new TypeError("Split work must stay in the source ownership scope.");
    }
    return createTaskPlanningRecord(record);
  });
  let result = [...tasks, ...additions];
  validateTaskHierarchy(result);
  // Reuse scope/day classification validation for each destination, atomically.
  for (const task of additions) {
    result = setTaskClassification(result, ownershipScopeId, task.id, task.classification);
  }
  return result;
}
