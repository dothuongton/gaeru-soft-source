#!/usr/bin/env node
/**
 * Utility script to generate Web Push VAPID keys using standard WebCrypto (P-256 ECDSA).
 * Outputs keys compatible with Cloudflare Workers and @block65/webcrypto-web-push.
 */
async function main() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  const publicKey = Buffer.from(publicKeyRaw).toString("base64url");
  const privateKey = privateKeyJwk.d;

  console.log("=== VAPID Keys Generated Successfully ===\n");
  console.log("Add the following environment variables to your .env.local (development)");
  console.log("or configure them as Cloudflare Worker secrets via wrangler secret put:\n");
  console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
  console.log(`VAPID_SUBJECT=mailto:admin@example.com\n`);
}

main().catch((err) => {
  console.error("Failed to generate VAPID keys:", err);
  process.exit(1);
});
