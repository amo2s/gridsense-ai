import { useQuery } from "@tanstack/react-query";

export interface AreaSummary {
  id: string;
  name: string;
  state: string;
}

export const OPERATIONAL_AREAS_QUERY_KEY = "operational-areas";

interface AreasApiResponse {
  areas: AreaSummary[];
}

/**
 * Custom hook to fetch the live list of operational grid areas from the PostgreSQL database
 * via the Go API Gateway (/api/proxy/v1/areas).
 */
export const useAreasQuery = () => {
  return useQuery({
    queryKey: [OPERATIONAL_AREAS_QUERY_KEY],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/proxy/v1/areas", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to retrieve operational areas`);
      }

      const data: AreaSummary[] | AreasApiResponse = await response.json();

      if (Array.isArray(data)) {
        return data;
      }

      if (data && Array.isArray((data as AreasApiResponse).areas)) {
        return (data as AreasApiResponse).areas;
      }

      return [] as AreaSummary[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes fresh
    refetchOnWindowFocus: false,
    retry: 2,
  });
};
