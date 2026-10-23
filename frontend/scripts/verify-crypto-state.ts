import {
  deriveKeyFromIdentifier,
  encryptState,
  decryptState,
  uint8ArrayToBase64,
  base64ToUint8Array,
  SALT_BYTE_LENGTH,
  IV_BYTE_LENGTH,
  PBKDF2_ITERATIONS,
} from "../lib/crypto/state-encryption";
import {
  createEncryptedStorage,
  DEFAULT_SECURE_STORAGE_KEY,
} from "../lib/crypto/encrypted-storage-adapter";
import {
  useAssistantStore,
  enforceSlidingWindow,
  MAX_CHAT_HISTORY_TURNS,
  ChatMessage,
} from "../store/assistant-store";

// In Node 18+, globalThis.crypto is native Web Crypto
async function runTests() {
  console.log("=================================================================");
  console.log("GRIDSENSE AI ASSISTANT: CRYPTOGRAPHIC & STATE SUITE VERIFICATION");
  console.log("=================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName} - Detail: ${detail || "Assertion failed"}`);
    }
  }

  // TEST 1: Key Derivation Parameters
  try {
    const testSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
    const testSecret = "operator-uuid-7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d";
    const key = await deriveKeyFromIdentifier(testSecret, testSalt);

    assert(key.type === "secret", "Key derivation produces secret key");
    assert(key.algorithm.name === "AES-GCM", "Key algorithm is AES-GCM");
    assert(key.extractable === false, "Key is marked strictly non-extractable");
    assert(
      (key as any).usages?.includes("encrypt") && (key as any).usages?.includes("decrypt"),
      "Key usages scoped strictly to encrypt and decrypt"
    );
  } catch (err: any) {
    assert(false, "Key Derivation Parameters", err.message);
  }

  // TEST 2: Encryption and Decryption Round-trip
  try {
    const operatorId = "operator-alpha@gridsense.internal";
    const samplePayload = JSON.stringify({
      sessionId: "session-xyz-12345",
      activeFeederId: "feeder-beta-uuid",
      chatHistory: [
        { role: "user", content: "What is the harmonic distortion on Feeder Beta?" },
        { role: "assistant", content: "Voltage THD reached 8.4% during peak operational load." },
      ],
    });

    const encryptedBase64 = await encryptState(samplePayload, operatorId);
    assert(typeof encryptedBase64 === "string" && encryptedBase64.length > 50, "Ciphertext is valid Base64 string");

    // Verify plaintext cannot be found in base64
    assert(!encryptedBase64.includes("harmonic distortion"), "Plaintext is not exposed in ciphertext");

    const decrypted = await decryptState(encryptedBase64, operatorId);
    assert(decrypted === samplePayload, "Decrypted state exactly matches original payload");
  } catch (err: any) {
    assert(false, "Encryption & Decryption Round-trip", err.message);
  }

  // TEST 3: Randomized Salt and IV per Write Operation
  try {
    const operatorId = "operator-alpha@gridsense.internal";
    const samplePayload = JSON.stringify({ state: "static-state" });

    const cipher1 = await encryptState(samplePayload, operatorId);
    const cipher2 = await encryptState(samplePayload, operatorId);

    assert(cipher1 !== cipher2, "Identical plaintexts generate distinct ciphertexts due to fresh Salt & IV");

    const raw1 = base64ToUint8Array(cipher1);
    const raw2 = base64ToUint8Array(cipher2);

    const salt1 = raw1.subarray(0, SALT_BYTE_LENGTH);
    const salt2 = raw2.subarray(0, SALT_BYTE_LENGTH);
    const iv1 = raw1.subarray(SALT_BYTE_LENGTH, SALT_BYTE_LENGTH + IV_BYTE_LENGTH);
    const iv2 = raw2.subarray(SALT_BYTE_LENGTH, SALT_BYTE_LENGTH + IV_BYTE_LENGTH);

    const saltsMatch = salt1.every((val, idx) => val === salt2[idx]);
    const ivsMatch = iv1.every((val, idx) => val === iv2[idx]);

    assert(!saltsMatch, "Salt is unique per write operation");
    assert(!ivsMatch, "Initialization Vector is unique per write operation");
  } catch (err: any) {
    assert(false, "Randomized Salt and IV", err.message);
  }

  // TEST 4: Tampering & Integrity Verification (AES-GCM Auth Tag)
  try {
    const operatorId = "operator-alpha@gridsense.internal";
    const samplePayload = JSON.stringify({ confidential: "super-secret-telemetry" });
    const cipher = await encryptState(samplePayload, operatorId);

    // Tamper with a byte in the ciphertext payload
    const rawBytes = base64ToUint8Array(cipher);
    rawBytes[rawBytes.length - 1] ^= 0x55; // Flip bits
    const tamperedCipher = uint8ArrayToBase64(rawBytes);

    const result = await decryptState(tamperedCipher, operatorId);
    assert(result === null, "Tampered ciphertext triggers authentication failure and returns null");
  } catch (err: any) {
    assert(false, "Tampering & Integrity Verification", err.message);
  }

  // TEST 5: Multi-Tenant Session Isolation
  try {
    const operatorA = "operator-a@gridsense.internal";
    const operatorB = "operator-b@gridsense.internal";

    const payload = JSON.stringify({ area: "Substation-7", directive: "Emergency Shed" });
    const cipherA = await encryptState(payload, operatorA);

    // Attempt decryption with Operator B's key
    const crossDecrypted = await decryptState(cipherA, operatorB);
    assert(crossDecrypted === null, "Cross-tenant decryption rejected due to mismatched JWT key derivation");
  } catch (err: any) {
    assert(false, "Multi-Tenant Session Isolation", err.message);
  }

  // TEST 6: Custom Storage Adapter & Self-Healing Purge
  try {
    const mockStorageMap = new Map<string, string>();
    const mockStorage: Storage = {
      length: 0,
      clear: () => mockStorageMap.clear(),
      getItem: (key: string) => mockStorageMap.get(key) || null,
      key: (index: number) => null,
      removeItem: (key: string) => { mockStorageMap.delete(key); },
      setItem: (key: string, value: string) => { mockStorageMap.set(key, value); },
    };

    let activeOperator: string | null = "operator-verified-session-id";
    const adapter = createEncryptedStorage({
      getSecretIdentifier: async () => activeOperator,
      underlyingStorage: mockStorage,
    });

    const stateToStore = JSON.stringify({ state: { sessionId: "sess-1", chatHistory: [] }, version: 0 });

    // Write state
    await adapter.setItem(DEFAULT_SECURE_STORAGE_KEY, stateToStore);
    const storedRaw = mockStorage.getItem(DEFAULT_SECURE_STORAGE_KEY);
    assert(storedRaw !== null && !storedRaw.includes("sess-1"), "Adapter stored encrypted blob in storage");

    // Read state
    const retrieved = await adapter.getItem(DEFAULT_SECURE_STORAGE_KEY);
    assert(retrieved === stateToStore, "Adapter successfully decrypted stored state");

    // Simulate corrupted storage or token revocation
    mockStorage.setItem(DEFAULT_SECURE_STORAGE_KEY, "corrupted-unauthenticated-base64-content==");
    const failSafeRead = await adapter.getItem(DEFAULT_SECURE_STORAGE_KEY);
    assert(failSafeRead === null, "Adapter returns null on corrupted or tampered storage read");
    assert(mockStorage.getItem(DEFAULT_SECURE_STORAGE_KEY) === null, "Adapter actively purged corrupted key from storage");

    // Remove state
    await adapter.setItem(DEFAULT_SECURE_STORAGE_KEY, stateToStore);
    await adapter.removeItem(DEFAULT_SECURE_STORAGE_KEY);
    assert(mockStorage.getItem(DEFAULT_SECURE_STORAGE_KEY) === null, "Adapter removeItem completely eradicated storage key");
  } catch (err: any) {
    assert(false, "Custom Storage Adapter", err.message);
  }

  // TEST 7: Sliding Window Protocol Enforcement (20 turns)
  try {
    const initialTurns: ChatMessage[] = [];
    for (let i = 1; i <= 25; i++) {
      initialTurns.push({
        role: i % 2 === 1 ? "user" : "assistant",
        content: `Message turn number ${i}`,
      });
    }

    const truncated = enforceSlidingWindow(initialTurns);
    assert(truncated.length === MAX_CHAT_HISTORY_TURNS, `Sliding window truncates 25 messages to ${MAX_CHAT_HISTORY_TURNS}`);
    assert(truncated[0].content === "Message turn number 6", "Oldest turns (1-5) were evicted");
    assert(truncated[19].content === "Message turn number 25", "Latest turn (25) is retained as the tail");

    // Test store action addMessage
    useAssistantStore.getState().clearChat();
    for (let i = 1; i <= 25; i++) {
      useAssistantStore.getState().addMessage({
        role: i % 2 === 1 ? "user" : "assistant",
        content: `Turn ${i}`,
      });
    }

    const storeHistory = useAssistantStore.getState().chatHistory;
    assert(storeHistory.length === 20, "Store addMessage action limits history to strictly 20 turns");
    assert(storeHistory[0].content === "Turn 6", "Store sliding window preserves chronological order");
    assert(storeHistory[19].content === "Turn 25", "Store sliding window retains most recent message");
  } catch (err: any) {
    assert(false, "Sliding Window Protocol", err.message);
  }

  // TEST 8: State Schema Key Verification
  try {
    const state = useAssistantStore.getState();
    assert(typeof state.sessionId === "string" && state.sessionId.length > 0, "State has valid sessionId");
    assert("activeFeederId" in state, "State has activeFeederId key");
    assert(Array.isArray(state.chatHistory), "State has chatHistory array");
    assert(!("session_id" in state), "State does NOT use snake_case session_id");
    assert(!("active_feeder_id" in state), "State does NOT use snake_case active_feeder_id");
    assert(!("chat_history" in state), "State does NOT use snake_case chat_history");
  } catch (err: any) {
    assert(false, "State Schema Key Verification", err.message);
  }

  console.log(`\n=================================================================`);
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log(`=================================================================`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
