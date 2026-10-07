# GridSense AI: Phase 3 Technical Summary & Bug Resolution

## Phase 3 Architecture: Engine A Intelligence Page
The Phase 3 implementation successfully scaffolded the standalone `/dashboard/engine-a` route, delivering a highly responsive and aesthetically refined user interface.

- **"Liquid Glass" Design System:** The components strictly adhere to the project's liquid glass design philosophy. This was achieved by auditing and applying the core color palette, notably the signature `#10b981` (Emerald Green) alongside an Off-White palette. The UI incorporates `backdrop-blur-md`, fluid gradients, specular edge highlights, and high-opacity inner borders for a premium, glossy aesthetic.
- **Component Reusability:** Emphasizing consistency, the new layout effectively reuses existing UI shell components. This includes importing the standardized Animated Button component (`@/components/ui/button`) instead of relying on ad-hoc or standard HTML buttons.
- **Real-Time Data Wiring:** The interface has successfully abandoned mocked data and is fully wired to ingest real GraphQL telemetry from the backend. The integration powers the **Summary Statistic Cards**, the **Priority Areas Decision Table** (which features subtle glossy hover sweep micro-animations), and the seamless **Recharts Reliability Trend Chart**.

## Critical Bug Resolutions

### 400 Bad Request (GraphQL Transport & Schema Alignment)
Initial investigations into the `400 Bad Request` errors returned by the Go BFF (`dashboard-bff`) suggested potential schema mismatches or missing mandatory arguments (e.g., missing `$timeRange`). Static auditing of the React hooks (`use-reliability-metrics.ts`, `use-reliability-trend.ts`, and `use-priority-ranking.ts`) confirmed the queries were actually perfectly aligned with `schema.graphqls`.

The true root cause was an underlying transport-level serialization bug originating in the frontend client. The `graphql-request` library was stripping out the `Content-Type: application/json` header because of how the header object was mutated in the interceptor middleware (using the spread operator `...request.headers` on a `Headers` instance).
- **Impact:** Without the proper `Content-Type` header, the Next.js API proxy passed raw bytes/blobs downstream instead of JSON. The upstream `gqlgen` Go BFF, enforcing strict transport rules, rejected the payload with a `400 Bad Request: transport not supported`.
- **Resolution:** Fixed by explicitly checking if `request.headers` is an `instanceof Headers` inside the `graphql-client.ts` middleware and using the `.set()` method appropriately, thereby retaining the essential content type.

### 401 Unauthorized (Dual-Layered GraphQL Authentication)
The Engine A client-side data hooks were initially returning `401 Unauthorized` errors despite successful operator logins, caused by missing JSON Web Tokens on outgoing queries to `/api/proxy/query`.

- **Client-Side Interceptor:** Authentication injection was enforced by adding middleware to `graphql-client.ts`. This dynamically reads the JWT `access_token` from `sessionStorage` and appends it to the `Authorization: Bearer <token>` header of every outgoing client-side GraphQL query.
- **Robust Proxy Fallback:** To ensure bulletproof delivery—especially during initial component mounts where `sessionStorage` might momentarily be empty—a strict fallback was integrated into the Next.js API proxy route handler (`app/api/proxy/[...slug]/route.ts`). The proxy now actively monitors incoming traffic for the `Authorization` header. If missing, it explicitly extracts the `auth_token` from the secure HttpOnly browser cookies and forcefully injects it upstream, guaranteeing authenticated payload delivery to the Go backend.
