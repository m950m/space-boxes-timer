import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Same-origin API bridge. The Django service remains the sole authority.
      // Do not accept arbitrary proxy destinations or cross-site writes.
      const inbound = new URL(request.url);
      const isApi = inbound.pathname.startsWith("/api/v2/");
      if (isApi) {
        const origin = request.headers.get("origin");
        if (origin && origin !== inbound.origin) return new Response("Forbidden", { status: 403 });
        if (!["GET", "POST"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
        const target = new URL(inbound.pathname + inbound.search,
          "https://space-boxes-bdd48.containers.snapdeploy.app");
        const headers = new Headers();
        for (const key of ["cookie", "content-type", "accept", "x-csrftoken"]) {
          const value = request.headers.get(key);
          if (value) headers.set(key, value);
        }
        headers.set("origin", target.origin);
        const response = await fetch(target, {
          method: request.method,
          headers,
          body: request.method === "GET" ? undefined : await request.arrayBuffer(),
          redirect: "manual",
        });
        const outputHeaders = new Headers();
        for (const key of ["content-type", "cache-control", "content-disposition", "x-frame-options"]) {
          const value = response.headers.get(key);
          if (value) outputHeaders.set(key, value);
        }
        for (const cookie of response.headers.getSetCookie()) outputHeaders.append("set-cookie", cookie);
        outputHeaders.set("cache-control", "no-store");
        return new Response(response.body, { status: response.status, headers: outputHeaders });
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
