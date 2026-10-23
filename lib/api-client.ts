import {withStore} from "./store-links";
export class ApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly uncertain: boolean, public readonly retryAfterMs: number | null = null) {
    super(message);
    this.name = "ApiError";
  }
}

const snapshots=new Map<string,{etag:string;data:unknown}>();
let snapshotEpoch=0;

/** A lost response does not prove a write failed. Callers can safely retain its request ID. */
export async function api<T = {ok: boolean}>(path: string, options: RequestInit = {}, storeId?: string): Promise<T> {
  const read=(options.method||"GET").toUpperCase()==="GET";
  if(!read){snapshots.clear();snapshotEpoch++;}
  const epoch=snapshotEpoch,url=withStore("/api/"+path,storeId);
  const conditional=read&&(path.split("?")[0]==="menu"||path.split("?")[0]==="admin");
  const previous=conditional?snapshots.get(url):undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if(previous)headers.set("If-None-Match",previous.etag);
    const response = await fetch(url, {...options, credentials: "same-origin", signal: controller.signal, headers});
    if(response.status===304&&previous)return structuredClone(previous.data) as T;
    if(!response.ok){snapshots.clear();snapshotEpoch++;}
    let retryAfterMs: number | null = null;
    const retryHeader = response.headers.get("Retry-After");
    if (retryHeader) {
      const sec = parseInt(retryHeader, 10);
      if (!Number.isNaN(sec) && sec > 0) {
        retryAfterMs = sec * 1000;
      } else {
        const parsedDate = Date.parse(retryHeader);
        if (!Number.isNaN(parsedDate)) {
          const diff = parsedDate - Date.now();
          if (diff > 0) retryAfterMs = diff;
        }
      }
    }
    let data: (T & {error?: string}) | null = null;
    try {
      data = await response.json();
    } catch {
      if (!response.ok) {
        throw new ApiError(
          response.status === 429 ? "Hệ thống đang bận. Vui lòng thử lại sau." : "Chưa đọc được phản hồi của quán. Vui lòng kiểm tra lại kết quả.",
          response.status,
          response.status >= 500 || response.status === 408,
          retryAfterMs
        );
      }
      throw new ApiError("Chưa đọc được phản hồi của quán. Vui lòng kiểm tra lại kết quả.", response.status, true, retryAfterMs);
    }
    if (!response.ok) throw new ApiError(data?.error || "Chưa thực hiện được. Vui lòng thử lại.", response.status, response.status >= 500 || response.status === 408, retryAfterMs);
    if (!data || typeof data !== "object") throw new ApiError("Phản hồi của quán chưa đầy đủ. Vui lòng kiểm tra lại kết quả.", response.status, true, retryAfterMs);
    const etag=response.headers.get("ETag");
    if(conditional&&etag&&epoch===snapshotEpoch){if(snapshots.size>=8)snapshots.delete(snapshots.keys().next().value!);snapshots.set(url,{etag,data:structuredClone(data)});}
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ApiError("Kết nối chậm, chưa nhận được kết quả từ quán.", null, true);
    throw new ApiError("Kết nối đang gián đoạn, chưa nhận được kết quả từ quán.", null, true);
  } finally {clearTimeout(timer);}
}
