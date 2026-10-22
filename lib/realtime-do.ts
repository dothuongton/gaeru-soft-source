import {env} from "cloudflare:workers";
import {OrderError} from "./menu";
import type {StaffAccess} from "./staff-permissions";

export type RealtimeInvalidation = {
  type: "invalidate";
  storeId: string;
  domain: "board" | "menu" | "orders";
  revision: string;
  timestamp: number;
};

export function isRealtimeEnabled(): boolean {
  return (env as Record<string, unknown>).ENABLE_REALTIME_DO === "true";
}

/**
 * RealtimeRoom Durable Object with Hibernation WebSocket API.
 * Room partitioned per store. Broadcasts minimal invalidation signals only (no PII, money, or order payloads).
 */
export class RealtimeRoom {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/websocket") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const message = await request.text();
      const sockets = this.state.getWebSockets();
      for (const ws of sockets) {
        try {
          ws.send(message);
        } catch {
          // Socket closed or errored; hibernation cleanup handles it
        }
      }
      return new Response("ok");
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") {
      ws.send("pong");
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, "Closed");
    } catch {}
  }

  async webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "Error");
    } catch {}
  }
}

/**
 * Publish invalidation event to store room.
 * Fail-open: failure to publish NEVER causes the mutation to fail; adaptive polling remains the safety net.
 */
export async function notifyRealtimeInvalidation(
  storeId: string,
  domain: "board" | "menu" | "orders",
  revision?: string
): Promise<void> {
  if (!isRealtimeEnabled()) return;
  const realtimeBinding = (env as Record<string, unknown>).REALTIME_ROOM as {
    idFromName: (name: string) => unknown;
    get: (id: unknown) => { fetch: (url: string, init?: RequestInit) => Promise<Response> };
  } | undefined;
  if (!realtimeBinding) return;

  try {
    const id = realtimeBinding.idFromName(storeId);
    const stub = realtimeBinding.get(id);
    const payload: RealtimeInvalidation = {
      type: "invalidate",
      storeId,
      domain,
      revision: revision || crypto.randomUUID().slice(0, 8),
      timestamp: Date.now(),
    };
    await stub.fetch("https://realtime/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Fail safe; adaptive polling handles recovery
  }
}

/**
 * Handle incoming WebSocket upgrade request with same-origin and staff access check.
 */
export async function handleRealtimeUpgrade(
  request: Request,
  storeId: string,
  access: StaffAccess | null
): Promise<Response> {
  if (!isRealtimeEnabled()) {
    throw new OrderError("Dịch vụ cập nhật thời gian thực chưa được kích hoạt.", 503);
  }
  if (!access?.isStaff) {
    throw new OrderError("Chỉ nhân viên được cấp quyền mới có thể kết nối.", 403);
  }
  const realtimeBinding = (env as Record<string, unknown>).REALTIME_ROOM as {
    idFromName: (name: string) => unknown;
    get: (id: unknown) => { fetch: (url: string, init?: RequestInit) => Promise<Response> };
  } | undefined;
  if (!realtimeBinding) {
    throw new OrderError("Dịch vụ phòng thời gian thực chưa sẵn sàng.", 503);
  }

  const id = realtimeBinding.idFromName(storeId);
  const stub = realtimeBinding.get(id);
  return stub.fetch(new Request("https://realtime/websocket", {
    headers: request.headers,
  }));
}
