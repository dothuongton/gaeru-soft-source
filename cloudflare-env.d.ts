declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    STAFF_EMAILS?: string;
    AUTH_MODE?: string;
    SETUP_TOKEN?: string;
    PBKDF2_ITERATIONS?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
  }
}
