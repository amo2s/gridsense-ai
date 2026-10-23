import { decodeOperatorToken } from "@/utils/jwt";

/**
 * ============================================================================
 * GRIDSENSE AI ASSISTANT: ZERO-TRUST AES-GCM CRYPTOGRAPHIC ENGINE
 * ============================================================================
 * Implements client-side in-memory PBKDF2-HMAC-SHA256 key derivation and
 * authenticated AES-GCM encryption/decryption for Zustand persistent state.
 *
 * Security Invariants:
 * 1. Symmetrical keys are derived in volatile memory only and marked non-extractable.
 * 2. PBKDF2 executes 100,000 iterations to resist brute-force attacks.
 * 3. Fresh 16-byte random salt and 12-byte IV are generated per write cycle.
 * 4. Payloads are mathematically bound to the active operator's JWT identifier (sub/email).
 * 5. Tampered or mismatched session payloads immediately fail authentication tag
 *    verification and trigger automatic state eviction.
 * ============================================================================
 */

export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12;
export const PBKDF2_ITERATIONS = 100_000;
export const AES_KEY_BIT_LENGTH = 256;

/**
 * Binary-safe Base64 encoder with chunking to prevent call-stack overflow on large payloads.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Binary-safe Base64 decoder converting stored string back into a Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Safely resolves the Web Crypto API interface in browser environments.
 */
function getSubtleCrypto(): SubtleCrypto {
  const cryptoObj = typeof window !== "undefined" ? window.crypto : (globalThis as any).crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error("[StateEncryption] Native Web Crypto API (crypto.subtle) is unavailable in this environment.");
  }
  return cryptoObj.subtle;
}

/**
 * Derives a non-extractable 256-bit AES-GCM key from an operator's JWT identifier
 * and a cryptographic salt using PBKDF2 with 100,000 iterations.
 */
export async function deriveKeyFromIdentifier(
  secretIdentifier: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  if (!secretIdentifier || secretIdentifier.trim().length === 0) {
    throw new Error("[StateEncryption] Cannot derive encryption key: secret identifier is missing or empty.");
  }
  if (salt.byteLength < SALT_BYTE_LENGTH) {
    throw new Error(`[StateEncryption] Salt must be at least ${SALT_BYTE_LENGTH} bytes.`);
  }

  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const keyMaterialBytes = encoder.encode(secretIdentifier.trim());

  // 1. Import baseline secret as raw PBKDF2 key material
  const baseKey = await subtle.importKey(
    "raw",
    keyMaterialBytes,
    { name: "PBKDF2" },
    false, // Non-extractable
    ["deriveKey"]
  );

  // 2. Execute PBKDF2 derivation with 100,000 iterations and HMAC-SHA256
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    {
      name: "AES-GCM",
      length: AES_KEY_BIT_LENGTH,
    },
    false, // Non-extractable: cannot be read or exported via JavaScript
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a stringified JSON state payload using AES-GCM with a dynamically derived key.
 *
 * Buffer output structure:
 * [ 16 Bytes: Salt ] + [ 12 Bytes: IV ] + [ N Bytes: Authenticated Ciphertext + 16-byte Tag ]
 *
 * @returns Encoded Base64 string ready for secure persistence
 */
export async function encryptState(
  plaintext: string,
  secretIdentifier: string
): Promise<string> {
  const cryptoObj = typeof window !== "undefined" ? window.crypto : (globalThis as any).crypto;
  const subtle = getSubtleCrypto();

  // 1. Generate unique 16-byte salt and 12-byte IV for this write operation
  const salt = new Uint8Array(SALT_BYTE_LENGTH);
  const iv = new Uint8Array(IV_BYTE_LENGTH);
  cryptoObj.getRandomValues(salt);
  cryptoObj.getRandomValues(iv);

  // 2. Derive ephemeral AES-GCM key in volatile memory
  const aesKey = await deriveKeyFromIdentifier(secretIdentifier, salt);

  // 3. Encrypt payload
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const ciphertextBuffer = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as any,
    },
    aesKey,
    plaintextBytes
  );

  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  // 4. Pack Salt + IV + Ciphertext into a unified buffer
  const totalLength = SALT_BYTE_LENGTH + IV_BYTE_LENGTH + ciphertextBytes.byteLength;
  const packedBuffer = new Uint8Array(totalLength);

  packedBuffer.set(salt, 0);
  packedBuffer.set(iv, SALT_BYTE_LENGTH);
  packedBuffer.set(ciphertextBytes, SALT_BYTE_LENGTH + IV_BYTE_LENGTH);

  // 5. Return as Base64 string
  return uint8ArrayToBase64(packedBuffer);
}

/**
 * Decrypts a Base64-encoded packed payload using AES-GCM and the active operator's JWT identifier.
 * Unpacks Salt and IV, re-derives the key, and validates the authentication tag.
 *
 * If authentication fails, tag verification fails, or the payload is tampered/mismatched,
 * this function throws an error or returns null, enabling the caller to purge corrupted storage.
 *
 * @returns Decrypted plaintext string or null if payload is invalid
 */
export async function decryptState(
  encryptedBase64: string,
  secretIdentifier: string
): Promise<string | null> {
  if (!encryptedBase64 || typeof encryptedBase64 !== "string") {
    return null;
  }

  try {
    const subtle = getSubtleCrypto();
    const packedBytes = base64ToUint8Array(encryptedBase64);

    // Minimum payload length: 16 (salt) + 12 (iv) + 16 (min AES-GCM tag) = 44 bytes
    const minRequiredLength = SALT_BYTE_LENGTH + IV_BYTE_LENGTH + 16;
    if (packedBytes.byteLength < minRequiredLength) {
      console.warn("[StateEncryption] Encrypted payload is shorter than minimum authenticated length.");
      return null;
    }

    // 1. Extract Salt, IV, and Ciphertext
    const salt = packedBytes.subarray(0, SALT_BYTE_LENGTH);
    const iv = packedBytes.subarray(SALT_BYTE_LENGTH, SALT_BYTE_LENGTH + IV_BYTE_LENGTH);
    const ciphertext = packedBytes.subarray(SALT_BYTE_LENGTH + IV_BYTE_LENGTH);

    // 2. Re-derive ephemeral key using the extracted salt and the active session identifier
    const aesKey = await deriveKeyFromIdentifier(secretIdentifier, salt);

    // 3. Decrypt and verify authentication tag
    const decryptedBuffer = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as any,
      },
      aesKey,
      ciphertext as any
    );

    // 4. Decode plaintext JSON
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    // Decryption failed (e.g. invalid tag, tampered ciphertext, or mismatched operator JWT)
    console.warn("[StateEncryption] Decryption verification failed (potential tampering or user switch). State will be purged.", error);
    return null;
  }
}

/**
 * In-memory cache for operator identifier to minimize repeated cookie parsing or network hops.
 */
let cachedOperatorIdentifier: { id: string; expiresAt: number } | null = null;

/**
 * Resolves the active operator's unique identifier (sub claim or email) from the session.
 * Checks document.cookie first, then falls back to the server-side /api/auth/token route.
 */
export async function resolveOperatorSecretIdentifier(): Promise<string | null> {
  const now = Date.now();
  if (cachedOperatorIdentifier && cachedOperatorIdentifier.expiresAt > now) {
    return cachedOperatorIdentifier.id;
  }

  // 1. Check document.cookie (if client-side)
  if (typeof document !== "undefined") {
    const match1 = document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    const match2 = document.cookie.match(/(?:^|;\s*)gridsense_session=([^;]+)/);
    const rawCookieToken = (match1 ? match1[1] : null) || (match2 ? match2[1] : null);

    if (rawCookieToken) {
      const decoded = decodeOperatorToken(decodeURIComponent(rawCookieToken));
      if (decoded) {
        const id = (decoded as any).sub || decoded.email;
        if (id) {
          cachedOperatorIdentifier = { id, expiresAt: now + 60_000 }; // Cache for 60s
          return id;
        }
      }
    }
  }

  // 2. Fall back to server-side auth token bridge route
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/auth/token", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.token) {
          const decoded = decodeOperatorToken(data.token);
          if (decoded) {
            const id = (decoded as any).sub || decoded.email;
            if (id) {
              cachedOperatorIdentifier = { id, expiresAt: now + 60_000 };
              return id;
            }
          }
        }
      }
    } catch (err) {
      console.warn("[StateEncryption] Failed to resolve operator identifier via bridge:", err);
    }
  }

  return null;
}

/**
 * Resets the in-memory cached identifier (called on logout).
 */
export function clearOperatorSecretIdentifierCache(): void {
  cachedOperatorIdentifier = null;
}
