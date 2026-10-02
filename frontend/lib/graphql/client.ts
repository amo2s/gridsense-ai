import { headers } from 'next/headers';

const INTERNAL_GRAPHQL_URL = 'http://gateway-service:8080/graphql';
const PUBLIC_GRAPHQL_URL = '/api/graphql';

export function getGraphqlClient() {
  const isServer = typeof window === 'undefined';

  return async function graphqlFetch(query: string, variables: any = {}) {
    if (isServer) {
      // Server Component execution: internal bypass
      const headersList = await headers();
      const userId = headersList.get('x-user-id') || '';
      const userRole = headersList.get('x-user-role') || '';
      const cookieHeader = headersList.get('cookie') || '';

      const res = await fetch(INTERNAL_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': userRole,
          'cookie': cookieHeader,
        },
        body: JSON.stringify({ query, variables }),
      });
      return res.json();
    } else {
      // Client Component execution: public BFF
      const res = await fetch(PUBLIC_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ query, variables }),
      });
      return res.json();
    }
  };
}
