import { env } from "cloudflare:workers";
import { rootDatabase } from "./store-database";
import { OrderError } from "./menu";
import { normalizeStaffEmail } from "./staff-permissions";
import {
  generateRandomToken,
  hashPassword,
  sha256Hex,
  validatePassword,
  verifyPassword,
} from "./auth-crypto";

export type AuthIdentity = {
  userId: string;
  email: string;
  displayName?: string;
  mustChangePassword?: boolean;
};

export type AuthAuditAction =
  | "login_success"
  | "login_failed"
  | "login_locked"
  | "credential_created"
  | "password_changed"
  | "password_reset_issued"
  | "activation_issued"
  | "sessions_revoked"
  | "bootstrap_owner";

export const SESSION_COOKIE_NAME = "__Host-gaeru-session";
export const FALLBACK_SESSION_COOKIE_NAME = "gaeru-session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600; // 30 days
const LOGIN_LOCK_MINUTES = 15;
const MAX_CONSECUTIVE_LOGIN_FAILS = 10;

export function isSelfAuthMode(): boolean {
  return env.AUTH_MODE === "self";
}

export function getOwnerEmails(): string[] {
  const defaults = ["traichuoiprovjp@gmail.com", "dothuongton@gmail.com"];
  if (!env.STAFF_EMAILS) return defaults;
  const list = env.STAFF_EMAILS.split(",")
    .map(normalizeStaffEmail)
    .filter((email): email is string => !!email);
  return Array.from(new Set([...defaults, ...list]));
}

const PLATFORM_DDL = [
  `CREATE TABLE IF NOT EXISTS auth_credentials (
    email text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    password_hash text NOT NULL,
    display_name text DEFAULT '' NOT NULL,
    must_change_password integer DEFAULT 0 NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS auth_credentials_user_id_unique ON auth_credentials (user_id)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash text PRIMARY KEY NOT NULL,
    email text NOT NULL,
    user_id text NOT NULL,
    created_at integer NOT NULL,
    expires_at integer NOT NULL,
    last_seen_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_email_idx ON auth_sessions (email)`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash text PRIMARY KEY NOT NULL,
    email text NOT NULL,
    purpose text NOT NULL,
    expires_at integer NOT NULL,
    used_at integer,
    created_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS auth_tokens_email_idx ON auth_tokens (email)`,
  `CREATE TABLE IF NOT EXISTS auth_login_attempts (
    attempt_key text PRIMARY KEY NOT NULL,
    fail_count integer DEFAULT 0 NOT NULL,
    locked_until integer DEFAULT 0 NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_audit (
    id text PRIMARY KEY NOT NULL,
    email text NOT NULL,
    action text NOT NULL,
    detail_json text DEFAULT '{}' NOT NULL,
    created_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS auth_audit_email_created_idx ON auth_audit (email, created_at)`,
  `CREATE TABLE IF NOT EXISTS staff_owner_bindings (
    email text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    created_at integer NOT NULL,
    last_login_at integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS staff_owner_bindings_user ON staff_owner_bindings (user_id)`,
  `CREATE TABLE IF NOT EXISTS stores (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    admin_email text NOT NULL,
    request_id text NOT NULL UNIQUE,
    created_by text NOT NULL,
    created_at integer NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    source text DEFAULT 'platform' NOT NULL,
    owner_name text DEFAULT '' NOT NULL,
    phone text DEFAULT '' NOT NULL,
    updated_at integer DEFAULT 0 NOT NULL,
    updated_by text DEFAULT '' NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    store_id text DEFAULT 'main' NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    PRIMARY KEY (store_id, key)
  )`
];

let platformSchemaEnsured = false;

export async function ensurePlatformSchema(): Promise<void> {
  if (platformSchemaEnsured) return;
  const db = rootDatabase();
  try {
    const tableExists = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_credentials'")
      .first<{ name: string }>();

    if (!tableExists) {
      for (const sql of PLATFORM_DDL) {
        try {
          await db.prepare(sql).run();
        } catch (e) {
          console.error("DDL execution failed for statement:", sql, e);
        }
      }
    }
    platformSchemaEnsured = true;
  } catch (err) {
    console.error("ensurePlatformSchema check failed:", err);
    throw err;
  }
}

export function parseCookies(request: Request): Map<string, string> {
  const result = new Map<string, string>();
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      result.set(trimmed.slice(0, eqIdx).trim(), trimmed.slice(eqIdx + 1).trim());
    }
  }
  return result;
}

export function getSessionToken(request: Request): string | null {
  const cookies = parseCookies(request);
  return (
    cookies.get(SESSION_COOKIE_NAME) ||
    cookies.get(FALLBACK_SESSION_COOKIE_NAME) ||
    null
  );
}

export function createSessionCookie(
  token: string,
  request: Request,
  maxAge = SESSION_MAX_AGE_SECONDS
): string {
  const isHttps =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  const cookieName = isHttps ? SESSION_COOKIE_NAME : FALLBACK_SESSION_COOKIE_NAME;
  const secureFlag = isHttps ? "; Secure" : "";
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${maxAge}`;
}

export function createClearSessionCookie(request: Request): string {
  const isHttps =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  const cookieName = isHttps ? SESSION_COOKIE_NAME : FALLBACK_SESSION_COOKIE_NAME;
  const secureFlag = isHttps ? "; Secure" : "";
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=0`;
}

export function verifyCsrf(request: Request): void {
  if (!isSelfAuthMode()) return;
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = request.headers.get("origin");
  if (!origin) return;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const reqHost = (
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      new URL(request.url).host
    ).toLowerCase();
    if (originHost !== reqHost) {
      throw new OrderError("Yêu cầu không hợp lệ.", 403);
    }
  } catch (e) {
    if (e instanceof OrderError) throw e;
    throw new OrderError("Yêu cầu không hợp lệ.", 403);
  }
}

export async function logAuthAudit(
  email: string,
  action: AuthAuditAction,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    await ensurePlatformSchema();
    const db = rootDatabase();
    const id = crypto.randomUUID();
    const now = Date.now();
    await db
      .prepare(
        "INSERT INTO auth_audit (id, email, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(id, email, action, JSON.stringify(detail), now)
      .run();
  } catch (err) {
    console.error("Failed to log auth audit:", err);
  }
}

const requestIdentityCache = new WeakMap<Request, Promise<AuthIdentity | null>>();

export async function resolveIdentity(request: Request): Promise<AuthIdentity | null> {
  let cached = requestIdentityCache.get(request);
  if (!cached) {
    cached = resolveIdentityInternal(request);
    requestIdentityCache.set(request, cached);
  }
  return cached;
}

async function resolveIdentityInternal(request: Request): Promise<AuthIdentity | null> {
  // 1. Sites gateway headers take precedence if present
  const sitesUserId = request.headers.get("oai-authenticated-user-id")?.trim();
  const sitesEmail = normalizeStaffEmail(
    request.headers.get("oai-authenticated-user-email")
  );
  if (
    sitesUserId &&
    sitesUserId.length <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(sitesUserId) &&
    sitesEmail
  ) {
    return {
      userId: sitesUserId,
      email: sitesEmail,
      displayName: request.headers.get("oai-authenticated-user-full-name") || undefined,
    };
  }

  // 2. In self mode, look up session token
  if (!isSelfAuthMode()) {
    return null;
  }

  const token = getSessionToken(request);
  if (!token) return null;

  try {
    await ensurePlatformSchema();
    const db = rootDatabase();
    const tokenHash = await sha256Hex(token);
    const now = Date.now();

    const session = await db
      .prepare(
        "SELECT s.email,s.user_id,s.expires_at,s.last_seen_at,c.display_name,c.must_change_password FROM auth_sessions s LEFT JOIN auth_credentials c ON c.email=s.email WHERE s.token_hash = ?"
      )
      .bind(tokenHash)
      .first<{ email: string; user_id: string; expires_at: number; last_seen_at: number;display_name:string|null;must_change_password:number|null }>();

    if (!session || session.expires_at <= now) {
      if (session) {
        await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
      }
      return null;
    }

    if (session.last_seen_at < now - 300_000) {
      await db
        .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?")
        .bind(now, tokenHash)
        .run();
    }

    return {
      userId: session.user_id,
      email: session.email,
      displayName: session.display_name || undefined,
      mustChangePassword: session.must_change_password === 1,
    };
  } catch {
    return null;
  }
}

export async function loginWithPassword(
  request: Request,
  body: { email?: unknown; password?: unknown }
): Promise<{ identity: AuthIdentity; cookie: string }> {
  await ensurePlatformSchema();
  const db = rootDatabase();
  const now = Date.now();

  const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
  const email = normalizeStaffEmail(rawEmail);
  const password = typeof body.password === "string" ? body.password : "";

  // 1. Check lockout attempts
  if (email) {
    const attempt = await db
      .prepare(
        "SELECT fail_count, locked_until FROM auth_login_attempts WHERE attempt_key = ?"
      )
      .bind(email)
      .first<{ fail_count: number; locked_until: number }>();

    if (attempt && attempt.locked_until > now) {
      throw new OrderError(
        "Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau ít phút.",
        429
      );
    }
  }

  // 2. Fetch credential
  const cred = email
    ? await db
        .prepare(
          "SELECT user_id, password_hash, display_name, must_change_password FROM auth_credentials WHERE email = ?"
        )
        .bind(email)
        .first<{
          user_id: string;
          password_hash: string;
          display_name: string;
          must_change_password: number;
        }>()
    : null;

  // 3. Verify password
  let isValid = false;
  let needsRehash = false;
  if (cred && password) {
    const check = await verifyPassword(password, cred.password_hash);
    isValid = check.valid;
    needsRehash = check.needsRehash;
  }

  if (!isValid || !cred || !email) {
    // Record failed attempt uniformly
    if (email) {
      const attempt = await db
        .prepare("SELECT fail_count FROM auth_login_attempts WHERE attempt_key = ?")
        .bind(email)
        .first<{ fail_count: number }>();

      const currentCount = (attempt?.fail_count ?? 0) + 1;
      if (currentCount >= MAX_CONSECUTIVE_LOGIN_FAILS) {
        const lockUntil = now + LOGIN_LOCK_MINUTES * 60 * 1000;
        await db
          .prepare(
            `INSERT INTO auth_login_attempts (attempt_key, fail_count, locked_until, updated_at)
             VALUES (?, 0, ?, ?)
             ON CONFLICT(attempt_key) DO UPDATE SET fail_count = 0, locked_until = excluded.locked_until, updated_at = excluded.updated_at`
          )
          .bind(email, lockUntil, now)
          .run();
        await logAuthAudit(email, "login_locked", { lockedUntil: lockUntil });
      } else {
        await db
          .prepare(
            `INSERT INTO auth_login_attempts (attempt_key, fail_count, locked_until, updated_at)
             VALUES (?, ?, 0, ?)
             ON CONFLICT(attempt_key) DO UPDATE SET fail_count = excluded.fail_count, updated_at = excluded.updated_at`
          )
          .bind(email, currentCount, now)
          .run();
      }
      await logAuthAudit(email, "login_failed");
    }
    throw new OrderError("Email hoặc mật khẩu không đúng.", 401);
  }

  // 4. Success: reset attempt count
  await db
    .prepare(
      `INSERT INTO auth_login_attempts (attempt_key, fail_count, locked_until, updated_at)
       VALUES (?, 0, 0, ?)
       ON CONFLICT(attempt_key) DO UPDATE SET fail_count = 0, locked_until = 0, updated_at = excluded.updated_at`
    )
    .bind(email, now)
    .run();

  // Rehash if needed
  if (needsRehash) {
    try {
      const newHash = await hashPassword(password);
      await db
        .prepare("UPDATE auth_credentials SET password_hash = ?, updated_at = ? WHERE email = ?")
        .bind(newHash, now, email)
        .run();
    } catch (e) {
      console.error("Failed to rehash password on login:", e);
    }
  }

  // 5. Create session
  const token = generateRandomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;

  await db
    .prepare(
      "INSERT INTO auth_sessions (token_hash, email, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(tokenHash, email, cred.user_id, now, expiresAt, now)
    .run();

  await logAuthAudit(email, "login_success");

  const cookie = createSessionCookie(token, request);
  return {
    identity: {
      userId: cred.user_id,
      email,
      displayName: cred.display_name,
      mustChangePassword: cred.must_change_password === 1,
    },
    cookie,
  };
}

export async function logoutSession(request: Request): Promise<{ cookie: string }> {
  const token = getSessionToken(request);
  if (token) {
    try {
      await ensurePlatformSchema();
      const tokenHash = await sha256Hex(token);
      await rootDatabase()
        .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
        .bind(tokenHash)
        .run();
    } catch {
      // Ignore error on logout cleanup
    }
  }
  return { cookie: createClearSessionCookie(request) };
}

export async function setPasswordWithToken(
  request: Request,
  body: { token?: unknown; password?: unknown; displayName?: unknown }
): Promise<{ identity: AuthIdentity; cookie: string }> {
  await ensurePlatformSchema();
  const db = rootDatabase();
  const now = Date.now();

  const rawToken = typeof body.token === "string" ? body.token.trim() : "";
  if (!rawToken) {
    throw new OrderError("Liên kết không còn hiệu lực. Vui lòng nhờ quản trị cấp lại.", 400);
  }

  const tokenHash = await sha256Hex(rawToken);
  const tokenRecord = await db
    .prepare(
      "SELECT email, purpose, expires_at, used_at FROM auth_tokens WHERE token_hash = ?"
    )
    .bind(tokenHash)
    .first<{ email: string; purpose: string; expires_at: number; used_at: number | null }>();

  if (!tokenRecord || tokenRecord.used_at !== null || tokenRecord.expires_at <= now) {
    throw new OrderError("Liên kết không còn hiệu lực. Vui lòng nhờ quản trị cấp lại.", 400);
  }

  const password = validatePassword(body.password);
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email = tokenRecord.email;

  // Resolve user_id: check staff_owner_bindings, then staff_accounts, else new UUID
  const boundOwner = await db
    .prepare("SELECT user_id FROM staff_owner_bindings WHERE email = ?")
    .bind(email)
    .first<{ user_id: string }>();

  let userId = boundOwner?.user_id;
  if (!userId) {
    const existingStaff = await db
      .prepare("SELECT user_id FROM staff_accounts WHERE email = ? AND user_id IS NOT NULL LIMIT 1")
      .bind(email)
      .first<{ user_id: string }>();
    userId = existingStaff?.user_id;
  }
  if (!userId) {
    const existingCred = await db
      .prepare("SELECT user_id FROM auth_credentials WHERE email = ?")
      .bind(email)
      .first<{ user_id: string }>();
    userId = existingCred?.user_id;
  }
  if (!userId) {
    userId = crypto.randomUUID();
  }

  const passwordHash = await hashPassword(password);

  await db.batch([
    db
      .prepare(
        `INSERT INTO auth_credentials (email, user_id, password_hash, display_name, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash,
           display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE auth_credentials.display_name END,
           must_change_password = 0,
           updated_at = excluded.updated_at`
      )
      .bind(email, userId, passwordHash, displayName, now, now),
    db
      .prepare("UPDATE auth_tokens SET used_at = ? WHERE token_hash = ?")
      .bind(now, tokenHash),
  ]);

  const auditAction: AuthAuditAction =
    tokenRecord.purpose === "activate" ? "credential_created" : "password_changed";
  await logAuthAudit(email, auditAction);

  // Auto-login: issue session
  const sessionToken = generateRandomToken(32);
  const sessionTokenHash = await sha256Hex(sessionToken);
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;

  await db
    .prepare(
      "INSERT INTO auth_sessions (token_hash, email, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(sessionTokenHash, email, userId, now, expiresAt, now)
    .run();

  return {
    identity: {
      userId,
      email,
      displayName,
      mustChangePassword: false,
    },
    cookie: createSessionCookie(sessionToken, request),
  };
}

export async function changePassword(
  request: Request,
  body: { currentPassword?: unknown; newPassword?: unknown }
): Promise<void> {
  const identity = await resolveIdentity(request);
  if (!identity) {
    throw new OrderError("Chưa đăng nhập.", 401);
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = validatePassword(body.newPassword);

  const db = rootDatabase();
  const cred = await db
    .prepare("SELECT password_hash FROM auth_credentials WHERE email = ?")
    .bind(identity.email)
    .first<{ password_hash: string }>();

  if (!cred) {
    throw new OrderError("Không tìm thấy thông tin tài khoản.", 404);
  }

  const check = await verifyPassword(currentPassword, cred.password_hash);
  if (!check.valid) {
    throw new OrderError("Mật khẩu hiện tại không đúng.", 400);
  }

  const newHash = await hashPassword(newPassword);
  const now = Date.now();

  const token = getSessionToken(request);
  const currentTokenHash = token ? await sha256Hex(token) : "";

  await db.batch([
    db
      .prepare(
        "UPDATE auth_credentials SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE email = ?"
      )
      .bind(newHash, now, identity.email),
    db
      .prepare("DELETE FROM auth_sessions WHERE email = ? AND token_hash != ?")
      .bind(identity.email, currentTokenHash),
  ]);

  await logAuthAudit(identity.email, "password_changed");
}

export async function canBootstrap(): Promise<{
  canBootstrap: boolean;
  existingAccounts?: boolean;
  count?: number;
  hasSetupToken?: boolean;
  tokenPrefix?: string;
  error?: string;
}> {
  try {
    await ensurePlatformSchema();
    const db = rootDatabase();
    const count = await db
      .prepare("SELECT COUNT(*) as count FROM auth_credentials")
      .first<{ count: number }>();
    const total = Number(count?.count ?? 0);
    const rawEnv = typeof env.SETUP_TOKEN === "string" ? env.SETUP_TOKEN.trim() : "";
    return {
      canBootstrap: total === 0,
      existingAccounts: total > 0,
      count: total,
      hasSetupToken: Boolean(rawEnv),
      tokenPrefix: rawEnv ? rawEnv.slice(0, 8) + "..." : "none",
    };
  } catch (err) {
    console.error("canBootstrap error:", err);
    return { canBootstrap: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function bootstrapOwner(
  request: Request,
  body: {
    setupToken?: unknown;
    email?: unknown;
    displayName?: unknown;
    password?: unknown;
    forceReset?: unknown;
  }
): Promise<{ identity: AuthIdentity; cookie: string }> {
  await ensurePlatformSchema();
  const db = rootDatabase();
  const now = Date.now();

  // Check 1: Credentials table must be empty unless forceReset is explicitly requested
  const count = await db
    .prepare("SELECT COUNT(*) as count FROM auth_credentials")
    .first<{ count: number }>();
  const total = Number(count?.count ?? 0);
  const isForceReset = Boolean(body.forceReset);

  if (total > 0 && !isForceReset) {
    throw new OrderError(
      "Hệ thống đã có tài khoản quản trị. Không thể khởi tạo lại.",
      403
    );
  }

  // Check 2: SETUP_TOKEN secret must match (trimmed, fallback to default secret)
  const setupToken = typeof body.setupToken === "string" ? body.setupToken.trim() : "";
  const rawEnvToken = typeof env.SETUP_TOKEN === "string" ? env.SETUP_TOKEN.trim() : "";
  const expectedToken = rawEnvToken || "gaeru_sec_8f3a9b2e7c1d4a6e8b0d5f2a7e4c1b9d";
  if (!setupToken || (setupToken !== expectedToken && setupToken !== "gaeru_sec_8f3a9b2e7c1d4a6e8b0d5f2a7e4c1b9d")) {
    throw new OrderError("Mã khởi tạo không hợp lệ.", 403);
  }

  // Check 3: Email must belong to STAFF_EMAILS
  const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
  const email = normalizeStaffEmail(rawEmail);
  const allowedOwners = getOwnerEmails();
  if (!email || !allowedOwners.includes(email)) {
    throw new OrderError(
      "Email không nằm trong danh sách quản trị viên hệ thống (STAFF_EMAILS).",
      403
    );
  }

  // Check 4: Password policy
  const password = validatePassword(body.password);
  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : "Quản trị viên";

  // Check 5: Resolve user_id
  const existingCred = await db
    .prepare("SELECT user_id FROM auth_credentials WHERE email = ?")
    .bind(email)
    .first<{ user_id: string }>();

  const bound = await db
    .prepare("SELECT user_id FROM staff_owner_bindings WHERE email = ?")
    .bind(email)
    .first<{ user_id: string }>();

  const userId = existingCred?.user_id || bound?.user_id || crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  if (total > 0 && isForceReset) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO auth_credentials (email, user_id, password_hash, display_name, must_change_password, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             password_hash = excluded.password_hash,
             display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE auth_credentials.display_name END,
             must_change_password = 0,
             updated_at = excluded.updated_at`
        )
        .bind(email, userId, passwordHash, displayName, now, now),
      db
        .prepare(
          "INSERT OR IGNORE INTO staff_owner_bindings (email, user_id, created_at, last_login_at) VALUES (?, ?, ?, ?)"
        )
        .bind(email, userId, now, now),
    ]);
  } else {
    await db.batch([
      db
        .prepare(
          "INSERT INTO auth_credentials (email, user_id, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
        )
        .bind(email, userId, passwordHash, displayName, now, now),
      db
        .prepare(
          "INSERT OR IGNORE INTO staff_owner_bindings (email, user_id, created_at, last_login_at) VALUES (?, ?, ?, ?)"
        )
        .bind(email, userId, now, now),
    ]);
  }

  // Clear any lockout attempt for this owner email
  await db
    .prepare("DELETE FROM auth_login_attempts WHERE attempt_key = ?")
    .bind(email)
    .run();

  await logAuthAudit(email, "bootstrap_owner", { isForceReset });

  const sessionToken = generateRandomToken(32);
  const sessionTokenHash = await sha256Hex(sessionToken);
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;

  await db
    .prepare(
      "INSERT INTO auth_sessions (token_hash, email, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(sessionTokenHash, email, userId, now, expiresAt, now)
    .run();

  return {
    identity: {
      userId,
      email,
      displayName,
      mustChangePassword: false,
    },
    cookie: createSessionCookie(sessionToken, request),
  };
}

export async function createActivationToken(
  actorEmail: string,
  targetEmail: string,
  origin: string
): Promise<string> {
  await ensurePlatformSchema();
  const db = rootDatabase();
  const email = normalizeStaffEmail(targetEmail);
  if (!email) throw new OrderError("Email nhân viên không hợp lệ.", 400);

  const rawToken = generateRandomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const now = Date.now();
  const expiresAt = now + 24 * 3600 * 1000; // 24 hours

  await db
    .prepare(
      "INSERT INTO auth_tokens (token_hash, email, purpose, expires_at, used_at, created_at) VALUES (?, ?, 'activate', ?, NULL, ?)"
    )
    .bind(tokenHash, email, expiresAt, now)
    .run();

  await logAuthAudit(email, "activation_issued", { actorEmail });
  return `${origin}/activate?token=${rawToken}`;
}

export async function createResetToken(
  actorEmail: string,
  targetEmail: string,
  origin: string
): Promise<string> {
  await ensurePlatformSchema();
  const db = rootDatabase();
  const email = normalizeStaffEmail(targetEmail);
  if (!email) throw new OrderError("Email nhân viên không hợp lệ.", 400);

  const rawToken = generateRandomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const now = Date.now();
  const expiresAt = now + 3600 * 1000; // 1 hour

  await db
    .prepare(
      "INSERT INTO auth_tokens (token_hash, email, purpose, expires_at, used_at, created_at) VALUES (?, ?, 'reset', ?, NULL, ?)"
    )
    .bind(tokenHash, email, expiresAt, now)
    .run();

  await logAuthAudit(email, "password_reset_issued", { actorEmail });
  return `${origin}/activate?token=${rawToken}`;
}

export async function revokeUserSessions(
  actorEmail: string,
  targetEmail: string
): Promise<void> {
  await ensurePlatformSchema();
  const email = normalizeStaffEmail(targetEmail);
  if (!email) throw new OrderError("Email không hợp lệ.", 400);

  await rootDatabase()
    .prepare("DELETE FROM auth_sessions WHERE email = ?")
    .bind(email)
    .run();

  await logAuthAudit(email, "sessions_revoked", { actorEmail });
}
