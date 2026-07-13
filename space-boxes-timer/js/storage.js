// Handles persistence and retrieval of application data.

import { deepClone, safeParseJSON } from "./utils.js";

export const STORAGE_SCHEMA_VERSION = 1;

const STORAGE_KEYS = {
  tasks: "space-boxes-timer:tasks",
  settings: "space-boxes-timer:settings",
  statistics: "space-boxes-timer:statistics",
};

/**
 * Persists versioned application records in a localStorage-compatible backend.
 */
export class StorageService {
  #storage;

  /**
   * @param {Storage|null} [storage] - Storage backend, injected for Electron adapters and tests.
   */
  constructor(storage = resolveLocalStorage()) {
    if (storage !== null && !isStorageLike(storage)) {
      throw new TypeError("Storage backend must implement getItem, setItem, and removeItem.");
    }

    this.#storage = storage;
  }

  /**
   * @param {Array<object>} tasks - Task records to persist.
   */
  saveTasks(tasks) {
    if (!Array.isArray(tasks)) {
      throw new TypeError("Tasks must be an array.");
    }

    this.#save(STORAGE_KEYS.tasks, tasks);
  }

  /**
   * @returns {Array<object>} Persisted tasks, or an empty list when unavailable or invalid.
   */
  loadTasks() {
    const tasks = this.#load(STORAGE_KEYS.tasks, []);
    return Array.isArray(tasks) ? tasks : [];
  }

  /**
   * @param {object} settings - Settings record to persist.
   */
  saveSettings(settings) {
    assertPlainRecord(settings, "Settings");
    this.#save(STORAGE_KEYS.settings, settings);
  }

  /**
   * @returns {object} Persisted settings, or an empty record when unavailable or invalid.
   */
  loadSettings() {
    const settings = this.#load(STORAGE_KEYS.settings, {});
    return isPlainRecord(settings) ? settings : {};
  }

  /**
   * @param {object} statistics - Statistics record to persist.
   */
  saveStatistics(statistics) {
    assertPlainRecord(statistics, "Statistics");
    this.#save(STORAGE_KEYS.statistics, statistics);
  }

  /**
   * @returns {object} Persisted statistics, or an empty record when unavailable or invalid.
   */
  loadStatistics() {
    const statistics = this.#load(STORAGE_KEYS.statistics, {});
    return isPlainRecord(statistics) ? statistics : {};
  }

  /**
   * Removes all application-owned storage keys without affecting unrelated data.
   */
  clearAll() {
    const storage = this.#requireStorage();

    try {
      Object.values(STORAGE_KEYS).forEach((key) => storage.removeItem(key));
    } catch (error) {
      throw new Error("Unable to clear Space Boxes Timer data.", { cause: error });
    }
  }

  #save(key, data) {
    const storage = this.#requireStorage();
    const payload = {
      version: STORAGE_SCHEMA_VERSION,
      data: deepClone(data),
    };

    try {
      storage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      throw new Error(`Unable to save data for ${key}.`, { cause: error });
    }
  }

  #load(key, fallback) {
    if (!this.#storage) {
      return deepClone(fallback);
    }

    try {
      const payload = safeParseJSON(this.#storage.getItem(key), null);

      if (!isPlainRecord(payload) || payload.version !== STORAGE_SCHEMA_VERSION || !("data" in payload)) {
        return deepClone(fallback);
      }

      return deepClone(payload.data);
    } catch {
      return deepClone(fallback);
    }
  }

  #requireStorage() {
    if (!this.#storage) {
      throw new Error("Local storage is unavailable in this environment.");
    }

    return this.#storage;
  }
}

function resolveLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isStorageLike(value) {
  return ["getItem", "setItem", "removeItem"].every((method) => typeof value[method] === "function");
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertPlainRecord(value, name) {
  if (!isPlainRecord(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}
