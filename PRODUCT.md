# Product

<!-- impeccable:product-schema 1 -->

> _Note: Product truth compiled directly from repository implementation (`server/src/*`, `benchmarks/results/*`) and the `T08-ui-redesign.md` specification in an unattended orchestrator session; operational UI workflows inferred from the brief and backend API surface are labeled accordingly._

## Platform

web

## Users

1. **Municipal Traffic Control Operators (Zone & City Desks)** — Bengaluru Transport / BTP traffic control room operators monitoring congestion, anomalies (demand surges, stalled vehicles, emergency corridors), signal controllers, and counterfactual delay impact across 12 modelled Bengaluru arterial junctions grouped into 4 zones (`south-bangalore`, `east-bangalore`, `north-bangalore`, `central-bangalore`). *(Persona roles implemented in `server/src/routes/authRoutes.js`: `anonymous`, `viewer`, `south-operator`, `east-operator`, `admin`; demo login active when `DEMO_PERSONAS=true`.)*
2. **Traffic / Platform Systems Engineers** — Engineers inspecting ingest pipeline integrity (sequence deduplication, late/gap tracking, `IngestionBuffer` backpressure), OpenTelemetry span links & P50/P95/P99 latency distributions, Wire v1 byte efficiency, Socket.IO reconnect cursor resume, and empirical signal-control vs benchmark evaluations.
3. **Technical Judges / Evaluators** — Independent reviewers operating on >=1280px laptop viewports testing real selective room delivery across independent clients, causal counterfactual accounting, and reproducible benchmarks. *(Inferred evaluation workflow from `T08-ui-redesign.md`.)*

## Product Purpose

MetroPulse BLR is a centralized traffic telemetry ingestion, paired physics-twin simulation, adaptive signal control, and real-time operator console for 12 Bengaluru junctions (35 directed arterial links). It measures live signal control against a paired Fixed-TOD baseline running on Common Random Numbers (CRN), provides evidence-backed K=12 MPC look-ahead diagnostics with 300-second post-action accuracy auditing, and isolates WebSocket fan-out per zonal/junction room using compact Wire v1 frames.

## Positioning

Unlike decorative smart-city dashboards or unverified simulation loops, every control decision in MetroPulse BLR is paired against an identical Fixed-TOD twin (`CounterfactualPair` with CRN arrivals), every AI Copilot recommendation reports discrete look-ahead rollout wins (`improvedRollouts/K`) with a 90% interval rather than opaque percentages, all traffic is honestly labeled as physics-model simulation, and empirical studies document both regimes where adaptive control helps and where it loses (such as severe stationary `0.35` PM Peak saturation).

## Operating Context

- Desktop-primary traffic control console (`>=1280px` primary, responsive degradation on narrower screens), operable in low-light control rooms (dark primary) and bright daytime offices (light theme supported).
- Live operational state arrives over Socket.IO (`wire:schema`, `telemetry:zone`, `telemetry:junction`, `cf:update`, `alert:new`, `obs:update`, `bench:progress`, `replay`) paired with REST endpoints under `/api/*`.
- Operator remediation actions and chaos stress injections are gated by JWT roles (`admin`, `operator` scoped to zone) with optional `DEMO_PERSONAS=true` persona switching labeled clearly as "Demo personas".

## Capabilities and Constraints

- **Data Truth Mandate:** Every displayed metric, study row, benchmark statistic, trace percentile, and junction telemetry value must originate from live `/api/*` endpoints, `benchmarks/results/*.json`, or Socket.IO streams — zero hardcoded fake UI metric claims (e.g., removed unbacked `7,320`, `sub-5ms`, `~75%` UI copy).
- **Required Honesty Labels:**
  - Persistent quiet indicator: `Simulated (physics model)`.
  - Counterfactual framing: `vs Webster-tuned fixed-time plan, same simulated arrivals`.
  - Copilot confidence: discrete rollout ratio plus 90% interval (e.g., `11/12 look-ahead rollouts improved delay`, 90% `[low, high]`).
  - Controlled-study visibility: display the full regime table including conditions where adaptive control performs worse than Fixed-TOD, and expose `AutoSupervisoryController` switch reasons.
  - Benchmark accounting transparency: `HTTP-accepted/s != persisted-to-Atlas/s != delivered-to-sockets/s`.
- **Technical Performance & Architecture:** React + Vite code-split across 4 primary workspaces (`Network`, `Junction`, `Desks`, `Engineering`), external `useSyncExternalStore` hot store + throttled rendering, Leaflet ArcGIS (Esri) Gray Canvas map tiles with attribution, Recharts time-series + SVG schematics, strict WCAG AA contrast & keyboard navigation, `prefers-reduced-motion` compliance.
- **Explicit Out-of-Scope Deletions:** Remove ungrounded/synthetic legacy views (`NetworkTopologyView` fake "global edge mesh") and collapse legacy 9-tab fragmentation into the 4 focused workspaces.

## Evidence on Hand

- `server/src/sim/*`: Paired 12-junction, 35-link traffic physics engine (`TrafficWorld`, `CounterfactualPair`, `FixedTod`, `Webster`, `MaxPressure`, `MaxPressureCA`, `AutoSupervisoryController`), deterministic seed + CRN emergency preemption.
- `benchmarks/results/control-study-2026-11-14.json` & `control-study-latest.md`: 30-cell, 1,200-episode controlled evaluation across `normal` and `surge_incident` scenarios (`0.15..0.35` scales, `am-peak`, `midday`, `pm-peak`).
- `benchmarks/results/2026-11-14T15-56-25-693Z-LAPTOP-L5QTGT61-otel-on.json` & `...-otel-off.json` & `latest.md`: Reproducible Atlas M0 ingest & Socket.IO fan-out benchmarks (up to 500 concurrent sockets, OTel 5% sampled vs disabled).
- `server/src/telemetry/otel.js` & `server/src/routes/observabilityRoutes.js`: Real OpenTelemetry spans, batching span links, histogram percentiles, and server process CPU/RSS/event-loop lag metrics.

## Product Principles

1. **Instrument Precision over Spectacle:** Typography, tabular numerals, spatial hierarchy, and semantic restraint communicate state clearly without glow, neon chrome, glassmorphism, or decorative badges.
2. **Causal & Empirical Honesty:** Show baselines, confidence bounds, adaptive failure modes, and simulation provenance plainly beside every number.
3. **Real Isolation & Selective Delivery:** Prove zonal room filtering with genuinely independent Socket.IO clients and real per-client byte/frame accounting.
4. **Bounded Cognitive Load at High Event Rates:** Throttled stores, SVG/canvas intersection schematics, and windowed lists keep 24+ events/sec legible and responsive at `1280px` and above.

## Accessibility & Inclusion

- Semantic color palette for flow / heavy / gridlock / emergency paired with shape/badge/text indicators so color-blind operators never rely on hue alone.
- Full keyboard navigation, visible focus outlines, >= 4.5:1 body text contrast in both dark and light themes, and `prefers-reduced-motion` support.
