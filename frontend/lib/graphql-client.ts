import { GraphQLClient } from 'graphql-request';

const GRAPHQL_ENDPOINT = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}/api/proxy/query`
  : process.env.NEXT_PUBLIC_BASE_URL 
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/proxy/query`
      : 'http://127.0.0.1:3000/api/proxy/query';

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT);
