// Coordinates application startup and top-level behavior.

import { prepareDeleteConfirmation, prepareResetConfirmation, prepareSummaryModal } from "./modal.js";
import { StatisticsEngine } from "./statistics.js";
import { StorageService } from "./storage.js";
import { TaskManager } from "./tasks.js";
import { TimerEngine } from "./timer.js";
import { createUI } from "./ui.js";

const DEFAULT_SETTINGS = Object.freeze({
  theme: "space",
  soundEffects: false,
  notifications: false,
});

const TIMER_UPDATE_INTERVAL = 1_000;

class ExpectedApplicationError extends Error {}

class SpaceBoxesApplication {
  #activeTaskId = null;
  #currentSummaryTaskId = null;
  #settings = { ...DEFAULT_SETTINGS };
  #statistics = {};
  #statisticsEngine;
  #storage;
  #taskManager;
  #timer;
  #timerIntervalId = null;
  #ui;

  constructor() {
    this.#storage = new StorageService();
    this.#statisticsEngine = new StatisticsEngine();
    this.#timer = new TimerEngine();
    this.#ui = createUI();
  }

  initialize() {
    this.#restoreState();
    this.#registerEventListeners();
    this.#ui.renderCurrentDate();
    this.#ui.renderSettings(this.#settings);
    this.#refreshStatistics({ persist: true });

    if (this.#activeTaskId) {
      this.#startTimerUpdates();
    }
  }

  #restoreState() {
    const tasks = this.#storage.loadTasks();
    this.#settings = normalizeSettings(this.#storage.loadSettings());
    this.#statistics = this.#storage.loadStatistics();

    try {
      this.#taskManager = new TaskManager(tasks);
    } catch (error) {
      console.error("Unable to restore saved tasks.", error);
      this.#taskManager = new TaskManager();
      this.#ui.showError("Saved tasks could not be restored. The application started with an empty task list.");
    }

    const runningTask = this.#taskManager.getRunningTask();

    if (runningTask) {
      this.#activeTaskId = runningTask.id;
      this.#timer.start(getCurrentTaskElapsedTime(runningTask));
    }
  }

  #registerEventListeners() {
    this.#ui.bindHandlers({
      onCreateTask: (input) => this.#runAction(() => this.#createTask(input)),
      onFinishActive: () => this.#runAction(() => this.#finishTask(this.#requireActiveTaskId())),
      onPauseActive: () => this.#runAction(() => this.#pauseTask(this.#requireActiveTaskId())),
      onReset: () => this.#runAction(() => this.#resetApplication()),
      onResumeActive: () => this.#runAction(() => this.#resumeTask(this.#requireActiveTaskId())),
      onSettingsChange: (settings) => this.#runAction(() => this.#updateSettings(settings)),
      onSummaryClose: (feedback) => this.#runAction(() => this.#saveSummaryFeedback(feedback)),
      onTaskAction: (action, taskId) => this.#runAction(() => this.#handleTaskAction(action, taskId)),
    });
  }

  #handleTaskAction(action, taskId) {
    const actions = {
      archive: () => this.#archiveTask(taskId),
      delete: () => this.#deleteTask(taskId),
      finish: () => this.#finishTask(taskId),
      pause: () => this.#pauseTask(taskId),
      restore: () => this.#restoreTask(taskId),
      resume: () => this.#resumeTask(taskId),
      start: () => this.#startTask(taskId),
    };

    if (!actions[action]) {
      throw new Error(`Unknown task action: ${action}.`);
    }

    actions[action]();
  }

  #createTask(input) {
    const taskInput = validateTaskInput(input);
    this.#taskManager.createTask(taskInput);
    this.#saveTasks();
    this.#renderAll();
    this.#ui.resetTaskForm();
  }

  #startTask(taskId) {
    if (this.#activeTaskId && this.#activeTaskId !== taskId) {
      throw new ExpectedApplicationError("Finish the active session before starting another task.");
    }

    const task = this.#requireTask(taskId);
    this.#timer.reset();
    this.#timer.start(task.totalElapsedTime);

    try {
      this.#taskManager.startTask(taskId);
    } catch (error) {
      this.#timer.reset();
      throw error;
    }

    this.#activeTaskId = taskId;
    this.#commitTaskState();
    this.#startTimerUpdates();
  }

  #pauseTask(taskId) {
    this.#assertActiveTask(taskId);
    this.#timer.pause();
    this.#taskManager.pauseTask(taskId);
    this.#stopTimerUpdates();
    this.#commitTaskState({ refreshStatistics: true });
  }

  #resumeTask(taskId) {
    if (this.#activeTaskId && this.#activeTaskId !== taskId) {
      throw new ExpectedApplicationError("Finish the active session before resuming another task.");
    }

    const task = this.#requireTask(taskId);
    this.#timer.reset();
    this.#timer.start(task.totalElapsedTime);

    try {
      this.#taskManager.resumeTask(taskId);
    } catch (error) {
      this.#timer.reset();
      throw error;
    }

    this.#activeTaskId = taskId;
    this.#commitTaskState();
    this.#startTimerUpdates();
  }

  #finishTask(taskId) {
    const task = this.#requireTask(taskId);

    if (task.status !== "running" && task.status !== "paused") {
      throw new ExpectedApplicationError("Only a running or paused task can be finished.");
    }

    if (this.#activeTaskId === taskId && this.#timer.getState().status !== "idle") {
      this.#timer.stop();
    }

    const completedTask = this.#taskManager.completeTask(taskId);
    this.#stopTimerUpdates();
    this.#activeTaskId = null;
    this.#timer.reset();
    this.#saveTasks();
    this.#refreshStatistics({ persist: true });
    this.#currentSummaryTaskId = completedTask.id;
    this.#ui.renderSummary(prepareSummaryModal(completedTask));
  }

  #deleteTask(taskId) {
    const task = this.#requireTask(taskId);
    const confirmation = prepareDeleteConfirmation(task);

    if (!this.#ui.confirmAction(confirmation)) {
      return;
    }

    this.#taskManager.deleteTask(taskId);
    this.#clearActiveTaskIfMatching(taskId);
    this.#saveTasks();
    this.#refreshStatistics({ persist: true });
  }

  #archiveTask(taskId) {
    this.#taskManager.archiveTask(taskId);
    this.#clearActiveTaskIfMatching(taskId);
    this.#saveTasks();
    this.#refreshStatistics({ persist: true });
  }

  #restoreTask(taskId) {
    this.#taskManager.restoreTask(taskId);
    this.#commitTaskState({ refreshStatistics: true });
  }

  #saveSummaryFeedback(feedback) {
    if (!this.#currentSummaryTaskId) {
      return;
    }

    this.#taskManager.updateTask(this.#currentSummaryTaskId, {
      focusScore: feedback.focusScore,
      notes: feedback.notes,
    });
    this.#currentSummaryTaskId = null;
    this.#saveTasks();
    this.#refreshStatistics({ persist: true });
  }

  #updateSettings(settings) {
    this.#settings = normalizeSettings(settings);
    this.#saveSettings();
    this.#ui.renderSettings(this.#settings);
  }

  #resetApplication() {
    if (!this.#ui.confirmAction(prepareResetConfirmation())) {
      return;
    }

    this.#storage.clearAll();
    this.#stopTimerUpdates();
    this.#taskManager = new TaskManager();
    this.#timer.reset();
    this.#activeTaskId = null;
    this.#currentSummaryTaskId = null;
    this.#settings = { ...DEFAULT_SETTINGS };
    this.#statistics = this.#statisticsEngine.calculate([]);
    this.#ui.renderSettings(this.#settings);
    this.#ui.closeSettings();
    this.#renderAll();
  }

  #commitTaskState({ refreshStatistics = false } = {}) {
    this.#saveTasks();

    if (refreshStatistics) {
      this.#refreshStatistics({ persist: true });
    } else {
      this.#renderAll();
    }
  }

  #refreshStatistics({ persist = false } = {}) {
    this.#statistics = this.#statisticsEngine.calculate(this.#taskManager.getAllTasks());

    if (persist) {
      this.#saveStatistics();
    }

    this.#renderAll();
  }

  #renderAll() {
    const tasks = this.#taskManager.getAllTasks();
    const activeTask = this.#activeTaskId ? this.#taskManager.getTask(this.#activeTaskId) : null;
    const timerState = activeTask ? this.#timer.getState() : { status: "idle", elapsedTime: 0 };

    this.#ui.renderTasks(tasks, this.#activeTaskId);
    this.#ui.renderActiveSession(activeTask, timerState);
    this.#ui.renderStatistics(this.#statistics);
  }

  #startTimerUpdates() {
    this.#stopTimerUpdates();
    this.#updateTimerDisplay();
    this.#timerIntervalId = globalThis.setInterval(
      () => this.#runAction(() => this.#updateTimerDisplay()),
      TIMER_UPDATE_INTERVAL,
    );
  }

  #stopTimerUpdates() {
    if (this.#timerIntervalId !== null) {
      globalThis.clearInterval(this.#timerIntervalId);
      this.#timerIntervalId = null;
    }
  }

  #updateTimerDisplay() {
    if (!this.#activeTaskId || this.#timer.getState().status !== "running") {
      return;
    }

    this.#ui.updateTimerDisplay(this.#timer.getElapsedTime(), this.#activeTaskId);
  }

  #clearActiveTaskIfMatching(taskId) {
    if (this.#activeTaskId !== taskId) {
      return;
    }

    this.#stopTimerUpdates();
    this.#timer.reset();
    this.#activeTaskId = null;
  }

  #assertActiveTask(taskId) {
    if (this.#activeTaskId !== taskId) {
      throw new ExpectedApplicationError("The selected task is not the active session.");
    }
  }

  #requireActiveTaskId() {
    if (!this.#activeTaskId) {
      throw new ExpectedApplicationError("There is no active task.");
    }

    return this.#activeTaskId;
  }

  #requireTask(taskId) {
    const task = this.#taskManager.getTask(taskId);

    if (!task) {
      throw new ExpectedApplicationError("The selected task no longer exists.");
    }

    return task;
  }

  #saveTasks() {
    this.#saveSafely("tasks", () => this.#storage.saveTasks(this.#taskManager.getAllTasks()));
  }

  #saveSettings() {
    this.#saveSafely("settings", () => this.#storage.saveSettings(this.#settings));
  }

  #saveStatistics() {
    this.#saveSafely("statistics", () => this.#storage.saveStatistics(this.#statistics));
  }

  #saveSafely(dataType, save) {
    try {
      save();
    } catch (error) {
      console.error(`Unable to persist ${dataType}.`, error);
      this.#ui.showError(`Your ${dataType} changed, but could not be saved locally.`);
    }
  }

  #runAction(action) {
    try {
      action();
    } catch (error) {
      if (!(error instanceof ExpectedApplicationError)) {
        console.error("Application action failed.", error);
      }

      this.#ui.showError(error instanceof Error ? error.message : "An unexpected application error occurred.");
    }
  }
}

function validateTaskInput(input) {
  const title = input.title.trim();

  if (!title) {
    throw new ExpectedApplicationError("Enter a task title.");
  }

  let estimatedDuration = null;

  if (input.estimatedDuration.trim()) {
    const minutes = Number(input.estimatedDuration);

    if (!Number.isFinite(minutes) || minutes < 5) {
      throw new ExpectedApplicationError("Estimated duration must be at least 5 minutes.");
    }

    estimatedDuration = minutes * 60_000;
  }

  return {
    title,
    category: input.category,
    priority: input.priority,
    estimatedDuration,
  };
}

function normalizeSettings(settings) {
  return {
    theme: typeof settings?.theme === "string" ? settings.theme : DEFAULT_SETTINGS.theme,
    soundEffects: Boolean(settings?.soundEffects),
    notifications: Boolean(settings?.notifications),
  };
}

function getCurrentTaskElapsedTime(task, now = Date.now()) {
  const totalElapsedTime = Number.isFinite(task.totalElapsedTime) ? task.totalElapsedTime : 0;
  const activeSession = [...(task.sessions ?? [])].reverse().find(({ endedAt }) => endedAt === null);

  if (!activeSession) {
    return totalElapsedTime;
  }

  const startedAt = new Date(activeSession.startedAt).getTime();
  return totalElapsedTime + (Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0);
}

function initializeApplication() {
  try {
    const application = new SpaceBoxesApplication();
    application.initialize();
  } catch (error) {
    console.error("Space Boxes Timer could not start.", error);
    globalThis.alert?.("Space Boxes Timer could not start. Refresh the application and try again.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApplication, { once: true });
} else {
  initializeApplication();
}
