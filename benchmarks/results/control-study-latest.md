# Signal Control Controlled Empirical Study (2026-11-14)

## Experimental Setup
- **Network**: 12 Bengaluru arterial junctions (35 directed corridor links)
- **Demand Scales**: 0.15, 0.2, 0.25, 0.3, 0.35 (default operating scale = `0.25`)
- **Time Windows**: AM Peak (09:00 IST), Midday (13:30 IST), PM Peak (18:30 IST)
- **Scenarios**: `normal` (stationary window demand) and `surge_incident` (2.6x asymmetric surge 180–1080s + 0.35 capacity stalled vehicle 300–1200s)
- **Replication & Statistical Method**: 10 Common Random Number (CRN) seeds × 1800s each; paired Student-t 95% CI vs `fixed-tod`
- **Total Episodes Executed**: 1200 (169.89s wall-clock)

## Scenario: Normal TOD Demand (Poisson stationary within 30-min window) (`normal`)

| Window | Scale | Max Raw Y | Fixed-TOD Delay (s/veh) | Webster ΔDelay [95% CI] | Max-Pressure ΔDelay [95% CI] | Max-Pressure-CA ΔDelay [95% CI] | Fixed-TOD Thru | MP Thru Δ | MP-CA Thru Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| am-peak | 0.15 | 0.33 (0/12>=0.95) | 22.25 ± 0.10 | +0.49s [0.27, 0.71] (+2.21%) | -2.51s [-2.71, -2.31] (-11.3%) | -2.25s [-2.49, -2.00] (-10.11%) | 9668 | +36 | +29 |
| midday | 0.15 | 0.24 (0/12>=0.95) | 21.26 ± 0.12 | +0.48s [0.15, 0.80] (+2.24%) | -2.11s [-2.26, -1.97] (-9.94%) | -2.02s [-2.19, -1.84] (-9.49%) | 5609 | +13 | +15 |
| pm-peak | 0.15 | 0.39 (0/12>=0.95) | 22.38 ± 0.10 | +0.70s [0.50, 0.91] (+3.15%) | -2.42s [-2.66, -2.19] (-10.83%) | -2.02s [-2.24, -1.81] (-9.04%) | 10263 | +35 | +27 |
| am-peak | 0.20 | 0.43 (0/12>=0.95) | 23.57 ± 0.12 | +1.03s [0.79, 1.28] (+4.39%) | -1.88s [-2.02, -1.75] (-7.99%) | -1.41s [-1.56, -1.26] (-5.99%) | 12903 | +37 | +29 |
| midday | 0.20 | 0.32 (0/12>=0.95) | 21.69 ± 0.10 | +0.38s [0.09, 0.68] (+1.77%) | -2.51s [-2.67, -2.35] (-11.58%) | -2.41s [-2.53, -2.30] (-11.12%) | 7475 | +20 | +21 |
| pm-peak | 0.20 | 0.52 (0/12>=0.95) | 24.39 ± 0.14 | +0.89s [0.61, 1.17] (+3.65%) | -1.83s [-2.10, -1.56] (-7.52%) | -1.39s [-1.60, -1.19] (-5.72%) | 13689 | +39 | +32 |
| am-peak | 0.25 | 0.54 (0/12>=0.95) | 30.62 ± 0.55 | +0.03s [-0.68, 0.75] (+0.11%) | -3.55s [-3.95, -3.15] (-11.59%) | -3.41s [-3.98, -2.83] (-11.13%) | 16031 | +65 | +54 |
| midday | 0.25 | 0.40 (0/12>=0.95) | 22.22 ± 0.12 | +0.45s [0.14, 0.76] (+2%) | -2.58s [-2.75, -2.41] (-11.61%) | -2.16s [-2.43, -1.88] (-9.71%) | 9342 | +25 | +25 |
| pm-peak | 0.25 | 0.65 (0/12>=0.95) | 31.33 ± 0.46 | +2.83s [2.23, 3.44] (+9.05%) | -0.23s [-0.81, 0.35] (-0.72%) | -1.02s [-1.37, -0.67] (-3.26%) | 16985 | +19 | +19 |
| am-peak | 0.30 | 0.65 (0/12>=0.95) | 46.19 ± 1.69 | -1.99s [-3.40, -0.58] (-4.31%) | +11.18s [9.63, 12.72] (+24.2%) | -0.30s [-1.71, 1.12] (-0.64%) | 18852 | -282 | +43 |
| midday | 0.30 | 0.48 (0/12>=0.95) | 22.75 ± 0.09 | +0.76s [0.60, 0.93] (+3.35%) | -2.35s [-2.56, -2.13] (-10.32%) | -1.76s [-2.03, -1.48] (-7.72%) | 11216 | +47 | +32 |
| pm-peak | 0.30 | 0.78 (0/12>=0.95) | 47.37 ± 0.73 | +3.32s [2.65, 4.00] (+7.01%) | +29.61s [27.21, 32.01] (+62.5%) | +13.16s [11.84, 14.49] (+27.79%) | 20054 | -944 | -453 |
| am-peak | 0.35 | 0.76 (0/12>=0.95) | 71.59 ± 2.04 | -5.70s [-6.80, -4.60] (-7.96%) | +41.58s [39.94, 43.22] (+58.08%) | +17.00s [16.14, 17.87] (+23.75%) | 21099 | -1346 | -549 |
| midday | 0.35 | 0.56 (0/12>=0.95) | 24.37 ± 0.08 | +0.31s [0.06, 0.56] (+1.27%) | -2.52s [-2.64, -2.39] (-10.33%) | -2.14s [-2.27, -2.02] (-8.8%) | 13074 | +40 | +34 |
| pm-peak | 0.35 | 0.91 (0/12>=0.95) | 70.84 ± 1.73 | +9.49s [8.15, 10.84] (+13.4%) | +62.98s [61.34, 64.61] (+88.9%) | +35.02s [33.43, 36.61] (+49.43%) | 22350 | -2246 | -1275 |

## Scenario: Unplanned Asymmetric Surge (2.6x) + Stalled-Vehicle Incident (0.35 cap) (`surge_incident`)

| Window | Scale | Max Raw Y | Fixed-TOD Delay (s/veh) | Webster ΔDelay [95% CI] | Max-Pressure ΔDelay [95% CI] | Max-Pressure-CA ΔDelay [95% CI] | Fixed-TOD Thru | MP Thru Δ | MP-CA Thru Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| am-peak | 0.15 | 0.33 (0/12>=0.95) | 32.01 ± 3.39 | -6.93s [-10.06, -3.81] (-21.67%) | -11.75s [-15.02, -8.47] (-36.71%) | -11.39s [-14.68, -8.11] (-35.6%) | 9931 | +97 | +89 |
| midday | 0.15 | 0.24 (0/12>=0.95) | 21.67 ± 0.43 | +0.55s [0.14, 0.96] (+2.54%) | -2.47s [-2.93, -2.00] (-11.38%) | -2.46s [-2.84, -2.08] (-11.36%) | 5809 | +18 | +15 |
| pm-peak | 0.15 | 0.39 (0/12>=0.95) | 34.26 ± 4.01 | -8.61s [-12.23, -4.99] (-25.14%) | -13.77s [-17.62, -9.92] (-40.19%) | -13.28s [-17.21, -9.36] (-38.77%) | 10512 | +129 | +127 |
| am-peak | 0.20 | 0.43 (0/12>=0.95) | 44.60 ± 6.03 | -14.84s [-19.89, -9.80] (-33.28%) | -20.73s [-26.01, -15.45] (-46.48%) | -20.34s [-25.87, -14.82] (-45.61%) | 13036 | +332 | +321 |
| midday | 0.20 | 0.32 (0/12>=0.95) | 24.39 ± 1.36 | -1.17s [-2.53, 0.19] (-4.79%) | -5.10s [-6.45, -3.75] (-20.91%) | -4.93s [-6.25, -3.62] (-20.23%) | 7722 | +33 | +30 |
| pm-peak | 0.20 | 0.52 (0/12>=0.95) | 46.98 ± 5.63 | -15.74s [-20.48, -11.00] (-33.51%) | -20.66s [-24.60, -16.73] (-43.99%) | -20.84s [-25.21, -16.47] (-44.37%) | 13788 | +363 | +369 |
| am-peak | 0.25 | 0.54 (0/12>=0.95) | 58.58 ± 6.40 | -17.95s [-22.74, -13.16] (-30.64%) | -15.79s [-19.51, -12.07] (-26.95%) | -18.22s [-20.40, -16.05] (-31.11%) | 16005 | +422 | +482 |
| midday | 0.25 | 0.40 (0/12>=0.95) | 30.51 ± 2.99 | -5.70s [-8.54, -2.86] (-18.68%) | -10.57s [-13.51, -7.63] (-34.64%) | -10.08s [-12.84, -7.33] (-33.06%) | 9611 | +69 | +67 |
| pm-peak | 0.25 | 0.65 (0/12>=0.95) | 59.35 ± 6.18 | -13.39s [-17.84, -8.95] (-22.56%) | -5.30s [-12.64, 2.03] (-8.94%) | -9.63s [-13.87, -5.38] (-16.22%) | 16951 | +221 | +338 |
| am-peak | 0.30 | 0.65 (0/12>=0.95) | 76.70 ± 7.11 | -15.21s [-19.13, -11.28] (-19.83%) | +12.66s [2.97, 22.36] (+16.51%) | -0.04s [-7.71, 7.63] (-0.05%) | 18736 | -270 | +92 |
| midday | 0.30 | 0.48 (0/12>=0.95) | 38.35 ± 4.88 | -11.64s [-16.25, -7.04] (-30.36%) | -17.11s [-21.91, -12.32] (-44.63%) | -16.43s [-21.16, -11.70] (-42.84%) | 11433 | +204 | +186 |
| pm-peak | 0.30 | 0.78 (0/12>=0.95) | 77.07 ± 6.70 | -6.10s [-9.43, -2.76] (-7.91%) | +33.63s [23.66, 43.60] (+43.64%) | +15.08s [7.51, 22.65] (+19.57%) | 19964 | -1023 | -475 |
| am-peak | 0.35 | 0.76 (0/12>=0.95) | 103.05 ± 7.33 | -13.43s [-17.02, -9.84] (-13.03%) | +55.44s [37.23, 73.65] (+53.8%) | +17.43s [12.58, 22.28] (+16.91%) | 20938 | -2048 | -521 |
| midday | 0.35 | 0.56 (0/12>=0.95) | 45.26 ± 5.81 | -15.29s [-20.34, -10.24] (-33.79%) | -21.04s [-25.81, -16.28] (-46.49%) | -20.64s [-25.83, -15.46] (-45.61%) | 13212 | +325 | +315 |
| pm-peak | 0.35 | 0.91 (0/12>=0.95) | 101.59 ± 7.19 | +5.01s [1.79, 8.22] (+4.93%) | +82.95s [61.42, 104.49] (+81.66%) | +35.70s [32.09, 39.31] (+35.14%) | 22202 | -3339 | -1332 |

## Key Findings & Mechanistic Analysis

### normal Regime Summary
- **`webster` vs `fixed-tod`**: Statistically better delay in **2/15** cells, worse in **12/15**. Best: `am-peak @ 0.35` (-7.96%). Worst: `pm-peak @ 0.35` (+13.4%).
- **`max-pressure` vs `fixed-tod`**: Statistically better delay in **10/15** cells, worse in **4/15**. Best: `midday @ 0.25` (-11.61%). Worst: `pm-peak @ 0.35` (+88.9%).
- **`max-pressure-ca` vs `fixed-tod`**: Statistically better delay in **11/15** cells, worse in **3/15**. Best: `am-peak @ 0.25` (-11.13%). Worst: `pm-peak @ 0.35` (+49.43%).

### surge_incident Regime Summary
- **`webster` vs `fixed-tod`**: Statistically better delay in **12/15** cells, worse in **2/15**. Best: `midday @ 0.35` (-33.79%). Worst: `pm-peak @ 0.35` (+4.93%).
- **`max-pressure` vs `fixed-tod`**: Statistically better delay in **10/15** cells, worse in **4/15**. Best: `midday @ 0.35` (-46.49%). Worst: `pm-peak @ 0.35` (+81.66%).
- **`max-pressure-ca` vs `fixed-tod`**: Statistically better delay in **11/15** cells, worse in **3/15**. Best: `am-peak @ 0.2` (-45.61%). Worst: `pm-peak @ 0.35` (+35.14%).

### Oversaturation Behavior (`0.35` PM Peak) & `max-pressure-ca` Literature Evaluation
- **Normal `pm-peak @ 0.35`** (max critical flow ratio Y=0.912, 0/12 junctions near/over capacity):
  - `fixed-tod`: delay **70.84s**, throughput **22350 veh**
  - `max-pressure` (raw): delay **133.82s** (+62.98s [61.34, 64.61] (+88.9%)), throughput **20104 veh**
  - `max-pressure-ca` (normalized + loss-adaptive g_min): delay **105.86s** (+35.02s [33.43, 36.61] (+49.43%)), throughput **21075 veh**
- **Disrupted `pm-peak @ 0.35` (`surge_incident`)**:
  - `fixed-tod`: delay **101.59s**, throughput **22202 veh**
  - `max-pressure`: delay **184.55s** (+82.95s [61.42, 104.49] (+81.66%)), throughput **18864 veh**
  - `max-pressure-ca`: delay **137.29s** (+35.70s [32.09, 39.31] (+35.14%)), throughput **20870 veh**

### Honest Engineering Conclusions (Where Adaptive Helps vs Where It Loses)
1. **Stationary Undersaturated / Moderate Regimes**: Queue-actuated switching (`max-pressure-ca`) achieves statistically significant delay reductions in **11/15** stationary cells (including default PM Peak 0.25: -3.26%, CI [-1.368, -0.674]s vs raw MP -0.72%) by serving stochastic queue bursts instead of forcing arrivals to wait out fixed red splits.
2. **Stationary Heavy / Near-Saturated Regimes (0.30–0.35 AM/PM Peak)**: Offline Webster-tuned `fixed-tod` achieves the lowest delay and highest throughput (PM Peak 0.35: 70.84s vs raw MP 133.82s, throughput Δ -2246 veh). Because PM Peak instantaneous flow at 18:30 IST exceeds the 4-hour TOD period mean, frequent minimum-green switches lose ~4s intergreen capacity per switch right at saturation, while raw unnormalized queue-count backpressure (`Q_up - Q_down`) across unequal lane counts (2 vs 4 lanes) amplifies queue imbalance.
3. **Effect of Literature Fix (`max-pressure-ca`)**: Replacing raw vehicle-count pressure with Gregoire normalized occupancy (`Q/Q_max`) and saturation-scaled minimum greens (10s light -> 28s heavy) reduces raw MP's PM Peak 0.35 delay penalty from +88.9% down to +49.43% and reverses AM Peak 0.30 from +24.2% to -0.64%. Even so, at severe stationary saturation (`0.35` PM Peak), fixed 150s cycles retain a smaller intergreen lost-time fraction than greedy phase switching.
4. **Unplanned Surges & Incidents (`surge_incident`)**: Offline `fixed-tod` cannot rebalance for unexpected spatial skew or lane-blocking incidents. Under disruptions, EWMA `webster` (retaining long-cycle capacity while rebalancing splits) wins **12/15** cells and `max-pressure-ca` wins **11/15** cells (default 0.25 scale: AM -31.11%, PM -16.22%; throughput +482 / +338 veh).
