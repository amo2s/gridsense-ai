import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { encryptedAssistantStorage, DEFAULT_SECURE_STORAGE_KEY } from "@/lib/crypto/encrypted-storage-adapter";

/**
 * ============================================================================
 * GRIDSENSE AI ASSISTANT: ENTERPRISE STATE MANAGEMENT SLICE
 * ============================================================================
 * Manages conversation history, feeder topology scope, and session state.
 * Strictly enforces:
 * 1. CamelCase property naming (sessionId, activeFeederId, chatHistory).
 * 2. Sliding window protocol interceptor capping history at 20 turns.
 * 3. Zero-trust AES-GCM encrypted persistence via native Web Crypto.
 * ============================================================================
 */

export const MAX_CHAT_HISTORY_TURNS = 20;

export interface Citation {
  source_table: string;
  record_id: string;
  metric_snippet: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isError?: boolean;
  timestamp?: string;
}

export interface AssistantState {
  // Mandatory CamelCase State Schema
  sessionId: string;
  activeFeederId: string | null;
  chatHistory: ChatMessage[];

  // Transient UI states (not persisted to disk)
  isThinking: boolean;
  activeStatusMessage: string | null;
  lastError: string | null;

  // Actions
  setSessionId: (id: string) => void;
  setActiveFeederId: (feederId: string | null) => void;
  addMessage: (message: ChatMessage) => void;
  setChatHistory: (history: ChatMessage[]) => void;
  deleteMessage: (index: number) => void;
  setIsThinking: (thinking: boolean, statusMessage?: string | null) => void;
  setLastError: (error: string | null) => void;
  clearChat: () => void;
  resetSession: () => void;
}

/**
 * Robust UUID v4 generator with Web Crypto support and Math.random fallback.
 */
export function generateSessionUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Sliding window protocol interceptor.
 * Truncates message array to ensure strictly <= 20 chronological turns.
 */
export function enforceSlidingWindow(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_CHAT_HISTORY_TURNS) {
    return messages;
  }
  return messages.slice(-MAX_CHAT_HISTORY_TURNS);
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set, get) => ({
      sessionId: generateSessionUUID(),
      activeFeederId: null,
      chatHistory: [],

      isThinking: false,
      activeStatusMessage: null,
      lastError: null,

      setSessionId: (id: string) => {
        set({ sessionId: id.trim() });
      },

      setActiveFeederId: (feederId: string | null) => {
        set({ activeFeederId: feederId ? feederId.trim() : null });
      },

      /**
       * Appends a new turn with sliding window enforcement.
       * Before appending to state and triggering the encrypted write,
       * history is truncated to retain only the most recent 20 turns.
       */
      addMessage: (incoming: ChatMessage) => {
        const currentHistory = get().chatHistory;
        const sanitizedTurn: ChatMessage = {
          role: incoming.role,
          content: incoming.content.trim(),
          citations: incoming.citations,
          isError: incoming.isError,
          timestamp: incoming.timestamp || new Date().toISOString(),
        };

        const updatedHistory = enforceSlidingWindow([...currentHistory, sanitizedTurn]);

        set({
          chatHistory: updatedHistory,
          lastError: null,
        });
      },

      setChatHistory: (incomingHistory: ChatMessage[]) => {
        const sanitizedHistory = incomingHistory.map((msg) => ({
          role: msg.role,
          content: msg.content.trim(),
          citations: msg.citations,
          isError: msg.isError,
          timestamp: msg.timestamp || new Date().toISOString(),
        }));

        set({
          chatHistory: enforceSlidingWindow(sanitizedHistory),
          lastError: null,
        });
      },

      deleteMessage: (indexToDelete: number) => {
        const currentHistory = get().chatHistory;
        if (indexToDelete < 0 || indexToDelete >= currentHistory.length) {
          return;
        }
        const updatedHistory = currentHistory.filter((_, idx) => idx !== indexToDelete);
        set({
          chatHistory: enforceSlidingWindow(updatedHistory),
        });
      },

      setIsThinking: (thinking: boolean, statusMessage: string | null = null) => {
        set({
          isThinking: thinking,
          activeStatusMessage: thinking ? statusMessage : null,
        });
      },

      setLastError: (error: string | null) => {
        set({ lastError: error });
      },

      clearChat: () => {
        set({
          chatHistory: [],
          lastError: null,
        });
      },

      resetSession: () => {
        set({
          sessionId: generateSessionUUID(),
          chatHistory: [],
          activeFeederId: null,
          isThinking: false,
          activeStatusMessage: null,
          lastError: null,
        });
      },
    }),
    {
      name: DEFAULT_SECURE_STORAGE_KEY,
      storage: createJSONStorage(() => encryptedAssistantStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        activeFeederId: state.activeFeederId,
        chatHistory: state.chatHistory,
      }),
    }
  )
);
