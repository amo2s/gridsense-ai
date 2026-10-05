import { GraphQLClient } from 'graphql-request';

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
