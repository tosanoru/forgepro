import "server-only";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";

/**
 * Symmetric encryption for secrets we must store (workspace BYOK API keys)
 * but never want sitting in plaintext in Postgres. Same approach as
 * Keystone's credential vault (AES-256-GCM), simplified to copy-only —
 * there's no "reveal" endpoint; a saved key can be replaced or cleared,
 * never read back. See ai-settings route for how that's enforced.
 *
 * Requires ENCRYPTION_KEY in env — any passphrase, expanded to a 256-bit
 * key via scrypt. Rotating this key invalidates every stored API key
 * (they'd need to be re-entered), so treat it like a real secret.
 */

const ALGO = "aes-256-gcm";

function deriveKey(): Buffer {
  const passphrase = process.env.ENCRYPTION_KEY;
  if (!passphrase) throw new Error("Missing ENCRYPTION_KEY environment variable.");
  // Fixed salt is acceptable here: we're deriving one static key from one
  // static passphrase, not hashing per-user passwords.
  //
  // Deliberately NOT updated to "forge-2-vault" during the app rename —
  // this string is a cryptographic constant, not a label. Changing it
  // would derive a different key and silently make every already-encrypted
  // secret in any real database (BYOK provider keys, Stripe/Paystack/
  // Flutterwave keys) undecryptable. If a genuine salt rotation is ever
  // needed, it has to be a real migration (decrypt with the old salt,
  // re-encrypt with the new one), not a find-and-replace.
  return scryptSync(passphrase, "creator-os-vault", 32);
}

export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack iv + authTag + ciphertext into one base64 string for a single DB column.
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(packed: string): string {
  const key = deriveKey();
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/** Last 4 chars only, for display — e.g. "sk-ant-••••7f2a" — never the full key. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return `••••${plaintext.slice(-4)}`;
}
