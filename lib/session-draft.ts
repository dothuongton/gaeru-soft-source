import type {CartLine} from "./menu";

type DraftStorage = {getItem: (key: string) => string | null; key: (index: number) => string | null; readonly length: number};
export type SessionDraft = {cart: CartLine[]; note: string; requestId: string};

/** A cart belongs to the visit, so moving to another physical table keeps it. */
export const sessionDraftKey = (sessionId: string) => "moc:draft:" + sessionId;

function decode(raw: string | null): SessionDraft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const draft = value as Partial<SessionDraft>;
    if (!Array.isArray(draft.cart)) return null;
    const cart = draft.cart.filter((line): line is CartLine => !!line && typeof line.key === "string" && typeof line.itemId === "string" && Array.isArray(line.extras) && line.extras.every(extra => typeof extra === "string") && typeof line.note === "string" && typeof line.taste === "string" && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 20).slice(0, 30);
    return {cart, note: typeof draft.note === "string" ? draft.note.slice(0, 400) : "", requestId: typeof draft.requestId === "string" && /^[a-f0-9-]{36}$/i.test(draft.requestId) ? draft.requestId : ""};
  } catch {return null;}
}

/** Also restore the old token-scoped format, including after a table transfer. */
export function readSessionDraft(storage: DraftStorage | null, sessionId: string, tableToken: string): SessionDraft | null {
  if (!storage || !sessionId) return null;
  try {
    for (const key of [sessionDraftKey(sessionId), "moc:draft:" + tableToken + ":" + sessionId]) {
      const draft = decode(storage.getItem(key));
      if (draft) return draft;
    }
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("moc:draft:") && key.endsWith(":" + sessionId)) {
        const draft = decode(storage.getItem(key));
        if (draft) return draft;
      }
    }
  } catch { /* A live cart still works when storage is unavailable. */ }
  return null;
}
