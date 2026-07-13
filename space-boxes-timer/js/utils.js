// Provides shared utility functions.

/**
 * Generates a UUID suitable for identifying client-side domain records.
 *
 * @returns {string} A UUID-like identifier.
 */
export function generateUUID() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Formats a date-like value using the user's locale.
 *
 * @param {Date|string|number} value - A date-like value.
 * @param {Intl.DateTimeFormatOptions} [options] - Intl formatting options.
 * @param {string} [locale] - Locale used for formatting.
 * @returns {string} The formatted date.
 * @throws {TypeError} When the value cannot be converted to a valid date.
 */
export function formatDate(value, options = {}, locale = undefined) {
  const timestamp = toTimestamp(value);
  return new Intl.DateTimeFormat(locale, options).format(new Date(timestamp));
}

/**
 * Formats a duration in milliseconds as HH:MM:SS.
 *
 * @param {number} milliseconds - Duration in milliseconds.
 * @returns {string} A zero-padded duration string.
 */
export function formatDuration(milliseconds) {
  assertFiniteNumber(milliseconds, "Duration");

  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

/**
 * Returns a numeric timestamp for a valid date-like value.
 *
 * @param {Date|string|number} value - A date-like value.
 * @returns {number} Milliseconds since the Unix epoch.
 * @throws {TypeError} When the value is invalid.
 */
export function toTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Expected a valid date value.");
  }

  return timestamp;
}

/**
 * Clones serializable application data without retaining references.
 *
 * @template T
 * @param {T} value - Value to clone.
 * @returns {T} A deep clone of the input.
 */
export function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

/**
 * Parses JSON without allowing malformed persisted data to escape.
 *
 * @template T
 * @param {string|null|undefined} value - Serialized JSON input.
 * @param {T} fallback - Value to return when parsing fails.
 * @returns {T} Parsed data or a clone of the fallback.
 */
export function safeParseJSON(value, fallback) {
  if (typeof value !== "string") {
    return deepClone(fallback);
  }

  try {
    return JSON.parse(value);
  } catch {
    return deepClone(fallback);
  }
}

/**
 * Ensures a value is a non-empty string.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Field name used in an error message.
 * @returns {string} A trimmed string.
 * @throws {TypeError} When validation fails.
 */
export function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

/**
 * Ensures a value is a finite number.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Field name used in an error message.
 * @param {{ minimum?: number, integer?: boolean }} [options] - Numeric constraints.
 * @returns {number} The validated number.
 * @throws {TypeError|RangeError} When validation fails.
 */
export function assertFiniteNumber(value, name, options = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }

  if (options.integer && !Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer.`);
  }

  if (options.minimum !== undefined && value < options.minimum) {
    throw new RangeError(`${name} must be at least ${options.minimum}.`);
  }

  return value;
}

/**
 * Ensures a value belongs to an allowed list.
 *
 * @template T
 * @param {T} value - Value to validate.
 * @param {readonly T[]} allowedValues - Accepted values.
 * @param {string} name - Field name used in an error message.
 * @returns {T} The validated value.
 * @throws {RangeError} When validation fails.
 */
export function assertOneOf(value, allowedValues, name) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${name} must be one of: ${allowedValues.join(", ")}.`);
  }

  return value;
}

/**
 * Delays invocation until calls have stopped for the provided interval.
 *
 * @template {(...args: any[]) => any} T
 * @param {T} callback - Callback to debounce.
 * @param {number} delay - Delay in milliseconds.
 * @returns {T & { cancel: () => void }} The debounced callback.
 */
export function debounce(callback, delay) {
  if (typeof callback !== "function") {
    throw new TypeError("Debounce callback must be a function.");
  }

  assertFiniteNumber(delay, "Debounce delay", { minimum: 0 });
  let timeoutId;

  const debounced = function debouncedCallback(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback.apply(this, args), delay);
  };

  debounced.cancel = () => clearTimeout(timeoutId);
  return debounced;
}

/**
 * Limits invocation to once per interval while retaining the latest arguments.
 *
 * @template {(...args: any[]) => any} T
 * @param {T} callback - Callback to throttle.
 * @param {number} interval - Interval in milliseconds.
 * @returns {T & { cancel: () => void }} The throttled callback.
 */
export function throttle(callback, interval) {
  if (typeof callback !== "function") {
    throw new TypeError("Throttle callback must be a function.");
  }

  assertFiniteNumber(interval, "Throttle interval", { minimum: 0 });
  let lastInvocation = 0;
  let timeoutId;
  let pendingArgs;
  let pendingContext;

  const invoke = () => {
    lastInvocation = Date.now();
    timeoutId = undefined;
    callback.apply(pendingContext, pendingArgs);
    pendingArgs = undefined;
    pendingContext = undefined;
  };

  const throttled = function throttledCallback(...args) {
    pendingArgs = args;
    pendingContext = this;
    const remaining = interval - (Date.now() - lastInvocation);

    if (remaining <= 0 || remaining > interval) {
      clearTimeout(timeoutId);
      invoke();
      return;
    }

    if (!timeoutId) {
      timeoutId = setTimeout(invoke, remaining);
    }
  };

  throttled.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = undefined;
    pendingArgs = undefined;
    pendingContext = undefined;
  };

  return throttled;
}
