// Calculates and presents task and timer statistics.

import { assertFiniteNumber, toTimestamp } from "./utils.js";

/**
 * Calculates productivity aggregates from task session records.
 *
 * @param {Array<object>} tasks - Task records containing focus sessions.
 * @param {{ now?: number }} [options] - Reference timestamp for active sessions and periods.
 * @returns {{ todayFocusTime: number, weeklyFocusTime: number, monthlyFocusTime: number, longestSession: number, averageSession: number, totalSessions: number, completedTasks: number, focusScoreAverage: number|null, currentStreak: number }} Pure statistics data.
 */
export function calculateStatistics(tasks, { now = Date.now() } = {}) {
  if (!Array.isArray(tasks)) {
    throw new TypeError("Tasks must be an array.");
  }

  assertFiniteNumber(now, "Statistics reference time", { minimum: 0 });
  const sessions = collectSessions(tasks, now);
  const totalDuration = sessions.reduce((total, session) => total + session.duration, 0);
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const focusScores = tasks
    .map(({ focusScore }) => focusScore)
    .filter((score) => Number.isInteger(score) && score >= 1 && score <= 5);

  return {
    todayFocusTime: durationWithin(sessions, dayStart, now),
    weeklyFocusTime: durationWithin(sessions, weekStart, now),
    monthlyFocusTime: durationWithin(sessions, monthStart, now),
    longestSession: sessions.reduce((longest, session) => Math.max(longest, session.duration), 0),
    averageSession: sessions.length === 0 ? 0 : Math.round(totalDuration / sessions.length),
    totalSessions: sessions.length,
    completedTasks: tasks.filter(({ status }) => status === "completed").length,
    focusScoreAverage: focusScores.length === 0
      ? null
      : Math.round((focusScores.reduce((total, score) => total + score, 0) / focusScores.length) * 100) / 100,
    currentStreak: calculateCurrentStreak(sessions, now),
  };
}

/**
 * Stateless facade for consumers that prefer an engine-oriented API.
 */
export class StatisticsEngine {
  /**
   * @param {Array<object>} tasks - Task records containing focus sessions.
   * @param {{ now?: number }} [options] - Reference timestamp for calculations.
   * @returns {object} Productivity aggregates.
   */
  calculate(tasks, options = {}) {
    return calculateStatistics(tasks, options);
  }
}

function collectSessions(tasks, now) {
  return tasks.flatMap((task) => {
    if (!Array.isArray(task?.sessions)) {
      return [];
    }

    return task.sessions.flatMap((session) => normalizeSession(session, now));
  });
}

function normalizeSession(session, now) {
  if (!session || typeof session !== "object") {
    return [];
  }

  try {
    const startedAt = toTimestamp(session.startedAt);
    const isActive = session.endedAt === null || session.endedAt === undefined;
    const endedAt = isActive ? now : toTimestamp(session.endedAt);
    const duration = isActive
      ? Math.max(0, now - startedAt)
      : Number.isFinite(session.duration)
        ? Math.max(0, session.duration)
        : Math.max(0, endedAt - startedAt);

    if (endedAt < startedAt) {
      return [];
    }

    return [{ startedAt, endedAt, duration }];
  } catch {
    return [];
  }
}

function durationWithin(sessions, rangeStart, rangeEnd) {
  return sessions.reduce((total, session) => {
    const overlapStart = Math.max(session.startedAt, rangeStart);
    const overlapEnd = Math.min(session.endedAt, rangeEnd);
    return total + Math.max(0, overlapEnd - overlapStart);
  }, 0);
}

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfWeek(timestamp) {
  const date = new Date(startOfDay(timestamp));
  const weekday = date.getDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
}

function startOfMonth(timestamp) {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function calculateCurrentStreak(sessions, now) {
  const focusedDays = new Set();

  sessions.forEach(({ startedAt, endedAt }) => {
    const cursor = new Date(startOfDay(startedAt));
    const lastDay = startOfDay(endedAt);

    while (cursor.getTime() <= lastDay) {
      focusedDays.add(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  let streak = 0;
  const cursor = new Date(startOfDay(now));

  while (focusedDays.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
