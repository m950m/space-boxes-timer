// Controls modal dialog behavior and interactions.

import { assertNonEmptyString, formatDate, formatDuration, toTimestamp } from "./utils.js";

/**
 * Creates a serializable data object for the session summary modal.
 *
 * @param {object} task - Completed task record.
 * @param {{ now?: number, locale?: string }} [options] - Formatting dependencies.
 * @returns {object} Summary modal data without presentation behavior.
 */
export function prepareSummaryModal(task, { now = Date.now(), locale = undefined } = {}) {
  if (!task || typeof task !== "object") {
    throw new TypeError("A task is required to prepare a session summary.");
  }

  const duration = resolveTaskDuration(task, now);
  const startedAt = task.startedAt ? toTimestamp(task.startedAt) : null;
  const finishedAt = task.finishedAt ? toTimestamp(task.finishedAt) : now;

  return {
    taskId: assertNonEmptyString(task.id, "Task id"),
    taskName: assertNonEmptyString(task.title, "Task title"),
    startedAt,
    finishedAt,
    startTime: startedAt ? formatDate(startedAt, { dateStyle: "medium", timeStyle: "short" }, locale) : "Not started",
    endTime: formatDate(finishedAt, { dateStyle: "medium", timeStyle: "short" }, locale),
    duration,
    durationLabel: formatDuration(duration),
    focusRating: Number.isInteger(task.focusScore) ? task.focusScore : null,
    notes: typeof task.notes === "string" ? task.notes : "",
  };
}

/**
 * Creates data for a task deletion confirmation.
 *
 * @param {object} task - Task to delete.
 * @returns {object} Delete confirmation data.
 */
export function prepareDeleteConfirmation(task) {
  if (!task || typeof task !== "object") {
    throw new TypeError("A task is required to prepare a deletion confirmation.");
  }

  const title = assertNonEmptyString(task.title, "Task title");
  return {
    kind: "delete-task",
    taskId: assertNonEmptyString(task.id, "Task id"),
    title: "Delete task?",
    message: `Delete "${title}" permanently? This cannot be undone.`,
    confirmLabel: "Delete task",
    cancelLabel: "Keep task",
  };
}

/**
 * Creates data for resetting all locally stored application data.
 *
 * @returns {object} Reset confirmation data.
 */
export function prepareResetConfirmation() {
  return {
    kind: "reset-data",
    title: "Reset all data?",
    message: "All saved tasks, sessions, settings, and statistics will be removed from this device.",
    confirmLabel: "Reset data",
    cancelLabel: "Cancel",
  };
}

function resolveTaskDuration(task, now) {
  if (Number.isFinite(task.totalElapsedTime) && task.totalElapsedTime >= 0) {
    return task.totalElapsedTime;
  }

  if (!Array.isArray(task.sessions)) {
    return 0;
  }

  return task.sessions.reduce((total, session) => {
    if (!session || typeof session !== "object") {
      return total;
    }

    if (Number.isFinite(session.duration) && session.duration >= 0) {
      return total + session.duration;
    }

    try {
      const startedAt = toTimestamp(session.startedAt);
      const endedAt = session.endedAt ? toTimestamp(session.endedAt) : now;
      return total + Math.max(0, endedAt - startedAt);
    } catch {
      return total;
    }
  }, 0);
}
