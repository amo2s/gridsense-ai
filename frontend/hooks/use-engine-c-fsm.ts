import { useReducer, useCallback, useRef } from "react";

/**
 * ============================================================================
 * FINITE STATE MACHINE (FSM) - ENGINE C COMMAND PATHWAY (STEP 1.3)
 * ============================================================================
 * Strictly typed 5-state deterministic state machine governing telemetry ingestion:
 *  1. Initializing: Idle state, awaiting operator action or baseline configuration.
 *  2. Connected: Dispatch initiated, AbortController active, connection opened.
 *  3. Receiving Data: Request in flight, stream processing within 8-second budget.
 *  4. Schema Error: Upstream HTTP 400/422 Pydantic v2 boundary rejection intercepted.
 *  5. Timeout: 8000ms gateway execution budget exceeded, connection severed.
 */

export type EngineCFSMState =
  | "Initializing"
  | "Connected"
  | "Receiving Data"
  | "Schema Error"
  | "Timeout";

export interface RejectionIssue {
  fieldPath: string;
  rowIndex: number | null;
  feature: string;
  message: string;
  receivedValue?: unknown;
  ruleCode?: string;
}

export interface ParsedRejection {
  statusCode: number;
  statusText: string;
  timestamp: string;
  errorCount: number;
  issues: RejectionIssue[];
  rawDetail?: unknown;
}

export interface EngineCFSMContext {
  state: EngineCFSMState;
  rejection: ParsedRejection | null;
  timeoutError: string | null;
  successResponse: unknown | null;
  retryCount: number;
  lastAttemptTimestamp: string | null;
}

export type EngineCFSMEvent =
  | { type: "INITIATE_SUBMISSION" }
  | { type: "CONNECTION_ESTABLISHED" }
  | { type: "REJECTION_INTERCEPTED"; rejection: ParsedRejection }
  | { type: "TIMEOUT_TRIGGERED"; error: string }
  | { type: "SUCCESS_RECEIVED"; response: unknown }
  | { type: "IDEMPOTENT_RETRY" }
  | { type: "RESET" };

const initialState: EngineCFSMContext = {
  state: "Initializing",
  rejection: null,
  timeoutError: null,
  successResponse: null,
  retryCount: 0,
  lastAttemptTimestamp: null,
};

/**
 * FSM Transition Reducer with Transition Guards
 * Enforces zero overlapping requests and deterministic state progression.
 */
function engineCFSMReducer(
  state: EngineCFSMContext,
  event: EngineCFSMEvent
): EngineCFSMContext {
  switch (event.type) {
    case "INITIATE_SUBMISSION": {
      // Guard: Disallow if already in-flight (Connected or Receiving Data)
      if (state.state === "Connected" || state.state === "Receiving Data") {
        console.warn(`[FSM Guard] Ignored duplicate submission. State is already ${state.state}.`);
        return state;
      }
      return {
        ...state,
        state: "Connected",
        rejection: null,
        timeoutError: null,
        successResponse: null,
        lastAttemptTimestamp: new Date().toISOString(),
      };
    }

    case "CONNECTION_ESTABLISHED": {
      // Guard: Only valid when transitioning from Connected
      if (state.state !== "Connected") {
        return state;
      }
      return {
        ...state,
        state: "Receiving Data",
      };
    }

    case "REJECTION_INTERCEPTED": {
      // Guard: Intercepted during active network flight
      return {
        ...state,
        state: "Schema Error",
        rejection: event.rejection,
        timeoutError: null,
      };
    }

    case "TIMEOUT_TRIGGERED": {
      // Guard: Triggered when 8-second budget is exceeded
      return {
        ...state,
        state: "Timeout",
        timeoutError: event.error,
        rejection: null,
      };
    }

    case "SUCCESS_RECEIVED": {
      return {
        ...state,
        state: "Initializing",
        successResponse: event.response,
        rejection: null,
        timeoutError: null,
      };
    }

    case "IDEMPOTENT_RETRY": {
      // Guard: Only allowed from error states
      if (state.state !== "Timeout" && state.state !== "Schema Error") {
        return state;
      }
      return {
        ...state,
        state: "Connected",
        rejection: null,
        timeoutError: null,
        retryCount: state.retryCount + 1,
        lastAttemptTimestamp: new Date().toISOString(),
      };
    }

    case "RESET": {
      return {
        ...initialState,
        retryCount: state.retryCount,
      };
    }

    default:
      return state;
  }
}

/**
 * Custom React Hook encapsulating the Engine C Ingestion FSM
 */
export function useEngineCFSM() {
  const [context, dispatch] = useReducer(engineCFSMReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isSubmitting = context.state === "Connected" || context.state === "Receiving Data";

  const cancelActiveRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    context,
    dispatch,
    isSubmitting,
    abortControllerRef,
    cancelActiveRequest,
  };
}

/**
 * Parses Python Pydantic v2 / Go Gateway HTTP 400 and 422 structured error responses.
 */
export function parsePydanticRejection(
  status: number,
  data: unknown
): ParsedRejection {
  const statusText = status === 422 ? "Unprocessable Entity" : "Bad Request";
  const issues: RejectionIssue[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = data as any;

  if (payload && Array.isArray(payload.detail)) {
    // Pydantic v2 standard error structure: { detail: [{ loc: [...], msg: "...", type: "...", input: ... }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload.detail.forEach((item: any) => {
      let rowIndex: number | null = null;
      let feature = "telemetry";
      const loc = Array.isArray(item.loc) ? item.loc : [];

      // Extract row index if location references readings array (e.g. ["body", "readings", 12, "voltage"])
      const readingsIdx = loc.indexOf("readings");
      if (readingsIdx !== -1 && typeof loc[readingsIdx + 1] === "number") {
        rowIndex = loc[readingsIdx + 1];
        if (loc[readingsIdx + 2]) {
          feature = String(loc[readingsIdx + 2]);
        }
      } else if (loc.length > 0) {
        feature = String(loc[loc.length - 1]);
      }

      issues.push({
        fieldPath: loc.join("."),
        rowIndex,
        feature,
        message: item.msg || "Pydantic boundary contract violated.",
        receivedValue: item.input,
        ruleCode: item.type,
      });
    });
  } else if (payload && typeof payload.detail === "string") {
    // Plain string error detail
    issues.push({
      fieldPath: "root.detail",
      rowIndex: null,
      feature: "payload",
      message: payload.detail,
    });
  } else if (payload && (payload.error || payload.message)) {
    // Top level error/message format
    issues.push({
      fieldPath: "root",
      rowIndex: null,
      feature: "gateway",
      message: payload.message || payload.error || "Upstream ingestion rejected.",
    });
  } else {
    issues.push({
      fieldPath: "unknown",
      rowIndex: null,
      feature: "gateway",
      message: "An unknown boundary violation occurred on the upstream gateway.",
    });
  }

  return {
    statusCode: status,
    statusText,
    timestamp: new Date().toISOString(),
    errorCount: issues.length,
    issues,
    rawDetail: data,
  };
}
