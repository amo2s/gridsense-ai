import { GraphQLClient } from 'graphql-request';


const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_BASE_URL 
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/proxy/query` 
      : 'http://127.0.0.1:3000/api/proxy/query';

export async function getGraphQLClient() {
  return new GraphQLClient(GRAPHQL_ENDPOINT);
}
