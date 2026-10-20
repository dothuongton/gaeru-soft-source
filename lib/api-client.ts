import {withStore} from "./store-links";
export class ApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly uncertain: boolean) {
    super(message);
    this.name = "ApiError";
  }
}

/** A lost response does not prove a write failed. Callers can safely retain its request ID. */
export async function api<T = {ok: boolean}>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(withStore("/api/" + path), {...options, credentials: "same-origin", signal: controller.signal, headers});
    let data: T & {error?: string};
    try {data = await response.json();}
    catch {throw new ApiError("Chưa đọc được phản hồi của quán. Vui lòng kiểm tra lại kết quả.", response.status, true);}
    if (!response.ok) throw new ApiError(data?.error || "Chưa thực hiện được. Vui lòng thử lại.", response.status, response.status >= 500 || response.status === 408);
    if (!data || typeof data !== "object") throw new ApiError("Phản hồi của quán chưa đầy đủ. Vui lòng kiểm tra lại kết quả.", response.status, true);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ApiError("Kết nối chậm, chưa nhận được kết quả từ quán.", null, true);
    throw new ApiError("Kết nối đang gián đoạn, chưa nhận được kết quả từ quán.", null, true);
  } finally {clearTimeout(timer);}
}
