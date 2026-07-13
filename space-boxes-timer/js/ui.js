// Renders and updates the primary user interface.

import { formatDate, formatDuration } from "./utils.js";

const TASK_STATE_LABELS = {
  idle: "Ready for focus",
  running: "Focus session active",
  paused: "Session paused",
  completed: "Mission complete",
  archived: "Task archived",
};

const TASK_ACTIONS = {
  idle: ["start", "delete", "archive"],
  running: ["pause", "finish"],
  paused: ["resume", "finish"],
  completed: ["delete", "archive"],
  archived: ["restore", "delete"],
};

const ACTION_LABELS = {
  start: "Start",
  pause: "Pause",
  resume: "Resume",
  finish: "Finish",
  delete: "Delete",
  archive: "Archive",
  restore: "Restore",
};

/**
 * Creates the DOM rendering facade used by the application bootstrap.
 *
 * @param {Document} [documentRoot=document] - Document dependency for rendering and tests.
 * @returns {object} UI rendering and event-binding methods.
 */
export function createUI(documentRoot = document) {
  const elements = collectElements(documentRoot);
  const modalReturnFocus = new WeakMap();
  let handlersBound = false;

  function bindHandlers(handlers) {
    if (handlersBound) {
      return;
    }

    handlersBound = true;

    elements.taskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.onCreateTask?.(readTaskForm(elements.taskForm));
    });

    elements.taskGrid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-task-action]");

      if (!button || !elements.taskGrid.contains(button)) {
        return;
      }

      handlers.onTaskAction?.(button.dataset.taskAction, button.dataset.taskId);
    });

    elements.pauseButton.addEventListener("click", () => handlers.onPauseActive?.());
    elements.resumeButton.addEventListener("click", () => handlers.onResumeActive?.());
    elements.finishButton.addEventListener("click", () => handlers.onFinishActive?.());

    elements.settingsOpenButtons.forEach((button) => {
      button.addEventListener("click", () => openModal(elements.settingsModal, button));
    });

    elements.settingsCloseButtons.forEach((button) => {
      button.addEventListener("click", () => closeModal(elements.settingsModal));
    });

    elements.settingsSaveButton.addEventListener("click", () => {
      handlers.onSettingsChange?.(readSettings(elements));
      closeModal(elements.settingsModal);
    });

    elements.themeSelect.addEventListener("change", () => {
      handlers.onSettingsChange?.(readSettings(elements));
    });

    [elements.soundToggle, elements.notificationsToggle].forEach((toggle) => {
      toggle.addEventListener("click", () => {
        toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
        handlers.onSettingsChange?.(readSettings(elements));
      });
    });

    elements.resetButton.addEventListener("click", () => handlers.onReset?.());

    elements.ratingOptions.forEach((option) => {
      option.addEventListener("click", () => selectRating(elements.ratingOptions, Number(option.textContent)));
      option.addEventListener("keydown", (event) => handleRatingKeydown(event, elements.ratingOptions));
    });

    elements.summaryCloseButtons.forEach((button) => {
      button.addEventListener("click", () => closeSummary(handlers));
    });

    documentRoot.addEventListener("keydown", (event) => handleModalKeydown(event, handlers));
  }

  function renderTasks(tasks, activeTaskId = null) {
    const fragment = documentRoot.createDocumentFragment();

    tasks.forEach((task) => {
      fragment.append(createTaskCard(documentRoot, elements.taskTemplate, task, activeTaskId));
    });

    elements.taskGrid.replaceChildren(fragment);
    elements.taskGrid.hidden = tasks.length === 0;
    elements.emptyState.hidden = tasks.length !== 0;
  }

  function renderActiveSession(task, timerState = { status: "idle", elapsedTime: 0 }) {
    const hasTask = Boolean(task);
    const status = task?.status ?? "idle";
    const elapsedTime = hasTask ? timerState.elapsedTime : 0;

    elements.activeSession.dataset.sessionState = status;
    elements.activeTaskName.textContent = task?.title ?? "Choose a task to begin.";
    elements.energyStatus.textContent = `Energy status: ${hasTask ? status : "standby"}`;
    updateStatusBadge(hasTask ? status : null);
    updateTimerDisplay(elapsedTime, task?.id);
    updateProgress(elements.progress, task, elapsedTime);

    elements.pauseButton.hidden = status !== "running";
    elements.resumeButton.hidden = status !== "paused";
    elements.finishButton.hidden = status !== "running" && status !== "paused";
  }

  function updateTimerDisplay(elapsedTime, activeTaskId = null) {
    const duration = normalizeDuration(elapsedTime);
    const label = formatDuration(duration);
    const datetime = toDurationAttribute(duration);

    elements.activeTimer.textContent = label;
    elements.activeTimer.setAttribute("datetime", datetime);

    if (activeTaskId) {
      const cardTimer = elements.taskGrid.querySelector(`[data-task-id="${escapeSelector(activeTaskId)}"] .task-timer`);

      if (cardTimer) {
        cardTimer.textContent = label;
        cardTimer.setAttribute("datetime", datetime);
      }
    }
  }

  function updateStatusBadge(status) {
    elements.sessionStatus.classList.remove("status-badge--complete", "status-badge--paused");
    elements.sessionStatus.textContent = status ? titleCase(status) : "No active task";

    if (!status || status === "paused") {
      elements.sessionStatus.classList.add("status-badge--paused");
    } else if (status === "completed") {
      elements.sessionStatus.classList.add("status-badge--complete");
    }
  }

  function renderStatistics(statistics = {}) {
    elements.todayFocus.textContent = formatCompactDuration(statistics.todayFocusTime);
    elements.weeklyFocus.textContent = formatCompactDuration(statistics.weeklyFocusTime);
    elements.monthlyFocus.textContent = formatCompactDuration(statistics.monthlyFocusTime);
    elements.longestSession.textContent = formatMinuteDuration(statistics.longestSession);
    elements.averageSession.textContent = formatMinuteDuration(statistics.averageSession);
    elements.totalSessions.textContent = String(Number.isFinite(statistics.totalSessions) ? statistics.totalSessions : 0);
  }

  function renderSummary(summary) {
    elements.summaryTaskName.textContent = summary.taskName;
    elements.summaryDuration.textContent = summary.durationLabel;
    elements.summaryStartTime.textContent = summary.startTime;
    elements.summaryEndTime.textContent = summary.endTime;
    elements.summaryNotes.value = summary.notes;
    selectRating(elements.ratingOptions, summary.focusRating);
    openModal(elements.summaryModal);
  }

  function renderSettings(settings) {
    const themeOptionExists = [...elements.themeSelect.options].some(({ value }) => value === settings.theme);
    elements.themeSelect.value = themeOptionExists ? settings.theme : "space";
    elements.soundToggle.setAttribute("aria-pressed", String(Boolean(settings.soundEffects)));
    elements.notificationsToggle.setAttribute("aria-pressed", String(Boolean(settings.notifications)));
  }

  function renderCurrentDate(now = Date.now()) {
    elements.currentDate.dateTime = new Date(now).toISOString();
    elements.currentDate.textContent = formatDate(now, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function closeSummary(handlers) {
    handlers.onSummaryClose?.(readSummaryFeedback(elements));
    closeModal(elements.summaryModal);
  }

  function handleModalKeydown(event, handlers) {
    const openModalElement = [elements.summaryModal, elements.settingsModal].find((modal) => !modal.hidden);

    if (!openModalElement) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (openModalElement === elements.summaryModal) {
        closeSummary(handlers);
      } else {
        closeModal(openModalElement);
      }

      return;
    }

    if (event.key === "Tab") {
      keepFocusInModal(event, openModalElement);
    }
  }

  function openModal(modal, trigger = documentRoot.activeElement) {
    modalReturnFocus.set(modal, trigger);
    elements.appShell.inert = true;
    modal.hidden = false;
    modal.querySelector(".modal__dialog")?.focus();
  }

  function closeModal(modal) {
    if (modal.hidden) {
      return;
    }

    modal.hidden = true;
    elements.appShell.inert = false;
    const returnTarget = modalReturnFocus.get(modal);
    returnTarget?.focus?.();
  }

  return Object.freeze({
    bindHandlers,
    closeSettings: () => closeModal(elements.settingsModal),
    confirmAction: ({ title, message }) => globalThis.confirm?.(`${title}\n\n${message}`) ?? true,
    renderActiveSession,
    renderCurrentDate,
    renderSettings,
    renderStatistics,
    renderSummary,
    renderTasks,
    resetTaskForm: () => elements.taskForm.reset(),
    showError: (message) => globalThis.alert?.(message),
    updateStatusBadge,
    updateTimerDisplay,
  });
}

function collectElements(documentRoot) {
  const get = (selector) => {
    const element = documentRoot.querySelector(selector);

    if (!element) {
      throw new Error(`Required UI element is missing: ${selector}.`);
    }

    return element;
  };

  const settingsModal = get("#settings-modal");
  const summaryModal = get("#summary-modal");

  return {
    appShell: get(".app-shell"),
    activeSession: get(".active-session"),
    activeTaskName: get("#active-task-name"),
    activeTimer: get("#active-task-timer"),
    averageSession: get("#average-session-value"),
    currentDate: get("#current-date"),
    emptyState: get("#task-empty-state"),
    energyStatus: get(".energy-core__status"),
    finishButton: get("#finish-session-button"),
    longestSession: get("#longest-session-value"),
    monthlyFocus: get("#monthly-focus-value"),
    notificationsToggle: get("#notifications-toggle"),
    pauseButton: get("#pause-session-button"),
    progress: get("#session-progress"),
    ratingOptions: [...summaryModal.querySelectorAll(".rating-option")],
    resetButton: get("#reset-data-button"),
    resumeButton: get("#resume-session-button"),
    sessionStatus: get("#session-status"),
    settingsCloseButtons: [
      get("#settings-modal .modal__backdrop"),
      get("#settings-modal .modal__header .icon-button"),
    ],
    settingsModal,
    settingsOpenButtons: [...documentRoot.querySelectorAll('[aria-controls="settings-modal"]')],
    settingsSaveButton: get("#settings-modal .modal__footer .button"),
    soundToggle: get("#sound-effects-toggle"),
    summaryCloseButtons: [
      get("#summary-modal .modal__backdrop"),
      get("#summary-modal .modal__header .icon-button"),
      get("#summary-modal .modal__footer .button"),
    ],
    summaryDuration: get("#summary-duration"),
    summaryEndTime: get("#summary-end-time"),
    summaryModal,
    summaryNotes: get("#summary-notes"),
    summaryStartTime: get("#summary-start-time"),
    summaryTaskName: get("#summary-task-name"),
    taskForm: get("#task-form"),
    taskGrid: get("#task-grid"),
    taskTemplate: get("#task-card-template"),
    themeSelect: get("#theme-select"),
    todayFocus: get("#today-focus-value"),
    totalSessions: get("#total-sessions-value"),
    weeklyFocus: get("#weekly-focus-value"),
  };
}

function createTaskCard(documentRoot, template, task, activeTaskId) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  const statusBadge = card.querySelector(".space-box__status");
  const timer = card.querySelector(".task-timer");
  const actions = documentRoot.createElement("div");

  card.dataset.taskId = task.id;
  card.dataset.taskState = task.status;
  card.classList.toggle("is-active", task.id === activeTaskId && task.status === "running");
  card.classList.toggle("is-complete", task.status === "completed");
  card.querySelector(".task-card__category").textContent = titleCase(task.category);
  card.querySelector(".task-card__title").textContent = task.title;
  card.querySelector(".task-card__description").textContent = `${titleCase(task.priority)} priority · ${formatEstimate(task.estimatedDuration)}`;
  card.querySelector(".space-box__state").textContent = TASK_STATE_LABELS[task.status] ?? titleCase(task.status);

  statusBadge.textContent = titleCase(task.status);
  statusBadge.classList.toggle("status-badge--paused", task.status === "paused" || task.status === "archived");
  statusBadge.classList.toggle("status-badge--complete", task.status === "completed");

  timer.textContent = formatDuration(normalizeDuration(task.totalElapsedTime));
  timer.setAttribute("datetime", toDurationAttribute(task.totalElapsedTime));

  actions.className = "task-actions";
  actions.setAttribute("aria-label", `Actions for ${task.title}`);

  (TASK_ACTIONS[task.status] ?? []).forEach((action) => {
    const button = documentRoot.createElement("button");
    button.className = `button ${action === "start" || action === "resume" || action === "finish" ? "button--primary" : "button--secondary"}`;
    button.type = "button";
    button.dataset.taskAction = action;
    button.dataset.taskId = task.id;
    button.textContent = ACTION_LABELS[action];
    button.setAttribute("aria-label", `${ACTION_LABELS[action]} ${task.title}`);

    if (action === "start" && activeTaskId && activeTaskId !== task.id) {
      button.disabled = true;
      button.title = "Finish the active session before starting another task.";
    }

    actions.append(button);
  });

  card.append(actions);
  return fragment;
}

function readTaskForm(form) {
  const data = new FormData(form);
  return {
    title: String(data.get("title") ?? ""),
    category: String(data.get("category") ?? ""),
    priority: String(data.get("priority") ?? ""),
    estimatedDuration: String(data.get("estimatedDuration") ?? ""),
  };
}

function readSettings(elements) {
  return {
    theme: elements.themeSelect.value,
    soundEffects: elements.soundToggle.getAttribute("aria-pressed") === "true",
    notifications: elements.notificationsToggle.getAttribute("aria-pressed") === "true",
  };
}

function readSummaryFeedback(elements) {
  const selectedRating = elements.ratingOptions.find((option) => option.getAttribute("aria-checked") === "true");
  return {
    focusScore: selectedRating ? Number(selectedRating.textContent) : null,
    notes: elements.summaryNotes.value,
  };
}

function selectRating(options, rating) {
  options.forEach((option) => {
    const isSelected = Number(option.textContent) === rating;
    option.setAttribute("aria-checked", String(isSelected));
    option.tabIndex = isSelected ? 0 : -1;
  });

  if (!Number.isInteger(rating) && options[0]) {
    options[0].tabIndex = 0;
  }
}

function handleRatingKeydown(event, options) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const currentIndex = options.indexOf(event.currentTarget);
  const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
  const nextOption = options[(currentIndex + direction + options.length) % options.length];
  selectRating(options, Number(nextOption.textContent));
  nextOption.focus();
}

function updateProgress(progress, task, elapsedTime) {
  const estimate = task?.estimatedDuration;
  const percentage = Number.isFinite(estimate) && estimate > 0
    ? Math.min(100, Math.round((elapsedTime / estimate) * 100))
    : 0;

  progress.value = percentage;
  progress.textContent = `${percentage}%`;
  progress.parentElement.setAttribute(
    "aria-label",
    estimate ? `Session progress: ${percentage}%` : "Session progress: no estimate",
  );
}

function keepFocusInModal(event, modal) {
  const focusable = [...modal.querySelectorAll(
    'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden);

  if (focusable.length === 0) {
    event.preventDefault();
    modal.querySelector(".modal__dialog")?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);

  const activeElement = modal.ownerDocument.activeElement;

  if (event.shiftKey && (activeElement === first || !modal.contains(activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function formatEstimate(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return "No estimate";
  }

  return `Estimate: ${Math.round(milliseconds / 60_000)} min`;
}

function formatCompactDuration(milliseconds) {
  const totalMinutes = Math.floor(normalizeDuration(milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatMinuteDuration(milliseconds) {
  const duration = normalizeDuration(milliseconds);

  if (duration === 0) {
    return "0m";
  }

  if (duration < 60_000) {
    return "<1m";
  }

  return `${Math.round(duration / 60_000)}m`;
}

function normalizeDuration(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function toDurationAttribute(milliseconds) {
  return `PT${Math.floor(normalizeDuration(milliseconds) / 1000)}S`;
}

function titleCase(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function escapeSelector(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
}
