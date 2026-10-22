import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import { runWithWorkerContext } from "../lib/worker-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const LOCAL_COOKIE_NAME = "__sites_local_auth";

function safeReturnUrl(value: string | null, defaultUrl: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return defaultUrl;
  try {
    const url = new URL(value, "https://local.test");
    if (url.origin !== "https://local.test") return defaultUrl;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return defaultUrl;
  }
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }

    const url = new URL(request.url);

    // 1. Handle standalone sign-in and sign-out endpoints for Cloudflare Workers
    if (url.pathname === "/signin-with-chatgpt") {
      const returnTo = safeReturnUrl(url.searchParams.get("return_to"), "/?view=admin");
      const targetUrl = new URL(returnTo, url.origin);
      const isHttps = url.protocol === "https:";
      const headers = new Headers();
      headers.set("Location", targetUrl.toString());
      headers.set("Cache-Control", "private, no-store");
      headers.set(
        "Set-Cookie",
        `${LOCAL_COOKIE_NAME}=1; Path=/; HttpOnly; SameSite=Lax${isHttps ? "; Secure" : ""}; Max-Age=2592000`
      );
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/signout-with-chatgpt") {
      const returnTo = safeReturnUrl(url.searchParams.get("return_to"), "/");
      const targetUrl = new URL(returnTo, url.origin);
      const isHttps = url.protocol === "https:";
      const headers = new Headers();
      headers.set("Location", targetUrl.toString());
      headers.set("Cache-Control", "private, no-store");
      headers.set(
        "Set-Cookie",
        `${LOCAL_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${isHttps ? "; Secure" : ""}; Max-Age=0`
      );
      return new Response(null, { status: 302, headers });
    }

    // 2. Resolve request headers for staff authentication on Cloudflare Workers
    const cookies = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim());
    const hasAuthCookie = cookies.some((c) => c === `${LOCAL_COOKIE_NAME}=1` || c.startsWith(`${LOCAL_COOKIE_NAME}=1;`));
    const cfAccessEmail = request.headers.get("cf-access-authenticated-user-email");
    const cfAccessId = request.headers.get("cf-access-authenticated-user-id");

    let effectiveRequest = request;
    if (hasAuthCookie || cfAccessEmail) {
      const ownerEmail =
        cfAccessEmail ||
        (env.STAFF_EMAILS ? env.STAFF_EMAILS.split(",")[0]?.trim() : null) ||
        "dothuongton@gmail.com";
      const ownerId = cfAccessId || `owner_${ownerEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;

      const newHeaders = new Headers(request.headers);
      newHeaders.set("oai-authenticated-user-id", ownerId);
      newHeaders.set("oai-authenticated-user-email", ownerEmail);
      newHeaders.set("oai-authenticated-user-full-name", "Quản lý / Chủ cửa hàng");
      newHeaders.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");

      effectiveRequest = new Request(request, { headers: newHeaders });
    }

    return runWithConnectorBinding(binding, () =>
      runWithWorkerContext(ctx, () => handler.fetch(effectiveRequest, env, ctx))
    );
  },
};
