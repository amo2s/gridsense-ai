# GridSense AI: Engine A Complete Architectural Summary (Phases 3 - 6)

This master document details the complete end-to-end frontend architecture of the GridSense AI Engine A platform, capturing the structural implementation, data fetching mechanisms, visual design philosophy, and enterprise-grade Polish spanning Phases 3 through 6.

## Architecture & Design System
- **Framework & State**: Next.js 16.3.2 App Router, TypeScript, TanStack Query, and Zustand.
- **"Liquid Glass" Design System**: The application strictly avoids dark mode and adheres to a high-end "Liquid Glass" aesthetic. The palette focuses on an Off-White canvas accented by `#10b981` (Emerald Green) for stable indicators, utilizing `backdrop-blur-md`, subtle specular edge highlights (inner border rendering), and deep drop shadows to mimic glass and liquid properties.

## Transport & Security Resolutions
- **400 Bad Request Resolution**: Mitigated transport serialization errors by correctly passing the `Content-Type: application/json` header through the `graphql-request` interceptor middleware by interacting with the `Headers` instance directly via `.set()`, satisfying the Go BFF's strict GraphQL parsing requirements.
- **401 Unauthorized Resolution**: Implemented a dual-layered client token injection strategy. Client-side mutations utilize `sessionStorage` token injection, while the Next.js API proxy (`/api/proxy`) operates as a fallback, gracefully forwarding the secure HttpOnly cookie `auth_token` upstream for initial mounts and SSR hydration safety.

## Core Dashboard (Phase 3)
- **KPI Summary Cards**: Real-time aggregation of reliability metrics and high-risk area counts.
- **Priority Areas Decision Table**: A fast, tabular matrix featuring subtle glossy hover micro-animations mapped over specific rows, triggering interactive state changes.
- **Reliability Trend Chart**: A Recharts-powered area graph displaying 24h stability metrics, deeply styled with custom SVG gradients and seamless UI boundaries.

## Granular Drill-Down (Phase 4)
- **Dynamic Routing Framework**: Scaffolded the detail workspace (`[id]`) using asynchronous parameter unwrapping (`React.use()`) for `params.id`.
- **Anomaly Timeline**: A vertical timeline component tracking historical grid anomaly events, featuring interactive Liquid Glass indicator dots that reveal contextual tooltips on hover.
- **Predictive Forecast**: A 6-hour forward-looking time-series visualization built with Recharts, enhanced with native SVG `<filter>` tags dynamically wrapping `<feGaussianBlur>` nodes to cast physical, glowing dropshadows beneath the dashed predictive curve.

## Intelligence Explainability & Mutations (Phase 5)
- **SHAP Feature Attribution Panels**: Exposes AI reasoning models by visualizing exact SHAP attribution indices via sleek horizontal Liquid Glass progress bars.
- **Natural Language Parsing**: Renders high-level AI confidence metrics directly in natural-language syntax for immediate operator comprehension.
- **Zero-Latency Optimistic UI**: Engineered seamless interventions utilizing TanStack Query's `onMutate`. Actions (e.g., Acknowledging Alerts) trigger an immediate cache snapshot and `setQueryData` replacement, giving operators instant tactile feedback via bouncy Framer Motion scaling, while gracefully handling rollbacks via `onError`.

## Enterprise Polish & Data Governance (Phase 6)
- **Framer Motion Layout Transitions**: Injected spring-physics animations orchestrated across nested layouts to achieve snappy, dynamic spatial transitions that respect user interactions over sluggish theatrical delays.
- **Dynamic Ambient Edge Glow**: Developed an intelligent wrapper that interpolates subtle background glowing states (REAL, DEGRADED, SYNTHETIC) mapping directly to active data-stream health context.
- **Smart Context-Aware Breadcrumbs**: Intercepts raw `usePathname` URL outputs, overriding backend logic (e.g. converting `engine-a` to `"Reliability Intelligence"`) and gracefully masking raw UUID database segments by truncating hashes (e.g., `"Area Details: A3F2B1"`).
- **Fluid Hover-Expanding Sidebar Navigation**: Structurally decoupled the main navigation from the content grid using placeholder flex containment, allowing the active Sidebar module to physically expand smoothly on hover (`onMouseEnter`) across the Z-axis without triggering jarring width recalculations in the primary data views.
