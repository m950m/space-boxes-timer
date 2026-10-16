/** Account panel wiring: optional account, connection, sync, data controls.
 *
 * Local-first behavior is untouched: the panel is additive and the planner
 * keeps working signed-out. Connection is an explicit user action.
 */

import { Connection } from "./connected/connection.js";

const $ = (id) => document.getElementById(id);

export function mountAccountPanel({ planningStore, onConnectedChange = () => {},
  onTasksMerged = () => {} } = {}) {
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
  let wasConnected = false;

  /** Focus/report views re-read their authority when connected-ness flips. */
  function notifyConnectedChange() {
    const connected = connection.connected;
    if (connected !== wasConnected) {
      wasConnected = connected;
      try { onConnectedChange(connected); } catch { /* presentation only */ }
    }
  }

  function renderStatus(state, detail) {
    const label = {
      connected: "Connected", syncing: "Synchronizing…", "sync-error": "Sync problem",
      "signed-in": "Signed in",
    }[state] ?? state;
    elements.connectionState.textContent = label;
    elements.syncStatus.textContent = detail ?? "";
  }

  function render() {
    notifyConnectedChange();
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
      const result = await connection.syncNow({
        store: await storePromise,
        snapshot: latestSnapshot, focusState: await currentFocus(),
      });
      render();
      // Downloaded tasks only reach the planner through a plan reload.
      if (result?.merge) onTasksMerged();
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

  // A live session cookie plus the durable acknowledgement restore the
  // connected state after a reload; the acknowledgement is bound to the
  // local scope it was accepted for (account switching cannot relabel it).
  connection.init()
    .then(async () => {
      if (connection.account) {
        try {
          await connection.loadAck((await planningStore).localScopeId);
        } catch { /* rendered as signed-in but not connected; sync retry can repair */ }
      }
    })
    .then(render)
    .catch(render);
  render();
  return { connection, update, render };
}
