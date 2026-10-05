import { GraphQLClient } from 'graphql-request';
import { cookies } from 'next/headers';

const GRAPHQL_ENDPOINT = typeof window !== 'undefined'
  ? '/api/proxy/query'
  : (process.env.NEXT_PUBLIC_BASE_URL 
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/proxy/query` 
      : 'http://127.0.0.1:3000/api/proxy/query');

// Client-side GraphQL Client with interceptor
export const graphQLClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
  requestMiddleware: (request) => {
    if (typeof window !== 'undefined') {
      const match = document.cookie.match(new RegExp('(^| )auth_token=([^;]+)'));
      const token = match ? match[2] : null;
      if (token) {
        request.headers = {
          ...request.headers,
          Authorization: `Bearer ${token}`,
        };
      }
    }
    return request;
  },
});

export async function getGraphQLClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  return new GraphQLClient(GRAPHQL_ENDPOINT, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
