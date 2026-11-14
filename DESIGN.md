---
name: "MetroPulse BLR Control Console"
description: "Calm, disciplined traffic-control-room instrument for Bengaluru arterial simulation, counterfactual accounting, and high-throughput telemetry."
colors:
  ground-dark: "#0e1116"
  surface-dark: "#141922"
  inset-dark: "#1b222e"
  border-subtle-dark: "#262f3f"
  border-strong-dark: "#364257"
  text-primary-dark: "#edf1f7"
  text-secondary-dark: "#b4c0d1"
  text-muted-dark: "#8a98ad"
  accent-action: "#2563eb"
  accent-ink-dark: "#60a5fa"
  accent-ink-light: "#1d4ed8"
  accent-contrast: "#ffffff"
  state-flow: "#10b981"
  state-heavy: "#f59e0b"
  state-gridlock: "#f97316"
  state-emergency: "#38bdf8"
  ground-light: "#f2f4f7"
  surface-light: "#ffffff"
  inset-light: "#e8ecf2"
  border-subtle-light: "#d1d8e3"
  border-strong-light: "#aebacb"
  text-primary-light: "#111824"
  text-secondary-light: "#374357"
  text-muted-light: "#526075"
  state-flow-light: "#047857"
  state-heavy-light: "#92400e"
  state-gridlock-light: "#9a3412"
  state-emergency-light: "#0369a1"
typography:
  workspace-title:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0em"
  section-title:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0em"
  panel-heading:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.01em"
  body:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  telemetry-kpi:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  telemetry-label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  control: "4px"
  inset: "6px"
  panel: "8px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent-action}"
    textColor: "{colors.accent-contrast}"
    typography: "{typography.panel-heading}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.inset-dark}"
    textColor: "{colors.text-primary-dark}"
    typography: "{typography.panel-heading}"
    rounded: "{rounded.control}"
    padding: "4px 10px"
    height: "32px"
  input-control:
    backgroundColor: "{colors.inset-dark}"
    textColor: "{colors.text-primary-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
    height: "32px"
  status-chip:
    backgroundColor: "{colors.inset-dark}"
    textColor: "{colors.text-secondary-dark}"
    typography: "{typography.telemetry-label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  panel-surface:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.panel}"
    padding: "14px"
  panel-inset:
    backgroundColor: "{colors.inset-dark}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.inset}"
    padding: "10px"
  nav-bar:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-secondary-dark}"
    typography: "{typography.panel-heading}"
    height: "52px"
    padding: "0 16px"
---

# Design System: MetroPulse BLR Control Console

## Overview

**Creative North Star: "Calibrated Municipal Dispatch Instrument"**

MetroPulse BLR is designed as a dense, quiet transport operations console and engineering telemetry instrument rather than a neon cyberpunk dashboard or marketing visualization. Every panel separates cleanly on a dark matte charcoal ground (with full light-theme parity for daylight control rooms) using 1px hairline borders, crisp sentence-case headings, and tabular monospace telemetry aligned for rapid scanning across twelve Bengaluru junctions.

Hierarchy comes from spatial grouping, disciplined weight steps, and restrained semantic state indicators rather than blur glass, gradient fills, drop shadows, or oversized vanity metrics. Visual direction choices and domain terminology (`MetroPulse BLR`, four-workspace segmentation, and physics/counterfactual framing) were synthesized directly from `PRODUCT.md`, `T08-ui-redesign.md`, and the codebase in an unattended session without an interactive interview step.

**Key Characteristics:**
- Dark charcoal control-room ground paired with high-contrast daylight paper parity via semantic CSS custom properties.
- One functional cobalt interactive accent (`accent-action` / `accent-ink-*`) strictly reserved for selection, active workspaces, focus outlines, and direct operator controls.
- Dual-coded traffic health semantics (`state-flow`, `state-heavy`, `state-gridlock`, `state-emergency`) paired with text labels and SVG glyphs so color is never the sole carrier of meaning.
- Strict empirical restraint: persistent `Simulated (physics model)` context, discrete look-ahead rollout fractions (`improvedRollouts/K`), and zero decorative numerals.

## Colors

The palette relies on cool graphite surfaces for sustained operator legibility, reserving chroma exclusively for interactive cobalt affordances and four non-overlapping traffic states.

### Primary
- **Action Cobalt** (`accent-action`): Primary operator actions, active workspace highlights, active focus rings, and chart adaptive series encoding.
- **Readable Accent Ink** (`accent-ink-dark`, `accent-ink-light`): Accessible text accent for inline links, telemetry highlights, and active tab underlines meeting WCAG AA against surface backgrounds in dark and light modes.
- **Accent Contrast** (`accent-contrast`): Text foreground on filled `accent-action` controls.

### Secondary
- **Flow State** (`state-flow`, `state-flow-light`): Normal free-flowing intersections, positive delay savings, and healthy socket/OTel thresholds.
- **Heavy Congestion** (`state-heavy`, `state-heavy-light`): Elevated queue regimes and warning-level latency spans, always paired with warning glyphs or status text.
- **Gridlock Severity** (`state-gridlock`, `state-gridlock-light`): Saturated junctions, adaptive loss cells in study tables, and critical alerts (amber/vermilion separation from pure red/green traps).
- **Emergency Corridor** (`state-emergency`, `state-emergency-light`): Active ambulance preemption corridors and priority phase overrides.

### Neutral
- **Ground & Layered Surfaces** (`ground-dark`, `surface-dark`, `inset-dark`; `ground-light`, `surface-light`, `inset-light`): Stepwise tonal separation between application canvas, workspace cards (`.console-panel`), and nested telemetry cells (`.console-inset`).
- **Hairline Strokes** (`border-subtle-dark`, `border-strong-dark`; `border-subtle-light`, `border-strong-light`): Structural 1px borders replacing drop shadows across all resting cards and tables.
- **Typographic Ink Ladder** (`text-primary-*`, `text-secondary-*`, `text-muted-*`): Three calibrated contrast tiers maintaining readability across primary figures, metadata descriptions, and axis units.

### Named Rules
**The Functional Chroma Rule.** Never apply saturated color fills to entire workspace backgrounds or card bodies; chromatic signal stays confined to thin strokes, status pills, map glyphs, and active controls.

**The Dual-Signal State Rule.** Every traffic severity color (`state-flow`, `state-heavy`, `state-gridlock`, `state-emergency`) must be accompanied by an explicit status word, glyph shape, or stroke dash pattern so color-blind operators perceive state identically.

## Typography

**Display Font:** `Public Sans` (with `system-ui, -apple-system, Segoe UI, sans-serif` fallback)
**Body Font:** `Public Sans` (with `system-ui, -apple-system, Segoe UI, sans-serif` fallback)
**Label/Mono Font:** `JetBrains Mono` (with `ui-monospace, SFMono-Regular, monospace` fallback)

**Character:** Compact humanist grotesk headings in sentence case paired with high-legibility `tabular-nums` monospace measurements create the calm rhythm of calibrated instrumentation rather than a promotional web app.

### Hierarchy
- **Workspace Title** (`workspace-title`, weight 600, `1rem`, line-height `1.4`): Top headings (`<h1>` and drawer titles) across Network, Junction, Desks, and Engineering.
- **Section Title** (`section-title`, weight 600, `0.875rem`, line-height `1.4`): Sub-workspace cards such as independent Desk subscription panes.
- **Panel Heading** (`panel-heading`, weight 600, `0.75rem`, line-height `1.4`): Compact card headers (`<h2>`) separating dense multi-panel views without inflating vertical chrome.
- **Body** (`body`, weight 400, `0.75rem`, line-height `1.5`): Operator explanations, copilot evidence descriptions, and form labels.
- **Telemetry KPI** (`telemetry-kpi`, weight 600, `1rem`, `tabular-nums`): Live desk counters and numeric summaries aligned horizontally without jitter during 10 Hz updates.
- **Telemetry Label** (`telemetry-label`, weight 500, `0.6875rem`): Sequence cursors, Wire v1 byte gauges, waterfall ruler offsets, and axis units.

### Named Rules
**The Tabular Lock Rule.** All updating telemetry values, clock timestamps, countdown timers, byte sizes, and benchmark tables must use `.tabular-nums` (`JetBrains Mono`) so streaming updates never shift column widths.

**The Quiet Scale Rule.** Keep interface chrome compact (`workspace-title` maxes at `1rem`); establish hierarchy through weight, surface inset, and alignment instead of oversized marketing headers.

## Layout

- **Top Command Rail:** Single sticky `52px` (`min-h-[52px]`) bar bounded to `max-w-[1920px]` holding the `MetroPulse BLR` mark, WAI-ARIA `tablist` navigation (`Network`, `Junction`, `Desks`, `Engineering`), persistent simulation badge, live/pause toggle, Demo personas selector, audio alert toggle, and theme switcher. Wraps cleanly down to `390px` mobile without horizontal overflow.
- **Network Workspace:** Desktop (`>=1024px`, tuned for `1280px`+) splits full-bleed viewport height (`lg:h-[calc(100vh-52px)]`) into a flexible Leaflet Bengaluru corridor map on the left and a dedicated right rail containing City Room KPIs, the Counterfactual sparkline panel (`Adaptive vs Fixed-Time`), and clickable live alerts. Mobile stacks vertically with horizontal scrollable zone pills and `5`-alert pagination.
- **Junction / Desks / Engineering Workspaces:** Progressive responsive CSS grids (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` on Junction; multi-desk comparison grid on Desks; scrollable telemetry sections with `scroll-mt-16` anchor clearance on Engineering).

## Elevation & Depth

Surface hierarchy is strictly architectural and matte: depth is communicated via sequential surface contrast (`ground` -> `surface` -> `inset`) and 1px hairline borders rather than ambient card shadows or `backdrop-filter` blur.

### Shadow Vocabulary
- **Floating Map Popup** (`box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25)`): Applied exclusively to `.leaflet-popup-content-wrapper` and `.leaflet-popup-tip` floating over map tiles.
- **Floating Map Tooltip** (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2)`): Applied exclusively to `.mp-tooltip.leaflet-tooltip` hover overlays over junctions and links.

### Named Rules
**The Flat-By-Default Rule.** Resting cards, drawers, tables, and navigation bars carry zero `box-shadow`; structural separation comes solely from `.console-panel` and `.console-inset` 1px borders and surface luminance steps.

## Shapes

- **Panels** (`.console-panel`, `rounded.panel` / `8px`): Primary workspace containers, map wrapper frames, benchmark blocks, and desk panes.
- **Inset Blocks** (`.console-inset`, `rounded.inset` / `6px`): Inner KPI cells, counterfactual summary tiles, chaos injector boxes, and map hover tooltips.
- **Interactive Controls** (`rounded.control` / `4px`): Buttons, `<select>` menus, filter inputs, and toggle segments.
- **Status Badges & Map Rings** (`rounded.pill` / `9999px`): Traffic state pills and 12-junction circular SVG signal markers whose outer stroke width, fill contrast, and phase arc encode queue severity and active signal green.

## Components

### Buttons
- **Shape:** Subtle rectangular control corners (`4px`) sized to maintain at least `30px`–`36px` touch/click height across viewports.
- **Primary:** Solid `accent-action` fill with `accent-contrast` foreground for affirmative runbook application, probe launch, or chaos injection; disabled cleanly when Demo Persona lacks RBAC permission (`Viewer` or out-of-zone `Operator`).
- **Secondary / Ghost:** `inset-*` background with `1px` `border-subtle-*` border tightening to `border-strong-*` on hover and `2px solid accent-action` focus ring on keyboard `:focus-visible`.

### Chips
- **Style:** Pill geometry (`9999px`) using translucent or inset backgrounds paired with `1px` border and semantic foreground text (`state-flow*`, `state-heavy*`, `state-gridlock*`, `state-emergency*`).
- **State:** Selected filter chips flip to `accent-action` outline/tint with `aria-pressed="true"` on controller selectors and adaptive-loss filters.

### Cards / Containers
- **Corner Style:** `8px` outer container (`.console-panel`), `6px` inner metric tile (`.console-inset`).
- **Background:** `surface-*` outer container over `ground-*` canvas; `inset-*` nested blocks.
- **Shadow Strategy:** None at rest; refer to Elevation & Depth.
- **Border:** `1px solid` `border-subtle-*` (promoting to `border-strong-*` when hovered or interactive).
- **Internal Padding:** `14px` on standard panels (`p-3.5`), `10px`–`12px` on compact telemetry cards.

### Inputs / Fields
- **Style:** `inset-*` fill with `1px` `border-subtle-*` stroke, `4px` radius, `max-w-full min-w-0 truncate` constraint on `<select>` pickers to prevent `390px` viewport blowout.
- **Focus:** Universal `*:focus-visible` `2px` outline in `accent-action` with `2px` offset (never stripped with `outline-none`).
- **Disabled:** Reduced opacity and descriptive RBAC tooltip/notice when persona lacks mutation privileges.

### Navigation
- **Style & Keyboard Behavior:** Horizontal desktop `tablist` (`min-h-[52px]`) and compact wrap-safe mobile `tablist` supporting Left/Right Arrow, Home, and End keyboard traversal with managed `tabIndex` and clear active bottom/fill highlight.

### Intersection & Telemetry Instruments
- **4-Arm Intersection SVG:** Scaled `500x310` SVG schematic rendering dynamic queue lengths along North/South/East/West approaches, signal phase badges, countdown seconds, and symmetric East/West metrics without label collision.
- **Wire Stream Tap & Trace Waterfall:** `React.memo`-isolated inspector tapping bounded 10 Hz `TelemetryHotStore` frames alongside a millisecond ruler-aligned OpenTelemetry waterfall linking HTTP/Ingest spans to batched Atlas flush spans.

## Do's and Don'ts

### Do:
- **Do** enforce `.tabular-nums` (`JetBrains Mono`) on every dynamically updating rate, byte size, countdown, and latency percentile.
- **Do** label simulation provenance (`Simulated (physics model)`), paired baseline attribution (`vs Webster-tuned fixed-time plan, same simulated arrivals`), and discrete `K`-rollout confidence ratios (`improvedRollouts/K` + 90% interval) directly adjacent to metrics.
- **Do** honor `prefers-reduced-motion: reduce` globally and keep 10 Hz telemetry updates isolated behind `useSyncExternalStore` hooks (`useSocketStats`, `useJunctionLive`, `useRecentFrames`).
- **Do** disable and explain role-restricted actions client-side using `useAuth()` zone/role checks matching backend JWT enforcement.

### Don't:
- **Don't** invent literal numbers, fake accuracy percentages, or synthetic placeholder nodes anywhere in JSX.
- **Don't** use frosted glassmorphism, neon glow shadows, animated pulse rings on idle UI, or multi-stop gradient card backgrounds.
- **Don't** omit `min-w-0` on grid/flex children wrapping `<select>` elements, tables, or long trace IDs at mobile widths.
- **Don't** suppress focus indicators (`outline: none` / `focus:outline-none`) without restoring a compliant visible ring.
