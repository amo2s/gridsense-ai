"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEngineDStore } from "@/store/engine-d-store";
import { PrioritizationResponse } from "@/types/engine-d";

export const ENGINE_D_QUERY_KEY = "engine-d-ranking";
const MAX_CONSECUTIVE_FAILURES = 3;
const CIRCUIT_BREAKER_COOLOFF_SECONDS = 30;

export interface UseEngineDQueryResult {
  data: PrioritizationResponse | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  isCircuitBreakerOpen: boolean;
  circuitBreakerRemainingSeconds: number;
  resetCircuitBreaker: () => void;
  refetch: () => Promise<unknown>;
}

/**
 * ============================================================================
 * ENGINE D DATA QUERY HOOK & RESILIENT CIRCUIT BREAKER (PHASE 3)
 * ============================================================================
 * Consumes the Next.js Engine D proxy route at:
 *   /api/proxy/v1/priorities/rank?query_id={activeAreaId}
 *
 * Implements:
 *  1. Automatic tracking of activeAreaId from useEngineDStore.
 *  2. 3-Strike Circuit Breaker: 3 consecutive network/server failures trips the breaker.
 *  3. 30-Second countdown cool-off timer on trip.
 *  4. Direct rendering of synchronously returned PrioritizationResponse without
 *     optimistic updates (Postgres UPSERT handled asynchronously on Gateway).
 */
export function useEngineDQuery(): UseEngineDQueryResult {
  const queryClient = useQueryClient();
  const activeAreaId = useEngineDStore((state) => state.activeAreaId);

  // Circuit Breaker State
  const consecutiveFailuresRef = useRef<number>(0);
  const [isCircuitBreakerOpen, setIsCircuitBreakerOpen] = useState<boolean>(false);
  const [circuitBreakerRemainingSeconds, setCircuitBreakerRemainingSeconds] = useState<number>(0);
  const cooloffTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetCircuitBreaker = useCallback(() => {
    consecutiveFailuresRef.current = 0;
    setIsCircuitBreakerOpen(false);
    setCircuitBreakerRemainingSeconds(0);
    if (cooloffTimerRef.current) {
      clearInterval(cooloffTimerRef.current);
      cooloffTimerRef.current = null;
    }
  }, []);

  const tripCircuitBreaker = useCallback(() => {
    setIsCircuitBreakerOpen(true);
    setCircuitBreakerRemainingSeconds(CIRCUIT_BREAKER_COOLOFF_SECONDS);

    if (cooloffTimerRef.current) {
      clearInterval(cooloffTimerRef.current);
    }

    cooloffTimerRef.current = setInterval(() => {
      setCircuitBreakerRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (cooloffTimerRef.current) {
            clearInterval(cooloffTimerRef.current);
            cooloffTimerRef.current = null;
          }
          // Allow half-open state after countdown finishes
          setIsCircuitBreakerOpen(false);
          consecutiveFailuresRef.current = 0;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (cooloffTimerRef.current) {
        clearInterval(cooloffTimerRef.current);
      }
    };
  }, []);

  const query = useQuery({
    queryKey: [ENGINE_D_QUERY_KEY, activeAreaId],
    queryFn: async ({ signal }) => {
      if (!activeAreaId) {
        throw new Error("Missing activeAreaId: Select an operational grid area to execute ranking.");
      }

      if (isCircuitBreakerOpen) {
        throw new Error(
          `Circuit breaker is OPEN. Service degraded. Retrying allowed in ${circuitBreakerRemainingSeconds}s.`
        );
      }

      try {
        const response = await fetch(
          `/api/proxy/v1/priorities/rank?query_id=${encodeURIComponent(activeAreaId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            signal,
          }
        );

        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          const message =
            errBody?.message || errBody?.error || `Gateway returned HTTP ${response.status}`;
          throw new Error(message);
        }

        const data: PrioritizationResponse = await response.json();

        // Successful execution clears failure count
        consecutiveFailuresRef.current = 0;
        if (isCircuitBreakerOpen) {
          resetCircuitBreaker();
        }

        return data;
      } catch (err: any) {
        // Increment failure strikes
        consecutiveFailuresRef.current += 1;

        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          tripCircuitBreaker();
        }

        throw err;
      }
    },
    enabled: Boolean(activeAreaId) && !isCircuitBreakerOpen,
    staleTime: 20_000, // 20s fresh
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      // Do not retry if circuit breaker tripped or if client validation error
      if (isCircuitBreakerOpen || failureCount >= 2) return false;
      return true;
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError || isCircuitBreakerOpen,
    error: query.error ? (query.error as Error) : null,
    isCircuitBreakerOpen,
    circuitBreakerRemainingSeconds,
    resetCircuitBreaker,
    refetch: query.refetch,
  };
}
