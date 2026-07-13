// Manages task data and task-related operations.

import {
  assertFiniteNumber,
  assertNonEmptyString,
  assertOneOf,
  deepClone,
  generateUUID,
} from "./utils.js";

const TASK_STATUSES = ["idle", "running", "paused", "completed", "archived"];
const TASK_PRIORITIES = ["low", "normal", "high"];
const EDITABLE_FIELDS = ["title", "category", "priority", "estimatedDuration", "notes", "focusScore"];

/**
 * Owns task state and enforces the single-running-task invariant.
 */
export class TaskManager {
  #tasks;
  #clock;
  #idFactory;

  /**
   * @param {Array<object>} [tasks] - Initial persisted task data.
   * @param {{ clock?: () => number, idFactory?: () => string }} [options] - Dependencies.
   */
  constructor(tasks = [], { clock = Date.now, idFactory = generateUUID } = {}) {
    if (!Array.isArray(tasks)) {
      throw new TypeError("Initial tasks must be an array.");
    }

    if (typeof clock !== "function" || typeof idFactory !== "function") {
      throw new TypeError("TaskManager dependencies must be functions.");
    }

    validateInitialTasks(tasks);
    this.#tasks = deepClone(tasks);
    this.#clock = clock;
    this.#idFactory = idFactory;
    this.#assertRunningTaskInvariant();
  }

  /**
   * Creates an idle task.
   *
   * @param {{ title: string, category?: string, priority?: string, estimatedDuration?: number|null, notes?: string }} input - Task details.
   * @returns {object} The created task.
   */
  createTask(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("Task input must be an object.");
    }

    const timestamp = this.#timestamp();
    const task = {
      id: assertNonEmptyString(this.#idFactory(), "Task id"),
      title: assertNonEmptyString(input.title, "Task title"),
      category: input.category === undefined ? "general" : assertNonEmptyString(input.category, "Task category"),
      priority: input.priority === undefined ? "normal" : assertOneOf(input.priority, TASK_PRIORITIES, "Task priority"),
      estimatedDuration: normalizeOptionalDuration(input.estimatedDuration),
      status: "idle",
      createdAt: toIsoString(timestamp),
      updatedAt: toIsoString(timestamp),
      startedAt: null,
      finishedAt: null,
      totalElapsedTime: 0,
      sessions: [],
      notes: normalizeOptionalText(input.notes),
      focusScore: null,
    };

    this.#tasks.push(task);
    return deepClone(task);
  }

  /**
   * Deletes a non-running task permanently.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object} The removed task.
   */
  deleteTask(taskId) {
    const task = this.#findTask(taskId);

    if (task.status === "running") {
      throw new Error("A running task must be paused or stopped before deletion.");
    }

    this.#tasks = this.#tasks.filter(({ id }) => id !== task.id);
    return deepClone(task);
  }

  /**
   * Archives a non-running task while retaining its previous state for restoration.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object} The archived task.
   */
  archiveTask(taskId) {
    const task = this.#findTask(taskId);

    if (task.status === "running") {
      throw new Error("A running task cannot be archived.");
    }

    if (task.status === "archived") {
      return deepClone(task);
    }

    task.archivedStatus = task.status;
    task.status = "archived";
    this.#touch(task);
    return deepClone(task);
  }

  /**
   * Restores a previously archived task to its prior state.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object} The restored task.
   */
  restoreTask(taskId) {
    const task = this.#findTask(taskId);

    if (task.status !== "archived") {
      throw new Error("Only archived tasks can be restored.");
    }

    task.status = TASK_STATUSES.includes(task.archivedStatus) && task.archivedStatus !== "archived"
      ? task.archivedStatus
      : "idle";
    delete task.archivedStatus;
    this.#touch(task);
    return deepClone(task);
  }

  /**
   * Completes a task and closes any active focus interval.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object} The completed task.
   */
  completeTask(taskId) {
    const task = this.#findTask(taskId);

    if (task.status === "archived") {
      throw new Error("An archived task cannot be completed.");
    }

    if (task.status === "completed") {
      return deepClone(task);
    }

    if (task.status === "running") {
      this.#closeActiveSession(task);
    }

    task.status = "completed";
    task.finishedAt = toIsoString(this.#timestamp());
    this.#touch(task);
    return deepClone(task);
  }

  /**
   * Starts an idle task and creates a focus interval.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object} The running task.
   */
  startTask(taskId) {
    const task = this.#findTask(taskId);
    this.#assertNoOtherRunningTask(task.id);

    if (task.status !== "idle") {
      throw new Error(`Only idle tasks can be started. Current status: ${task.status}.`);
    }

    this.#beginSession(task);
    task.status = "running";
    task.startedAt ??= toIsoString(this.#timestamp());
    task.finishedAt = null;
    this.#touch(task);
    return deepClone(task);
  }

  /**
   * Pauses a running task and records the completed focus interval.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object} The paused task.
   */
  pauseTask(taskId) {
    const task = this.#findTask(taskId);

    if (task.status !== "running") {
      throw new Error("Only a running task can be paused.");
    }

    this.#closeActiveSession(task);
    task.status = "paused";
    this.#touch(task);
    return deepClone(task);
  }

  /**
   * Resumes a paused task with a new focus interval.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object} The resumed task.
   */
  resumeTask(taskId) {
    const task = this.#findTask(taskId);
    this.#assertNoOtherRunningTask(task.id);

    if (task.status !== "paused") {
      throw new Error("Only a paused task can be resumed.");
    }

    this.#beginSession(task);
    task.status = "running";
    this.#touch(task);
    return deepClone(task);
  }

  /**
   * Stops a task without completing it.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object} The stopped task.
   */
  stopTask(taskId) {
    const task = this.#findTask(taskId);

    if (task.status !== "running" && task.status !== "paused") {
      throw new Error("Only running or paused tasks can be stopped.");
    }

    if (task.status === "running") {
      this.#closeActiveSession(task);
    }

    task.status = "idle";
    this.#touch(task);
    return deepClone(task);
  }

  /**
   * Returns one task without exposing internal mutable state.
   *
   * @param {string} taskId - Task identifier.
   * @returns {object|null} A task snapshot or null.
   */
  getTask(taskId) {
    const id = assertNonEmptyString(taskId, "Task id");
    const task = this.#tasks.find((candidate) => candidate.id === id);
    return task ? deepClone(task) : null;
  }

  /**
   * Returns tasks, optionally omitting archived records.
   *
   * @param {{ includeArchived?: boolean }} [options] - Query options.
   * @returns {Array<object>} Task snapshots.
   */
  getAllTasks({ includeArchived = true } = {}) {
    if (typeof includeArchived !== "boolean") {
      throw new TypeError("includeArchived must be a boolean.");
    }

    const tasks = includeArchived ? this.#tasks : this.#tasks.filter(({ status }) => status !== "archived");
    return deepClone(tasks);
  }

  /**
   * @returns {object|null} The one running task, if present.
   */
  getRunningTask() {
    const task = this.#tasks.find(({ status }) => status === "running");
    return task ? deepClone(task) : null;
  }

  /**
   * Updates user-editable task properties only.
   *
   * @param {string} taskId - Task identifier.
   * @param {Partial<object>} changes - Editable property changes.
   * @returns {object} The updated task.
   */
  updateTask(taskId, changes) {
    const task = this.#findTask(taskId);

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new TypeError("Task changes must be an object.");
    }

    for (const field of Object.keys(changes)) {
      if (!EDITABLE_FIELDS.includes(field)) {
        throw new Error(`${field} cannot be updated directly.`);
      }
    }

    if (Object.hasOwn(changes, "title")) {
      task.title = assertNonEmptyString(changes.title, "Task title");
    }

    if (Object.hasOwn(changes, "category")) {
      task.category = assertNonEmptyString(changes.category, "Task category");
    }

    if (Object.hasOwn(changes, "priority")) {
      task.priority = assertOneOf(changes.priority, TASK_PRIORITIES, "Task priority");
    }

    if (Object.hasOwn(changes, "estimatedDuration")) {
      task.estimatedDuration = normalizeOptionalDuration(changes.estimatedDuration);
    }

    if (Object.hasOwn(changes, "notes")) {
      task.notes = normalizeOptionalText(changes.notes);
    }

    if (Object.hasOwn(changes, "focusScore")) {
      task.focusScore = normalizeFocusScore(changes.focusScore);
    }

    this.#touch(task);
    return deepClone(task);
  }

  #findTask(taskId) {
    const task = this.getTask(taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}.`);
    }

    return this.#tasks.find(({ id }) => id === task.id);
  }

  #timestamp() {
    return assertFiniteNumber(this.#clock(), "Task clock value", { minimum: 0 });
  }

  #touch(task) {
    task.updatedAt = toIsoString(this.#timestamp());
  }

  #beginSession(task) {
    const startedAt = toIsoString(this.#timestamp());
    task.sessions.push({
      id: assertNonEmptyString(this.#idFactory(), "Session id"),
      startedAt,
      endedAt: null,
      duration: 0,
    });
  }

  #closeActiveSession(task) {
    const session = [...task.sessions].reverse().find(({ endedAt }) => endedAt === null);

    if (!session) {
      throw new Error("Running task has no active session to close.");
    }

    const endedAt = this.#timestamp();
    const startedAt = new Date(session.startedAt).getTime();
    const duration = Math.max(0, endedAt - startedAt);
    session.endedAt = toIsoString(endedAt);
    session.duration = duration;
    task.totalElapsedTime += duration;
  }

  #assertNoOtherRunningTask(taskId) {
    const runningTask = this.#tasks.find(({ status, id }) => status === "running" && id !== taskId);

    if (runningTask) {
      throw new Error(`Task "${runningTask.title}" is already running.`);
    }
  }

  #assertRunningTaskInvariant() {
    const runningTasks = this.#tasks.filter(({ status }) => status === "running");

    if (runningTasks.length > 1) {
      throw new Error("Initial task data contains more than one running task.");
    }
  }
}

function normalizeOptionalDuration(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return assertFiniteNumber(value, "Estimated duration", { minimum: 0 });
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new TypeError("Notes must be a string.");
  }

  return value.trim();
}

function normalizeFocusScore(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const score = assertFiniteNumber(value, "Focus score", { minimum: 1, integer: true });

  if (score > 5) {
    throw new RangeError("Focus score must be at most 5.");
  }

  return score;
}

function validateInitialTasks(tasks) {
  const taskIds = new Set();

  tasks.forEach((task, taskIndex) => {
    const name = `Initial task at index ${taskIndex}`;

    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw new TypeError(`${name} must be an object.`);
    }

    const taskId = assertNonEmptyString(task.id, `${name} id`);

    if (taskIds.has(taskId)) {
      throw new Error(`Initial task data contains duplicate task id: ${taskId}.`);
    }

    taskIds.add(taskId);
    assertNonEmptyString(task.title, `${name} title`);
    assertNonEmptyString(task.category, `${name} category`);
    assertOneOf(task.priority, TASK_PRIORITIES, `${name} priority`);
    assertOneOf(task.status, TASK_STATUSES, `${name} status`);
    assertFiniteNumber(task.totalElapsedTime, `${name} total elapsed time`, { minimum: 0 });
    assertValidDate(task.createdAt, `${name} creation time`);
    assertValidDate(task.updatedAt, `${name} update time`);

    if (task.startedAt !== null) {
      assertValidDate(task.startedAt, `${name} start time`);
    }

    if (task.finishedAt !== null) {
      assertValidDate(task.finishedAt, `${name} finish time`);
    }

    if (typeof task.notes !== "string") {
      throw new TypeError(`${name} notes must be a string.`);
    }

    normalizeFocusScore(task.focusScore);

    if (task.estimatedDuration !== null) {
      assertFiniteNumber(task.estimatedDuration, `${name} estimated duration`, { minimum: 0 });
    }

    if (task.status === "archived") {
      assertOneOf(task.archivedStatus, TASK_STATUSES.filter((status) => status !== "archived"), `${name} archived status`);
    }

    if (!Array.isArray(task.sessions)) {
      throw new TypeError(`${name} sessions must be an array.`);
    }

    const sessionIds = new Set();
    let activeSessionCount = 0;

    task.sessions.forEach((session, sessionIndex) => {
      const sessionName = `${name} session at index ${sessionIndex}`;

      if (!session || typeof session !== "object" || Array.isArray(session)) {
        throw new TypeError(`${sessionName} must be an object.`);
      }

      const sessionId = assertNonEmptyString(session.id, `${sessionName} id`);

      if (sessionIds.has(sessionId)) {
        throw new Error(`${name} contains duplicate session id: ${sessionId}.`);
      }

      sessionIds.add(sessionId);
      assertValidDate(session.startedAt, `${sessionName} start time`);
      assertFiniteNumber(session.duration, `${sessionName} duration`, { minimum: 0 });

      if (session.endedAt === null) {
        activeSessionCount += 1;
      } else {
        const startedAt = assertValidDate(session.startedAt, `${sessionName} start time`);
        const endedAt = assertValidDate(session.endedAt, `${sessionName} end time`);

        if (endedAt < startedAt) {
          throw new RangeError(`${sessionName} cannot end before it starts.`);
        }
      }
    });

    const expectedActiveSessions = task.status === "running" ? 1 : 0;

    if (activeSessionCount !== expectedActiveSessions) {
      throw new Error(`${name} has an invalid active session count for status ${task.status}.`);
    }
  });
}

function assertValidDate(value, name) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${name} must be a valid date.`);
  }

  return timestamp;
}

function toIsoString(timestamp) {
  return new Date(timestamp).toISOString();
}
