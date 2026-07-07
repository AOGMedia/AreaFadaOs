import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// tokenEncryption.ts has no DB dependency — import directly
import { encryptToken, decryptToken, isTokenExpired } from "../tokenEncryption.ts";

describe("encryptToken / decryptToken round-trip", () => {
  test("encrypts and decrypts a simple string with the dev key", () => {
    const plaintext = "my-secret-token";
    const encrypted = encryptToken(plaintext);
    assert.notEqual(encrypted, plaintext, "encrypted output must differ from plaintext");
    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, plaintext);
  });

  test("encrypted output has three colon-separated hex segments", () => {
    const encrypted = encryptToken("hello");
    const parts = encrypted.split(":");
    assert.equal(parts.length, 3, "format must be iv:authTag:ciphertext");
    for (const part of parts) {
      assert.match(part, /^[0-9a-f]+$/i, `segment '${part}' must be hex`);
    }
  });

  test("each call produces a different ciphertext (random IV)", () => {
    const a = encryptToken("same-value");
    const b = encryptToken("same-value");
    assert.notEqual(a, b, "random IV means two encryptions of the same value must differ");
    assert.equal(decryptToken(a), "same-value");
    assert.equal(decryptToken(b), "same-value");
  });

  test("round-trips correctly with an explicit 32-byte hex key in TOKEN_ENCRYPTION_KEY", () => {
    const testKey = "a".repeat(64); // 64 hex chars = 32 bytes
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    try {
      process.env.TOKEN_ENCRYPTION_KEY = testKey;
      const encrypted = encryptToken("explicit-key-test");
      const decrypted = decryptToken(encrypted);
      assert.equal(decrypted, "explicit-key-test");
    } finally {
      if (original === undefined) {
        delete process.env.TOKEN_ENCRYPTION_KEY;
      } else {
        process.env.TOKEN_ENCRYPTION_KEY = original;
      }
    }
  });

  test("decryptToken throws when tampered with (wrong key)", () => {
    const encrypted = encryptToken("sensitive-data");

    // Swap to a different key — GCM auth tag verification must fail
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    try {
      process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);
      assert.throws(
        () => decryptToken(encrypted),
        (err: any) => {
          return err instanceof Error;
        },
        "decryptToken must throw when the key does not match",
      );
    } finally {
      if (original === undefined) {
        delete process.env.TOKEN_ENCRYPTION_KEY;
      } else {
        process.env.TOKEN_ENCRYPTION_KEY = original;
      }
    }
  });

  test("decryptToken throws on a malformed (non-3-segment) token", () => {
    assert.throws(
      () => decryptToken("not-a-valid-token"),
      /Invalid encrypted token format/,
    );
  });

  test("decryptToken throws when a segment is empty", () => {
    assert.throws(() => decryptToken("::"), (err: any) => err instanceof Error);
  });
});

describe("isTokenExpired", () => {
  test("returns false when expiresAt is null", () => {
    assert.equal(isTokenExpired(null), false);
  });

  test("returns false when expiresAt is undefined", () => {
    assert.equal(isTokenExpired(undefined), false);
  });

  test("returns true when expiresAt is in the past", () => {
    const past = new Date(Date.now() - 60_000 * 10);
    assert.equal(isTokenExpired(past), true);
  });

  test("returns true when expiresAt is within the 60-second buffer", () => {
    const almostExpired = new Date(Date.now() + 30_000);
    assert.equal(isTokenExpired(almostExpired), true);
  });

  test("returns false when expiresAt is well in the future", () => {
    const future = new Date(Date.now() + 60_000 * 60);
    assert.equal(isTokenExpired(future), false);
  });
});
