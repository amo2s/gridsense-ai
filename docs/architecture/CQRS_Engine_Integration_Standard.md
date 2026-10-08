# Architectural Decision Record: CQRS Engine Integration Standard

## Status
Accepted

## Context
We have formally deviated from the original 'Engine A Intelligence Page & Frontend Integration Blueprint' by bypassing the GraphQL Backend-for-Frontend (BFF) in favor of a direct Command Query Responsibility Segregation (CQRS) REST pattern through the Go API Gateway. This document serves as the strict engineering blueprint for all future standalone Engine dashboards to ensure architectural uniformity.

## Command Pathway (Ingestion)

**Frontend:** Manual data ingestion must occur on a dedicated Next.js page (e.g., `/dashboard/ingestion/engine-[x]`).

**Network Transport:** The Next.js client must use standard HTTP POST `fetch` requests targeting the Next.js catch-all proxy (`/api/proxy/v1/...`). GraphQL mutations are strictly prohibited for engine telemetry ingestion.

**Security:** The frontend must attach the active user's NextAuth/Session JWT in the `Authorization: Bearer` header.

**Gateway Mediation:** The Go API Gateway receives the payload, validates the JWT, strips it, attaches the internal 64-character service token (`X-Gateway-Token`), and proxies the payload to the respective Python Intelligence microservice.

## Query Pathway (Visualization)

**Frontend:** Standalone Engine pages (e.g., `/dashboard/engine-[x]`) must consume data natively via HTTP GET requests through the Next.js proxy, bypassing the GraphQL BFF completely.

**Backend Contract:** The Go API Gateway is responsible for housing the GET REST handlers (e.g., `HandleGetReliabilitySummary`, `HandleGetPriorityAreas`).

**Data Source:** The Gateway must not trigger live Python computations for visualization. It must query the PostgreSQL database directly for materialized intelligence data and format it into JSON schemas that match the frontend Liquid Glass component requirements.

## Strict Adherence

When Engines B, C, and D are integrated, the agent or developer **must replicate this exact Go Gateway REST routing and Next.js fetch proxy pattern**. The Go GraphQL BFF is reserved strictly for the main overview dashboard and WebSocket streams, not for standalone intelligence engine pages. Any deviation from this CQRS pattern is strictly forbidden.
