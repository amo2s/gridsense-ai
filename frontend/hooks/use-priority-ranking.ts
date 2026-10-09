import { useQuery } from "@tanstack/react-query";

interface PriorityArea {
  id: string;
  name: string;
  urgencyRank: number;
  riskScore: number;
  status: string;
}

export function usePriorityRanking() {
  return useQuery({
    queryKey: ["priority-areas"],
    queryFn: async () => {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null;
      if (!token) {
        throw new Error("Authentication token missing");
      }

      const response = await fetch(`/api/proxy/v1/priorities`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",

        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.priorityAreas as PriorityArea[];
    },
  });
}

