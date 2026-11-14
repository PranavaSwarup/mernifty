---
version: 1
slug: "client-src-app-jsx"
primary_target: "client/src/App.jsx"
related_targets: []
---

# Surface Brief — MetroPulse BLR Control Console (`client/src/App.jsx`)

- **Scope & Visitor Mode:** `operate` (desktop-primary `>=1280px` Bengaluru traffic operations console & engineering telemetry workbench, dark primary for control desks with light theme toggle).
- **Audience & Job:** Municipal traffic desk operators diagnosing junction queues, counterfactual delay vs Fixed-TOD baseline, and K=12 MPC runbooks; systems engineers auditing OpenTelemetry traces, Wire v1 byte efficiency, sequence integrity, and empirical control/load benchmarks.
- **Constraints:** Four top-level workspaces (`Network`, `Junction`, `Desks`, `Engineering`); all numeric metrics fetched live from `/api/*` or Socket.IO; persistent `Simulated (physics model)` label; counterfactual attribution `vs Webster-tuned fixed-time plan, same simulated arrivals`; discrete rollout confidence ratios (`improvedRollouts/K` + 90% interval); code-split per workspace via `React.lazy`.

## Direction contract

- **THESIS:** Replace the 9-tab dark-neon command template and synthetic mesh cards with a restrained civil traffic-control instrument grounded in paired Common Random Numbers physics, counterfactual accounting, and verifiable multi-desk socket isolation.
- **OWN-WORLD:** Matte charcoal-slate layered panels (`#0E1116` / `#141922` / `#1B222E`) paired with clean paper light mode (`#F2F4F7` / `#FFFFFF` / `#E8ECF2`), 1px hairline separation without glass blur or glow, `Public Sans` sentence-case UI typography with `JetBrains Mono` strictly for telemetry values/tuples using `tabular-nums`, single cobalt interactive accent (`#3B82F6` / `#1D4ED8`), and color-blind-safe semantic state signals (`#10B981` Flow, `#E69F00` Heavy, `#D55E00` Gridlock, `#38BDF8` Emergency paired with shape indicators).
- **STORY:** Within five seconds on load, the operator inspects spatial corridor health on Bengaluru arterials alongside live adaptive vs Fixed-TOD counterfactual savings, clicks any junction glyph to examine its 4-arm intersection physics and MPC runbooks, tests genuine multi-client JWT room isolation under Desks, and audits OTel trace links and regime loss tables under Engineering.
- **FIRST VIEWPORT:** Full-bleed responsive split (`68%` live Leaflet CartoDB map of 12 signal-ring junction glyphs & speed-colored links on left; `32%` right rail holding 4 city KPI figures, live dual-line Counterfactual panel, and clickable Alerts stream) anchored beneath a quiet single-row top navigation bar (`Network`, `Junction`, `Desks`, `Engineering`) with a clearly labeled Demo personas selector and Persistent Simulation badge.
- **FORM:** Pinned four-workspace Operate transport instrument (concept-seed reference noted: `seed:481cf2d948e565d2`; overridden by brief pin `seed: none (pinned)` "calm, precise traffic-control-room instrument — think a real transport operations console / engineering instrument, not a sci-fi HUD. Dense but quiet; information hierarchy through typography and spacing, not glow. One accent used for meaning (signal/state), semantic colours only for state (flow/heavy/gridlock/emergency) and colour-blind safe. Real numerals: tabular figures. A distinctive but legible type pairing (no Inter-everything default). Dark theme primary, works in light. No emojis, no gradient blobs, no fake AI sparkle.").
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
