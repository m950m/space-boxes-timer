/** Account panel wiring: optional account, connection, sync, data controls.
 *
 * Local-first behavior is untouched: the panel is additive and the planner
 * keeps working signed-out. Connection is an explicit user action.
 */

import { Connection } from "./connected/connection.js";

const $ = (id) => document.getElementById(id);

export function mountAccountPanel({ planningStore }) {
  const elements = {
    panel: $("account-panel"),
    signedOut: $("account-signed-out"),
    signedIn: $("account-signed-in"),
    email: $("account-email"),
    password: $("account-password"),
    register: $("account-register"),
    login: $("account-login"),
    signOut: $("account-signout"),
    connect: $("account-connect"),
    sync: $("account-sync"),
    export: $("account-export"),
    delete: $("account-delete"),
    deletePassword: $("account-delete-password"),
    identity: $("account-identity"),
    connectionState: $("account-connection-state"),
    syncStatus: $("account-sync-status"),
    formError: $("account-error"),
  };
  if (!elements.panel) return null;
  const connection = new Connection({ onStatus: renderStatus });
  let latestSnapshot = null;
  let storePromise = planningStore;

  function renderStatus(state, detail) {
    const label = {
      connected: "Connected", syncing: "Synchronizing…", "sync-error": "Sync problem",
    }[state] ?? state;
    elements.connectionState.textContent = label;
    elements.syncStatus.textContent = detail ?? "";
  }

  function render() {
    const signedIn = Boolean(connection.account);
    elements.signedOut.hidden = signedIn;
    elements.signedIn.hidden = !signedIn;
    elements.connect.hidden = connection.connected;
    elements.sync.hidden = !connection.connected;
    elements.export.hidden = !connection.connected;
    elements.delete.hidden = !connection.connected;
    elements.deletePassword.hidden = !connection.connected;
    if (signedIn) {
      elements.identity.textContent = connection.account.email;
      if (connection.connected) {
        renderStatus("connected",
          `Last sync ${new Date(connection.ack.lastSyncAt).toLocaleTimeString()}`);
      } else {
        renderStatus("signed-in",
          "Sign-in active. Connect this browser's local history to sync it.");
      }
    } else {
      elements.connectionState.textContent = "Signed out";
      elements.syncStatus.textContent = "Local use needs no account.";
    }
    elements.email.value = "";
    elements.password.value = "";
  }

  function fail(error) {
    elements.formError.textContent = error?.message ?? String(error);
  }

  async function currentFocus() {
    try {
      const store = await storePromise;
      return await store.loadFocus();
    } catch {
      return null;
    }
  }

  elements.register.addEventListener("click", async () => {
    elements.formError.textContent = "";
    try {
      await connection.register(elements.email.value.trim(), elements.password.value);
      render();
    } catch (error) { fail(error); }
  });

  elements.login.addEventListener("click", async () => {
    elements.formError.textContent = "";
    try {
      await connection.login(elements.email.value.trim(), elements.password.value);
      render();
    } catch (error) { fail(error); }
  });

  elements.signOut.addEventListener("click", async () => {
    elements.formError.textContent = "";
    try {
      await connection.logout();
      render();
    } catch (error) { fail(error); }
  });

  elements.connect.addEventListener("click", async () => {
    elements.formError.textContent = "";
    try {
      await connection.connect({ snapshot: latestSnapshot, focusState: await currentFocus() });
      render();
    } catch (error) { fail(error); }
  });

  elements.sync.addEventListener("click", async () => {
    elements.formError.textContent = "";
    try {
      await connection.syncNow({
        store: await storePromise,
        snapshot: latestSnapshot, focusState: await currentFocus(),
      });
      render();
    } catch (error) { fail(error); }
  });

  elements.delete.addEventListener("click", async () => {
    elements.formError.textContent = "";
    const password = elements.deletePassword.value;
    if (!password) {
      fail({ message: "Confirm with your password to delete the account." });
      return;
    }
    // Explicit user intent, password-confirmed server-side.
    if (!window.confirm("Delete this account and its saved history? This cannot be undone.")) return;
    try {
      await connection.deleteAccount(password);
      elements.deletePassword.value = "";
      render();
    } catch (error) { fail(error); }
  });

  /** Refresh the planning projection the panel operates on. */
  function update(snapshot) {
    latestSnapshot = snapshot;
  }

  connection.init().then(render).catch(render);
  render();
  return { connection, update, render };
}
