/** JSON API client for the connected backend (ADR-004 session model).
 *
 * Sessions live in the spaceboxes_session HttpOnly cookie; mutating requests
 * carry the CSRF token issued by /api/v2/csrf. Django rotates that token on
 * login/logout, so a stale token is detected and refreshed once before
 * giving up. Errors surface as { code, message, status } — never as
 * invented success.
 */

let csrfToken = null;
export class ApiError extends Error {
  constructor(message, code = "network", status = 0) {
    super(message); this.name = "ApiError"; this.code = code; this.status = status;
  }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function transport(path, init = {}) {
  const attempts = (init.method ?? "GET") === "GET" ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try { response = await fetch(path, {...init, cache: "no-store", signal: AbortSignal.timeout(15000)}); }
    catch {
      if (attempt + 1 === attempts) throw new ApiError("Connection failed. Changes are unconfirmed. Refresh saved state before retrying.");
    }
    if (response && ![502, 503, 504].includes(response.status)) return response;
    if (attempt + 1 === attempts) throw new ApiError("The server is waking or unavailable. Changes are unconfirmed; refresh before retrying.", "unavailable", response?.status ?? 0);
    await sleep(1000 * (attempt + 1));
  }
}

async function primeCsrf(force = false) {
  if (csrfToken && !force) return csrfToken;
  const response = await transport("/api/v2/csrf", { credentials: "same-origin" });
  if (!response.ok) throw new ApiError("Protected session unavailable. Try again later.", "csrf", response.status);
  csrfToken = (await response.json()).csrfToken;
  return csrfToken;
}

export function forgetCsrf() {
  csrfToken = null;
}

async function send(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRFToken"] = token;
  return transport(path, {
    method,
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function parseError(response) {
  const text = await response.text();
  try {
    const payload = text ? JSON.parse(text) : {};
    if (payload.error) return payload.error;
  } catch { /* HTML error page (e.g. CSRF rejection) */ }
  if (response.status === 403) {
    return { code: "csrf", message: "The request was rejected as unsafe. Reload the page and try again." };
  }
  return { code: "network", message: `Request failed (${response.status}).` };
}

export async function request(method, path, body) {
  let response = await send(method, path, body, method === "GET" ? null : await primeCsrf());
  if (response.status === 403 && !(response.headers.get("Content-Type") ?? "").includes("application/json")) {
    // A non-JSON 403 is the CSRF rejection page: auth transitions rotate the
    // token, so refresh once and retry. JSON 403s are real errors.
    csrfToken = null;
    response = await send(method, path, body, method === "GET" ? null : await primeCsrf(true));
  }
  if (!response.ok) {
    const error = await parseError(response);
    throw new ApiError(response.status === 429 ? "Too many requests. Wait before trying again." : error.message, error.code, response.status);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export const fetchMe = () => request("GET", "/api/v2/accounts/me");
export const register = (email, password) => request("POST", "/api/v2/accounts/register", { email, password });
export const login = (email, password) => request("POST", "/api/v2/accounts/login", { email, password });
export const logout = () => request("POST", "/api/v2/accounts/logout", {});
export const syncPush = (ops) => request("POST", "/api/v2/sync/push", { ops });
export const syncPull = (since) => request("GET", `/api/v2/sync/pull?since=${encodeURIComponent(since)}`);
export const focusState = () => request("GET", "/api/v2/focus/state");
export const focusCommand = (command) => request("POST", "/api/v2/focus/command", command);
export const deleteAccount = (password) => request("POST", "/api/v2/account/delete", { password });
