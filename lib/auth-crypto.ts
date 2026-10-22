import { env } from "cloudflare:workers";
import { OrderError } from "./menu";

export const DEFAULT_PBKDF2_ITERATIONS = 100_000;

// Pre-computed PBKDF2 hash with 100,000 iterations to balance timing against non-existent accounts (P-08)
export const DUMMY_PBKDF2_HASH =
  "pbkdf2$100000$eHh4eHh4eHh4eHh4eHh4eA==$eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=";

export function getPbkdf2Iterations(): number {
  if (env.PBKDF2_ITERATIONS) {
    const val = Number(env.PBKDF2_ITERATIONS);
    if (!Number.isNaN(val) && val >= 10_000 && val <= 1_000_000) {
      return val;
    }
  }
  return DEFAULT_PBKDF2_ITERATIONS;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateRandomToken(bytesCount = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesCount));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function validatePassword(password: unknown): string {
  if (typeof password !== "string") {
    throw new OrderError("Mật khẩu phải là chuỗi ký tự.", 400);
  }
  if (password.length < 12 || password.length > 128) {
    throw new OrderError("Mật khẩu phải từ 12 đến 128 ký tự.", 400);
  }
  return password;
}

export async function hashPassword(password: string, customIterations?: number): Promise<string> {
  validatePassword(password);
  const iterations = customIterations ?? getPbkdf2Iterations();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashBytes = new Uint8Array(derivedBits);
  const saltB64 = bytesToBase64(salt);
  const hashB64 = bytesToBase64(hashBytes);

  return `pbkdf2$${iterations}$${saltB64}$${hashB64}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (typeof password !== "string" || !storedHash.startsWith("pbkdf2$")) {
    return { valid: false, needsRehash: false };
  }

  const parts = storedHash.split("$");
  if (parts.length !== 4) {
    return { valid: false, needsRehash: false };
  }

  const [, iterationsStr, saltB64, expectedHashB64] = parts;
  const iterations = Number(iterationsStr);
  if (Number.isNaN(iterations) || iterations < 1000) {
    return { valid: false, needsRehash: false };
  }

  try {
    const salt = base64ToBytes(saltB64);
    const expectedHash = base64ToBytes(expectedHashB64);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as unknown as BufferSource,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

    const actualHash = new Uint8Array(derivedBits);
    const valid = constantTimeEqual(actualHash, expectedHash);
    const currentConfiguredIterations = getPbkdf2Iterations();
    const needsRehash = valid && iterations < currentConfiguredIterations;

    return { valid, needsRehash };
  } catch {
    return { valid: false, needsRehash: false };
  }
}
