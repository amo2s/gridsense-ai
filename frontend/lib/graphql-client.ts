import { GraphQLClient } from 'graphql-request';

const GRAPHQL_ENDPOINT = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}/api/proxy/query`
  : process.env.NEXT_PUBLIC_BASE_URL 
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/proxy/query`
      : 'http://127.0.0.1:3000/api/proxy/query';

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
  requestMiddleware: (request) => {
    if (typeof window !== 'undefined') {
      const match1 = document.cookie.match(new RegExp('(^| )gridsense_session=([^;]+)'));
      const match2 = document.cookie.match(new RegExp('(^| )auth_token=([^;]+)'));
      const token = (match1 ? match1[2] : null) || (match2 ? match2[2] : null);
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
