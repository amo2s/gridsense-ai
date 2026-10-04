import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: "../backend/services/dashboard-bff/graph/schema.graphqls",
  documents: "graphql/**/*.graphql",
  generates: {
    "lib/graphql/generated.ts": {
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-graphql-request"
      ],
      config: {
        skipTypename: false,
        withHooks: false,
      }
    }
  }
};

export default config;
