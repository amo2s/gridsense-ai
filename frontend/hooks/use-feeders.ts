import { useQuery } from "@tanstack/react-query";
import { FeederOption } from "@/components/dashboard/feeder-selector";

export const GRID_FEEDERS_QUERY_KEY = "grid-feeders";

interface FeedersApiResponse {
  feeders: FeederOption[];
}

/**
 * Custom hook to fetch the live list of grid feeders from the PostgreSQL database
 * via the Go API Gateway (/api/proxy/v1/assets/feeders).
 *
 * Implements defensive envelope unpacking, supporting both { feeders: [...] }
 * and raw array payload signatures.
 */
export function useFeeders() {
  return useQuery({
    queryKey: [GRID_FEEDERS_QUERY_KEY],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/proxy/v1/assets/feeders", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch grid assets`);
      }

      const data: FeedersApiResponse | FeederOption[] = await response.json();
      
      if (Array.isArray(data)) {
        return data;
      }

      if (data && Array.isArray(data.feeders)) {
        return data.feeders;
      }

      return [] as FeederOption[];
    },
    staleTime: 60_000, // Assets table changes infrequently; cache fresh for 1 min
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
