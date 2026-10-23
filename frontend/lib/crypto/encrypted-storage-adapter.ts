import { StateStorage } from "zustand/middleware";
import {
  encryptState,
  decryptState,
  resolveOperatorSecretIdentifier,
  clearOperatorSecretIdentifierCache,
} from "./state-encryption";

/**
 * ============================================================================
 * GRIDSENSE AI ASSISTANT: ZERO-TRUST ENCRYPTED ZUSTAND STORAGE ADAPTER
 * ============================================================================
 * Implements the StateStorage interface for Zustand's persist middleware.
 * Guarantees that conversational telemetry and session states are never
 * written to localStorage as plaintext.
 * ============================================================================
 */

export interface EncryptedStorageOptions {
  /** Optional custom identifier resolver override (useful in unit tests) */
  getSecretIdentifier?: () => Promise<string | null>;
  /** Fallback raw storage target; defaults to window.localStorage */
  underlyingStorage?: Storage;
}

export const DEFAULT_SECURE_STORAGE_KEY = "gridsense:ai:secure:state";

function resolveStorage(customStorage?: Storage): Storage | null {
  if (customStorage) return customStorage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

/**
 * Constructs an asynchronous encrypted StateStorage adapter bound to the operator's active session.
 */
export function createEncryptedStorage(options: EncryptedStorageOptions = {}): StateStorage {
  const getIdentifier = options.getSecretIdentifier || resolveOperatorSecretIdentifier;

  return {
    getItem: async (name: string): Promise<string | null> => {
      const storage = resolveStorage(options.underlyingStorage);
      if (!storage) {
        return null;
      }

      const encryptedBase64 = storage.getItem(name);
      if (!encryptedBase64) {
        return null;
      }

      // 1. Resolve active operator secret identifier
      const secretIdentifier = await getIdentifier();
      if (!secretIdentifier) {
        // Unauthenticated or session expired: fail closed and do not hydrate stale state
        console.warn("[EncryptedStorage] No active operator identifier found. Purging secure state.");
        storage.removeItem(name);
        return null;
      }

      // 2. Execute authenticated AES-GCM decryption
      const decryptedPlaintext = await decryptState(encryptedBase64, secretIdentifier);
      if (!decryptedPlaintext) {
        // Tag verification failed, data tampered, or mismatched operator JWT: purge and return null
        console.warn(`[EncryptedStorage] Authentication tag mismatch or tampering on '${name}'. Purging storage.`);
        storage.removeItem(name);
        return null;
      }

      return decryptedPlaintext;
    },

    setItem: async (name: string, value: string): Promise<void> => {
      const storage = resolveStorage(options.underlyingStorage);
      if (!storage) {
        return;
      }

      // 1. Resolve active operator secret identifier
      const secretIdentifier = await getIdentifier();
      if (!secretIdentifier) {
        // Refuse to write sensitive telemetry without an active cryptographic session bound to the user
        console.warn("[EncryptedStorage] Aborting state write: user session is unauthenticated.");
        return;
      }

      // 2. Encrypt state via AES-GCM (PBKDF2 100k iterations)
      try {
        const encryptedBase64 = await encryptState(value, secretIdentifier);
        storage.setItem(name, encryptedBase64);
      } catch (err) {
        console.error("[EncryptedStorage] Critical error during state encryption write:", err);
      }
    },

    removeItem: async (name: string): Promise<void> => {
      const storage = resolveStorage(options.underlyingStorage);
      if (!storage) {
        return;
      }

      storage.removeItem(name);
      clearOperatorSecretIdentifierCache();
    },
  };
}

/**
 * Singleton instance configured for default browser persistence.
 */
export const encryptedAssistantStorage = createEncryptedStorage();
