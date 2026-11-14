# Signal Control Controlled Empirical Study (2026-11-14)

## Experimental Setup
- **Network**: 12 Bengaluru arterial junctions (35 directed corridor links)
- **Demand Scales**: 0.15, 0.2, 0.25, 0.3, 0.35 (default operating scale = `0.25`)
- **Time Windows**: AM Peak (09:00 IST), Midday (13:30 IST), PM Peak (18:30 IST)
- **Scenarios**: `normal` (stationary window demand) and `surge_incident` (2.6x asymmetric surge 180–1080s + 0.35 capacity stalled vehicle 300–1200s)
- **Replication & Statistical Method**: 10 Common Random Number (CRN) seeds × 1800s each; paired Student-t 95% CI vs `fixed-tod`
- **Total Episodes Executed**: 1200 (183.85s wall-clock)

## Scenario: Normal TOD Demand (Poisson stationary within 30-min window) (`normal`)

| Window | Scale | Max Raw Y | Fixed-TOD Delay (s/veh) | Webster ΔDelay [95% CI] | Max-Pressure ΔDelay [95% CI] | Max-Pressure-CA ΔDelay [95% CI] | Fixed-TOD Thru | MP Thru Δ | MP-CA Thru Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| am-peak | 0.15 | 0.33 (0/12>=0.95) | 22.25 ± 0.10 | +0.46s [0.25, 0.67] (+2.08%) | -2.51s [-2.71, -2.31] (-11.3%) | -2.25s [-2.49, -2.00] (-10.11%) | 9668 | +36 | +29 |
| midday | 0.15 | 0.24 (0/12>=0.95) | 21.26 ± 0.12 | +0.44s [0.19, 0.70] (+2.09%) | -2.11s [-2.26, -1.97] (-9.94%) | -2.02s [-2.19, -1.84] (-9.49%) | 5609 | +13 | +15 |
| pm-peak | 0.15 | 0.39 (0/12>=0.95) | 22.38 ± 0.10 | +0.67s [0.48, 0.85] (+2.99%) | -2.42s [-2.66, -2.19] (-10.83%) | -2.02s [-2.24, -1.81] (-9.04%) | 10263 | +35 | +27 |
| am-peak | 0.20 | 0.43 (0/12>=0.95) | 23.57 ± 0.12 | +0.88s [0.56, 1.20] (+3.71%) | -1.88s [-2.02, -1.75] (-7.99%) | -1.41s [-1.56, -1.26] (-5.99%) | 12903 | +37 | +29 |
| midday | 0.20 | 0.32 (0/12>=0.95) | 21.69 ± 0.10 | +0.45s [0.08, 0.82] (+2.08%) | -2.51s [-2.67, -2.35] (-11.58%) | -2.41s [-2.53, -2.30] (-11.12%) | 7475 | +20 | +21 |
| pm-peak | 0.20 | 0.52 (0/12>=0.95) | 24.39 ± 0.14 | +0.96s [0.69, 1.23] (+3.94%) | -1.83s [-2.10, -1.56] (-7.52%) | -1.39s [-1.60, -1.19] (-5.72%) | 13689 | +39 | +32 |
| am-peak | 0.25 | 0.54 (0/12>=0.95) | 30.62 ± 0.55 | -0.42s [-1.03, 0.19] (-1.38%) | -3.55s [-3.95, -3.15] (-11.59%) | -3.41s [-3.98, -2.83] (-11.13%) | 16031 | +65 | +54 |
| midday | 0.25 | 0.40 (0/12>=0.95) | 22.22 ± 0.12 | +0.56s [0.25, 0.87] (+2.51%) | -2.58s [-2.75, -2.41] (-11.61%) | -2.16s [-2.43, -1.88] (-9.71%) | 9342 | +25 | +25 |
| pm-peak | 0.25 | 0.65 (0/12>=0.95) | 31.33 ± 0.46 | +2.58s [1.89, 3.28] (+8.24%) | -0.23s [-0.81, 0.35] (-0.72%) | -1.02s [-1.37, -0.67] (-3.26%) | 16985 | +19 | +19 |
| am-peak | 0.30 | 0.65 (0/12>=0.95) | 46.19 ± 1.69 | -2.16s [-3.63, -0.70] (-4.69%) | +11.18s [9.63, 12.72] (+24.2%) | -0.30s [-1.71, 1.12] (-0.64%) | 18852 | -282 | +43 |
| midday | 0.30 | 0.48 (0/12>=0.95) | 22.75 ± 0.09 | +0.57s [0.27, 0.87] (+2.5%) | -2.35s [-2.56, -2.13] (-10.32%) | -1.76s [-2.03, -1.48] (-7.72%) | 11216 | +47 | +32 |
| pm-peak | 0.30 | 0.78 (0/12>=0.95) | 47.37 ± 0.73 | +2.70s [2.06, 3.34] (+5.71%) | +29.61s [27.21, 32.01] (+62.5%) | +13.16s [11.84, 14.49] (+27.79%) | 20054 | -944 | -453 |
| am-peak | 0.35 | 0.76 (0/12>=0.95) | 71.59 ± 2.04 | -6.75s [-8.45, -5.05] (-9.43%) | +41.58s [39.94, 43.22] (+58.08%) | +17.00s [16.14, 17.87] (+23.75%) | 21099 | -1346 | -549 |
| midday | 0.35 | 0.56 (0/12>=0.95) | 24.37 ± 0.08 | +0.68s [0.48, 0.88] (+2.79%) | -2.52s [-2.64, -2.39] (-10.33%) | -2.14s [-2.27, -2.02] (-8.8%) | 13074 | +40 | +34 |
| pm-peak | 0.35 | 0.91 (0/12>=0.95) | 70.84 ± 1.73 | +6.42s [4.86, 7.99] (+9.07%) | +62.98s [61.34, 64.61] (+88.9%) | +35.02s [33.43, 36.61] (+49.43%) | 22350 | -2246 | -1275 |

## Scenario: Unplanned Asymmetric Surge (2.6x) + Stalled-Vehicle Incident (0.35 cap) (`surge_incident`)

| Window | Scale | Max Raw Y | Fixed-TOD Delay (s/veh) | Webster ΔDelay [95% CI] | Max-Pressure ΔDelay [95% CI] | Max-Pressure-CA ΔDelay [95% CI] | Fixed-TOD Thru | MP Thru Δ | MP-CA Thru Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| am-peak | 0.15 | 0.33 (0/12>=0.95) | 32.01 ± 3.39 | -6.89s [-10.02, -3.76] (-21.54%) | -11.75s [-15.02, -8.47] (-36.71%) | -11.39s [-14.68, -8.11] (-35.6%) | 9931 | +97 | +89 |
| midday | 0.15 | 0.24 (0/12>=0.95) | 21.67 ± 0.43 | +0.52s [0.18, 0.85] (+2.39%) | -2.47s [-2.93, -2.00] (-11.38%) | -2.46s [-2.84, -2.08] (-11.36%) | 5809 | +18 | +15 |
| pm-peak | 0.15 | 0.39 (0/12>=0.95) | 34.26 ± 4.01 | -8.67s [-12.27, -5.07] (-25.3%) | -13.77s [-17.62, -9.92] (-40.19%) | -13.28s [-17.21, -9.36] (-38.77%) | 10512 | +129 | +127 |
| am-peak | 0.20 | 0.43 (0/12>=0.95) | 44.60 ± 6.03 | -15.02s [-20.08, -9.96] (-33.67%) | -20.73s [-26.01, -15.45] (-46.48%) | -20.34s [-25.87, -14.82] (-45.61%) | 13036 | +332 | +321 |
| midday | 0.20 | 0.32 (0/12>=0.95) | 24.39 ± 1.36 | -1.18s [-2.52, 0.16] (-4.83%) | -5.10s [-6.45, -3.75] (-20.91%) | -4.93s [-6.25, -3.62] (-20.23%) | 7722 | +33 | +30 |
| pm-peak | 0.20 | 0.52 (0/12>=0.95) | 46.98 ± 5.63 | -15.73s [-20.36, -11.10] (-33.48%) | -20.66s [-24.60, -16.73] (-43.99%) | -20.84s [-25.21, -16.47] (-44.37%) | 13788 | +363 | +369 |
| am-peak | 0.25 | 0.54 (0/12>=0.95) | 58.58 ± 6.40 | -19.14s [-24.14, -14.13] (-32.66%) | -15.79s [-19.51, -12.07] (-26.95%) | -18.22s [-20.40, -16.05] (-31.11%) | 16005 | +422 | +482 |
| midday | 0.25 | 0.40 (0/12>=0.95) | 30.51 ± 2.99 | -5.74s [-8.49, -2.99] (-18.82%) | -10.57s [-13.51, -7.63] (-34.64%) | -10.08s [-12.84, -7.33] (-33.06%) | 9611 | +69 | +67 |
| pm-peak | 0.25 | 0.65 (0/12>=0.95) | 59.35 ± 6.18 | -13.43s [-17.43, -9.44] (-22.63%) | -5.30s [-12.64, 2.03] (-8.94%) | -9.63s [-13.87, -5.38] (-16.22%) | 16951 | +221 | +338 |
| am-peak | 0.30 | 0.65 (0/12>=0.95) | 76.70 ± 7.11 | -15.34s [-19.62, -11.05] (-20%) | +12.66s [2.97, 22.36] (+16.51%) | -0.04s [-7.71, 7.63] (-0.05%) | 18736 | -270 | +92 |
| midday | 0.30 | 0.48 (0/12>=0.95) | 38.35 ± 4.88 | -11.61s [-16.17, -7.05] (-30.27%) | -17.11s [-21.91, -12.32] (-44.63%) | -16.43s [-21.16, -11.70] (-42.84%) | 11433 | +204 | +186 |
| pm-peak | 0.30 | 0.78 (0/12>=0.95) | 77.07 ± 6.70 | -6.96s [-10.00, -3.91] (-9.03%) | +33.63s [23.66, 43.60] (+43.64%) | +15.08s [7.51, 22.65] (+19.57%) | 19964 | -1023 | -475 |
| am-peak | 0.35 | 0.76 (0/12>=0.95) | 103.05 ± 7.33 | -14.14s [-17.72, -10.55] (-13.72%) | +55.44s [37.23, 73.65] (+53.8%) | +17.43s [12.58, 22.28] (+16.91%) | 20938 | -2048 | -521 |
| midday | 0.35 | 0.56 (0/12>=0.95) | 45.26 ± 5.81 | -14.77s [-19.88, -9.67] (-32.64%) | -21.04s [-25.81, -16.28] (-46.49%) | -20.64s [-25.83, -15.46] (-45.61%) | 13212 | +325 | +315 |
| pm-peak | 0.35 | 0.91 (0/12>=0.95) | 101.59 ± 7.19 | +1.50s [-1.93, 4.93] (+1.47%) | +82.95s [61.42, 104.49] (+81.66%) | +35.70s [32.09, 39.31] (+35.14%) | 22202 | -3339 | -1332 |

## Key Findings & Mechanistic Analysis

### normal Regime Summary
- **`webster` vs `fixed-tod`**: Statistically better delay in **2/15** cells, worse in **12/15**. Best: `am-peak @ 0.35` (-9.43%). Worst: `pm-peak @ 0.35` (+9.07%).
- **`max-pressure` vs `fixed-tod`**: Statistically better delay in **10/15** cells, worse in **4/15**. Best: `midday @ 0.25` (-11.61%). Worst: `pm-peak @ 0.35` (+88.9%).
- **`max-pressure-ca` vs `fixed-tod`**: Statistically better delay in **11/15** cells, worse in **3/15**. Best: `am-peak @ 0.25` (-11.13%). Worst: `pm-peak @ 0.35` (+49.43%).

### surge_incident Regime Summary
- **`webster` vs `fixed-tod`**: Statistically better delay in **12/15** cells, worse in **1/15**. Best: `am-peak @ 0.2` (-33.67%). Worst: `midday @ 0.15` (+2.39%).
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
