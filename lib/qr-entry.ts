import {OrderError} from "./menu";

export type QrEntry = {preview: boolean; tableToken: string | null; sessionHint: string | null};

const invalidTableMessage = "Mã bàn không hợp lệ. Vui lòng quét lại QR tại bàn hoặc gọi nhân viên.";

function validTableToken(token: string) {
 return token.length > 0 && token.length <= 80 && !/[\s\u0000-\u001f\u007f]/.test(token);
}

/** Parse the original URL before callers normalize it with URLSearchParams.set. */
export function readQrEntry(params: URLSearchParams): QrEntry {
 const tables = params.getAll("table"), sessions = params.getAll("session");
 if (tables.length > 1 || sessions.length > 1) {
  throw new OrderError("Liên kết QR chứa nhiều mã bàn hoặc lượt phục vụ. Vui lòng quét lại mã tại bàn.", 400);
 }
 if (tables.length === 0) {
  if (sessions.length !== 0) throw new OrderError("Liên kết thiếu mã bàn. Vui lòng quét lại QR tại bàn.", 400);
  return {preview: true, tableToken: null, sessionHint: null};
 }
 const tableToken = tables[0], sessionHint = sessions[0] ?? null;
 if (!validTableToken(tableToken)) throw new OrderError(invalidTableMessage, 404);
 if (sessionHint !== null && !/^[a-zA-Z0-9_-]{1,60}$/.test(sessionHint)) {
  throw new OrderError("Liên kết lượt phục vụ không hợp lệ. Vui lòng quét lại QR tại bàn.", 400);
 }
 return {preview: false, tableToken, sessionHint};
}

/** Printed QR codes and their preview links always open only the physical table. */
export function tableQrPath(tableToken: string, storeId = "main"): string {
 if (!validTableToken(tableToken)) throw new OrderError(invalidTableMessage, 404);
 return "/?table=" + encodeURIComponent(tableToken)+(storeId!=="main"?"&store="+encodeURIComponent(storeId):"");
}
