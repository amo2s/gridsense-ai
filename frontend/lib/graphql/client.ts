import { GraphQLClient } from 'graphql-request';
import { cookies } from 'next/headers';

// The URL should point to the frontend's own proxy route or directly to the gateway if internal.
// In Next.js Server Components running on the same host, we typically use the full URL.
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_BASE_URL
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/proxy/query`
  : 'http://127.0.0.1:3000/api/proxy/query';

export async function getGraphQLClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  return new GraphQLClient(GRAPHQL_ENDPOINT, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
