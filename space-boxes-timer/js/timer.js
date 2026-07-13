// Manages timer state and time-related operations.

import { assertFiniteNumber, assertOneOf, formatDuration } from "./utils.js";

const TIMER_STATES = ["idle", "running", "paused", "stopped"];

/**
 * Tracks elapsed time with a monotonic clock and no rendering concerns.
 */
export class TimerEngine {
  #clock;
  #state = "idle";
  #elapsedTime = 0;
  #startedAt = null;

  /**
   * @param {{ clock?: () => number }} [options] - Clock dependency for deterministic tests.
   */
  constructor({ clock = defaultClock } = {}) {
    if (typeof clock !== "function") {
      throw new TypeError("Timer clock must be a function.");
    }

    this.#clock = clock;
  }

  /**
   * Starts the timer, optionally carrying previously recorded elapsed time.
   *
   * @param {number} [elapsedTime=0] - Existing elapsed milliseconds.
   * @returns {object} Current timer state.
   */
  start(elapsedTime = 0) {
    if (this.#state === "running" || this.#state === "paused") {
      throw new Error("A timer that has already started must be stopped or reset before starting again.");
    }

    assertFiniteNumber(elapsedTime, "Elapsed time", { minimum: 0 });
    this.#elapsedTime = elapsedTime;
    this.#startedAt = this.#now();
    this.#state = "running";
    return this.getState();
  }

  /**
   * Pauses the currently running timer.
   *
   * @returns {object} Current timer state.
   */
  pause() {
    this.#assertState("running", "pause");
    this.#elapsedTime = this.getElapsedTime();
    this.#startedAt = null;
    this.#state = "paused";
    return this.getState();
  }

  /**
   * Resumes a paused timer.
   *
   * @returns {object} Current timer state.
   */
  resume() {
    this.#assertState("paused", "resume");
    this.#startedAt = this.#now();
    this.#state = "running";
    return this.getState();
  }

  /**
   * Stops the timer while retaining the final elapsed value.
   *
   * @returns {object} Current timer state.
   */
  stop() {
    if (this.#state === "idle") {
      throw new Error("An idle timer cannot be stopped.");
    }

    if (this.#state === "running") {
      this.#elapsedTime = this.getElapsedTime();
    }

    this.#startedAt = null;
    this.#state = "stopped";
    return this.getState();
  }

  /**
   * Clears all timer state.
   *
   * @returns {object} Current timer state.
   */
  reset() {
    this.#elapsedTime = 0;
    this.#startedAt = null;
    this.#state = "idle";
    return this.getState();
  }

  /**
   * @returns {number} Elapsed milliseconds, including the active interval when running.
   */
  getElapsedTime() {
    if (this.#state !== "running" || this.#startedAt === null) {
      return this.#elapsedTime;
    }

    return this.#elapsedTime + Math.max(0, this.#now() - this.#startedAt);
  }

  /**
   * @returns {string} Elapsed time formatted as HH:MM:SS.
   */
  getFormattedTime() {
    return formatDuration(this.getElapsedTime());
  }

  /**
   * @returns {{ status: string, elapsedTime: number, startedAt: number|null }} A timer snapshot.
   */
  getState() {
    return {
      status: this.#state,
      elapsedTime: this.getElapsedTime(),
      startedAt: this.#startedAt,
    };
  }

  #now() {
    const timestamp = this.#clock();
    return assertFiniteNumber(timestamp, "Timer clock value", { minimum: 0 });
  }

  #assertState(expectedState, action) {
    assertOneOf(expectedState, TIMER_STATES, "Expected timer state");

    if (this.#state !== expectedState) {
      throw new Error(`Cannot ${action} a timer while it is ${this.#state}.`);
    }
  }
}

function defaultClock() {
  return globalThis.performance?.now?.() ?? Date.now();
}
