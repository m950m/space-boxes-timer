const CLASSIFICATIONS = new Set(["primary", "extra"]);

function requireReference(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty logical reference.`);
  }
}

/**
 * Change classification on an existing task without mutating input records.
 * Records use opaque string id, ownershipScopeId and planDayId references,
 * plus classification ("primary" or "extra"). Other fields pass through.
 * This is a domain-operation contract, not task creation or a storage schema.
 */
export function setTaskClassification(
  tasks,
  ownershipScopeId,
  taskId,
  classification,
) {
  if (!Array.isArray(tasks)) {
    throw new TypeError("tasks must be an array of existing task records.");
  }
  requireReference(ownershipScopeId, "ownershipScopeId");
  requireReference(taskId, "taskId");
  if (!CLASSIFICATIONS.has(classification)) {
    throw new TypeError('classification must be "primary" or "extra".');
  }

  const identities = new Map();
  let target;
  for (const task of tasks) {
    if (task === null || typeof task !== "object" || Array.isArray(task)) {
      throw new TypeError("Each task must be an existing task record.");
    }
    for (const key of ["id", "ownershipScopeId", "planDayId"]) {
      requireReference(task[key], key);
    }
    if (!CLASSIFICATIONS.has(task.classification)) {
      throw new TypeError('Existing classification must be "primary" or "extra".');
    }

    if (!identities.has(task.ownershipScopeId)) {
      identities.set(task.ownershipScopeId, new Set());
    }
    const scopeIdentities = identities.get(task.ownershipScopeId);
    if (scopeIdentities.has(task.id)) {
      throw new TypeError("Task identity must be unambiguous within its scope.");
    }
    scopeIdentities.add(task.id);
    if (task.ownershipScopeId === ownershipScopeId && task.id === taskId) {
      target = task;
    }
  }
  if (!target) {
    throw new RangeError("Task was not found in the requested ownership scope.");
  }

  const result = tasks.map((task) => (
    task === target ? { ...task, classification } : task
  ));
  const primaryCount = result.filter((task) => (
    task.ownershipScopeId === ownershipScopeId
    && task.planDayId === target.planDayId
    && task.classification === "primary"
  )).length;
  if (primaryCount > 3) {
    throw new RangeError("A Plan Day permits at most three Primary tasks per scope.");
  }
  return result;
}
