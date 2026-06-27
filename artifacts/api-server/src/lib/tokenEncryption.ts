import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (raw.length === 64) return Buffer.from(raw, "hex");
  if (!raw && process.env.NODE_ENV === "production") {
    console.warn("[tokenEncryption] TOKEN_ENCRYPTION_KEY not set — using insecure default. Set this env var immediately.");
  }
  return createHash("sha256").update(raw || "areafada-default-dev-encryption-key").digest();
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptToken(encryptedStr: string): string {
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) <= new Date(Date.now() + 60_000);
}
