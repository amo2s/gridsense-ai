import { useQuery } from "@tanstack/react-query";
import { graphqlClient } from "@/lib/graphql-client";
import { PriorityArea } from "@/lib/graphql/generated";

const PRIORITY_AREAS_QUERY = `
  query PriorityAreas {
    priorityAreas {
      id
      name
      urgencyRank
      riskScore
      status
    }
  }
`;

interface PriorityAreasResponse {
  priorityAreas: PriorityArea[];
}

export function usePriorityRanking() {
  return useQuery({
    queryKey: ["priority-areas"],
    queryFn: async () => {
      const data = await graphqlClient.request<PriorityAreasResponse>(
        PRIORITY_AREAS_QUERY
      );
      return data.priorityAreas;
    },
  });
}
