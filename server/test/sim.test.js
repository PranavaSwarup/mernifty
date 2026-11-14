import test from 'node:test';
import assert from 'node:assert';
import {
  FixedTimeController,
  WebsterController,
  MaxPressureController,
  AutoSupervisoryController,
  computeWebsterPlan,
} from '../src/sim/controllers.js';
import { loadStudyPolicy } from '../src/sim/studyPolicy.js';
import { demandFactor } from '../src/sim/demand.js';
import {
  buildNetwork,
  DEFAULT_NETWORK,
  FREE_FLOW_SPEED_KMPH,
  MIN_SPEED_KMPH,
} from '../src/sim/network.js';
import { TrafficWorld, EMERGENCY_WEAVING_SPEED_KMPH } from '../src/sim/engine.js';
import { CounterfactualPair } from '../src/sim/twin.js';
import {
  simulatorService,
  resolveInitialSimStart,
  SCENARIO_PRESETS,
} from '../src/services/simulatorService.js';
import { copilotService } from '../src/services/copilotService.js';

// Evening peak timestamp in Bengaluru: 19:00 IST (13:30 UTC)
const EVENING_PEAK_START = '2026-11-14T13:30:00.000Z';

test('1. Determinism: two worlds with identical seed produce identical snapshots after 600 steps', () => {
  const w1 = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'max-pressure',
    startTime: EVENING_PEAK_START,
  });
  const w2 = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'max-pressure',
    startTime: EVENING_PEAK_START,
  });

  for (let i = 0; i < 600; i++) {
    w1.step();
    w2.step();
  }

  assert.deepStrictEqual(w1.snapshot(), w2.snapshot());
});

test('2. Conservation: arrived === departed + queued on every approach at every step for 600 steps', () => {
  const world = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'webster',
    startTime: EVENING_PEAK_START,
  });

  for (let step = 1; step <= 600; step++) {
    world.step();
    for (let idx = 0; idx < world.totalApproaches; idx++) {
      const arrived = world.totalArrived[idx];
      const accounted = world.totalDeparted[idx] + world.queueVeh[idx];
      assert.ok(
        Math.abs(arrived - accounted) < 1e-6,
        `Conservation violated at step ${step}, approach ${idx}: arrived=${arrived}, departed+queued=${accounted}`
      );
    }
  }
});

test('3. Common Random Numbers: live (MaxPressure) and baseline (FixedTime) have identical external arrivals after 900 steps', () => {
  const pair = new CounterfactualPair({
    seed: 20261114,
    startTime: EVENING_PEAK_START,
    liveControllerFactory: 'max-pressure',
  });

  for (let i = 0; i < 900; i++) {
    pair.step();
  }

  for (let idx = 0; idx < pair.live.totalApproaches; idx++) {
    assert.strictEqual(
      pair.live.totalExternalArrived[idx],
      pair.baseline.totalExternalArrived[idx],
      `External arrivals diverged on approach ${idx}`
    );
  }
});

test('4. Webster Controller: cycle and splits match hand-computed optimal plan within 1 s', () => {
  // Hand-computed 4-phase example:
  //   Saturation per approach: S = [1.5, 2.0, 1.5, 1.0] veh/s (lanes [3, 4, 3, 2] * 0.5 veh/s/lane)
  //   Arrival flows:           q = [0.45, 0.40, 0.225, 0.10] veh/s
  //   Flow ratios:             y = q / S = [0.30, 0.20, 0.15, 0.10]
  //   Total critical ratio:    Y = 0.75 (<= 0.90)
  //   Total lost time (4 * 4s): L = 16 s
  //   Optimal cycle:           C0 = (1.5 * 16 + 5) / (1 - 0.75) = 29 / 0.25 = 116 s
  //   Effective green budget:  C0 - L = 100 s
  //   Splits:                  g = [round(0.30/0.75 * 100), round(0.20/0.75 * 100), round(0.15/0.75 * 100), round(0.10/0.75 * 100)]
  //                              = [40, 27, 20, 13] s
  const plan = computeWebsterPlan({
    flowRatios: [0.3, 0.2, 0.15, 0.1],
    intergreenSec: 4,
    minCycleSec: 45,
    maxCycleSec: 150,
    minGreenSec: 10,
    maxGreenSec: 60,
  });

  assert.ok(Math.abs(plan.cycleSec - 116) <= 1, `Expected cycle ~116s, got ${plan.cycleSec}`);
  const expectedSplits = [40, 27, 20, 13];
  for (let i = 0; i < 4; i++) {
    assert.ok(
      Math.abs(plan.splits[i] - expectedSplits[i]) <= 1,
      `Split ${i}: expected ${expectedSplits[i]}s, got ${plan.splits[i]}s`
    );
  }

  // Also test live WebsterController convergence across cycles under constant arrival rates
  const mockJunction = {
    approaches: [
      { lanes: 3, saturationFlowPerSec: 1.5, baseDemandPerSec: 0.45 },
      { lanes: 4, saturationFlowPerSec: 2.0, baseDemandPerSec: 0.4 },
      { lanes: 3, saturationFlowPerSec: 1.5, baseDemandPerSec: 0.225 },
      { lanes: 2, saturationFlowPerSec: 1.0, baseDemandPerSec: 0.1 },
    ],
  };
  const ctrl = new WebsterController(mockJunction, { ewmaTimeConstantSec: 15 });
  const constantState = {
    approaches: [
      { arrivalRateVehPerSec: 0.45 },
      { arrivalRateVehPerSec: 0.4 },
      { arrivalRateVehPerSec: 0.225 },
      { arrivalRateVehPerSec: 0.1 },
    ],
  };

  let decision = ctrl.decide(constantState, 0);
  for (let t = 1; t <= 140; t++) {
    decision = ctrl.decide(constantState, t);
  }
  assert.ok(Math.abs(decision.cycleSec - 116) <= 1, `Controller cycle expected ~116s, got ${decision.cycleSec}`);
  for (let i = 0; i < 4; i++) {
    assert.ok(
      Math.abs(decision.splits[i] - expectedSplits[i]) <= 1,
      `Controller split ${i}: expected ${expectedSplits[i]}s, got ${decision.splits[i]}s`
    );
  }
});

test('5. MaxPressure: selects highest pressure phase, respects gmin/gmax, and never switches during intergreen', () => {
  const mockJunction = {
    approaches: [
      { lanes: 2, saturationFlowPerSec: 1.0, greenSplitSec: 30 },
      { lanes: 3, saturationFlowPerSec: 1.5, greenSplitSec: 30 },
      { lanes: 2, saturationFlowPerSec: 1.0, greenSplitSec: 30 },
      { lanes: 2, saturationFlowPerSec: 1.0, greenSplitSec: 30 },
    ],
  };
  const ctrl = new MaxPressureController(mockJunction);

  // Constructed state: phase 1 has vastly higher pressure than current phase 0
  const highP1State = {
    approaches: [
      { queueVeh: 2, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 40, saturationFlowPerSec: 1.5, downstreamPenalty: 0 },
      { queueVeh: 5, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 3, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
    ],
  };

  // Before gmin (10s): must stay on phase 0 and NOT enter intergreen
  let d = ctrl.decide(highP1State, 0);
  for (let t = 1; t <= 9; t++) {
    d = ctrl.decide(highP1State, t);
    assert.strictEqual(d.phaseIndex, 0, `Should stay on phase 0 before gmin at t=${t}`);
    assert.strictEqual(d.inIntergreen, false, `Should not enter intergreen before gmin at t=${t}`);
  }

  // At t = 10s (gmin satisfied), controller evaluates and initiates 4s intergreen toward phase 1
  d = ctrl.decide(highP1State, 10);
  assert.strictEqual(d.inIntergreen, true, 'Should start intergreen switch at gmin=10s');
  assert.strictEqual(d.intergreenRemainingSec, 4);

  // During intergreen (t = 11, 12, 13), even if phase 2 suddenly gets massive pressure, MUST NOT switch target
  const suddenP2State = {
    approaches: [
      { queueVeh: 2, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 5, saturationFlowPerSec: 1.5, downstreamPenalty: 0 },
      { queueVeh: 90, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 3, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
    ],
  };
  for (let t = 11; t <= 13; t++) {
    d = ctrl.decide(suddenP2State, t);
    assert.strictEqual(d.inIntergreen, true, `Must remain in intergreen at t=${t}`);
    assert.strictEqual(d.phaseIndex, 0, `Phase must not jump mid-intergreen at t=${t}`);
  }

  // At t = 14s, intergreen completes and switches to phase 1 (NOT phase 2)
  d = ctrl.decide(suddenP2State, 14);
  assert.strictEqual(d.inIntergreen, false);
  assert.strictEqual(d.phaseIndex, 1, 'Should enter the committed target phase 1 after intergreen');

  // Verify gmax (60s) forces a switch even when current phase still dominates pressure
  const dominantP1State = {
    approaches: [
      { queueVeh: 10, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 80, saturationFlowPerSec: 1.5, downstreamPenalty: 0 },
      { queueVeh: 12, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 8, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
    ],
  };
  for (let t = 15; t < 74; t++) {
    d = ctrl.decide(dominantP1State, t);
    assert.strictEqual(d.phaseIndex, 1);
    assert.strictEqual(d.inIntergreen, false);
  }
  // At t = 74 (14 + 60 = gmax), controller must force switch out of phase 1
  d = ctrl.decide(dominantP1State, 74);
  assert.strictEqual(d.inIntergreen, true, 'Should force intergreen switch at gmax=60s');
});

test('6. Effectiveness vs fixed-tod: empirically supported behavior in stationary vs surge & saturated regimes', () => {
  // Sanity-check demandFactor at evening peak
  const peakMult = demandFactor(EVENING_PEAK_START);
  assert.ok(peakMult >= 1.6 && peakMult <= 1.9, `Evening peak multiplier should be ~1.6-1.9x, got ${peakMult}`);

  const runScenario = ({ ctrlType, startTime = EVENING_PEAK_START, network = DEFAULT_NETWORK, surge = false }) => {
    const world = new TrafficWorld({
      seed: 20261114,
      network,
      controllerFactory: ctrlType,
      startTime,
    });
    if (surge) {
      // Asymmetric demand surge on Silk Board (JNC-BLR-001) Hosur Rd from south (approach 0)
      world.setDemandSurge('JNC-BLR-001', 2.4, 1800, 0);
    }
    for (let t = 0; t < 1800; t++) {
      world.step();
    }
    return world.snapshot();
  };

  // A. Default stationary PM peak (0.25): TOD beats naive catalogue plan, capacity-aware MP beats fixed-tod
  const naivePm = runScenario({ ctrlType: 'fixed-naive' });
  const todPm = runScenario({ ctrlType: 'fixed-tod' });
  const mpCaPm = runScenario({ ctrlType: 'max-pressure-ca' });

  // B. Default stationary AM peak (0.25): both Max-Pressure variants beat fixed-tod
  const AM_PEAK_START = '2026-11-14T03:30:00.000Z';
  const todAm = runScenario({ ctrlType: 'fixed-tod', startTime: AM_PEAK_START });
  const mpAm = runScenario({ ctrlType: 'max-pressure', startTime: AM_PEAK_START });
  const mpCaAm = runScenario({ ctrlType: 'max-pressure-ca', startTime: AM_PEAK_START });

  // C. Unplanned asymmetric Silk Board surge (PM peak 0.25): adaptive controllers strongly beat offline fixed-tod
  const todSurge = runScenario({ ctrlType: 'fixed-tod', surge: true });
  const websterSurge = runScenario({ ctrlType: 'webster', surge: true });
  const mpSurge = runScenario({ ctrlType: 'max-pressure', surge: true });
  const mpCaSurge = runScenario({ ctrlType: 'max-pressure-ca', surge: true });

  // D. Near-saturated stationary PM peak (0.35): literature fix max-pressure-ca halves raw MP degradation,
  //    while offline 150s-cycle fixed-tod holds lowest delay under heavy saturation
  const net035 = buildNetwork({ demandScale: 0.35 });
  const todSat = runScenario({ ctrlType: 'fixed-tod', network: net035 });
  const mpSat = runScenario({ ctrlType: 'max-pressure', network: net035 });
  const mpCaSat = runScenario({ ctrlType: 'max-pressure-ca', network: net035 });

  console.log('[Effectiveness 1800s vs Fixed-TOD]');
  console.log(`  PM@0.25 Normal:     fixed-naive=${naivePm.network.avgDelayPerVehSec}s, fixed-tod=${todPm.network.avgDelayPerVehSec}s, max-pressure-ca=${mpCaPm.network.avgDelayPerVehSec}s`);
  console.log(`  AM@0.25 Normal:     fixed-tod=${todAm.network.avgDelayPerVehSec}s, max-pressure=${mpAm.network.avgDelayPerVehSec}s, max-pressure-ca=${mpCaAm.network.avgDelayPerVehSec}s`);
  console.log(`  PM@0.25 SB-Surge:   fixed-tod=${todSurge.network.avgDelayPerVehSec}s, webster=${websterSurge.network.avgDelayPerVehSec}s, max-pressure=${mpSurge.network.avgDelayPerVehSec}s, max-pressure-ca=${mpCaSurge.network.avgDelayPerVehSec}s`);
  console.log(`  PM@0.35 Saturated:  fixed-tod=${todSat.network.avgDelayPerVehSec}s, max-pressure=${mpSat.network.avgDelayPerVehSec}s, max-pressure-ca=${mpCaSat.network.avgDelayPerVehSec}s`);

  assert.ok(
    todPm.network.avgDelayPerVehSec < naivePm.network.avgDelayPerVehSec * 0.7,
    `Expected fixed-tod (${todPm.network.avgDelayPerVehSec}s) << fixed-naive (${naivePm.network.avgDelayPerVehSec}s)`
  );
  assert.ok(
    mpCaPm.network.avgDelayPerVehSec < todPm.network.avgDelayPerVehSec,
    `Expected max-pressure-ca (${mpCaPm.network.avgDelayPerVehSec}s) < fixed-tod (${todPm.network.avgDelayPerVehSec}s) at PM@0.25`
  );
  assert.ok(
    mpAm.network.avgDelayPerVehSec < todAm.network.avgDelayPerVehSec &&
      mpCaAm.network.avgDelayPerVehSec < todAm.network.avgDelayPerVehSec,
    `Expected MP (${mpAm.network.avgDelayPerVehSec}s) and MP-CA (${mpCaAm.network.avgDelayPerVehSec}s) < fixed-tod (${todAm.network.avgDelayPerVehSec}s) at AM@0.25`
  );
  assert.ok(
    websterSurge.network.avgDelayPerVehSec < todSurge.network.avgDelayPerVehSec * 0.8 &&
      mpSurge.network.avgDelayPerVehSec < todSurge.network.avgDelayPerVehSec * 0.8 &&
      mpCaSurge.network.avgDelayPerVehSec < todSurge.network.avgDelayPerVehSec * 0.8,
    `Expected all adaptive controllers to cut delay >20% vs fixed-tod (${todSurge.network.avgDelayPerVehSec}s) under Silk Board surge`
  );
  assert.ok(
    mpCaSat.network.avgDelayPerVehSec < mpSat.network.avgDelayPerVehSec &&
      todSat.network.avgDelayPerVehSec < mpSat.network.avgDelayPerVehSec,
    `Expected max-pressure-ca (${mpCaSat.network.avgDelayPerVehSec}s) < raw max-pressure (${mpSat.network.avgDelayPerVehSec}s) and fixed-tod lowest (${todSat.network.avgDelayPerVehSec}s) at 0.35 saturation`
  );
});

test('7. Stalled vehicle: capacity drop grows queue; clearing incident lets queue drain gradually via physics', () => {
  const cleanWorld = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'fixed-time',
    startTime: EVENING_PEAK_START,
  });
  const incidentWorld = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'fixed-time',
    startTime: EVENING_PEAK_START,
  });

  // Inject stalled vehicle on Silk Board approach 0 from t=60 to t=600
  for (let t = 0; t < 60; t++) {
    cleanWorld.step();
    incidentWorld.step();
  }

  incidentWorld.injectIncident('JNC-BLR-001', 0, {
    type: 'stalled',
    capacityFactor: 0.4,
    until: 600,
  });

  for (let t = 60; t < 600; t++) {
    cleanWorld.step();
    incidentWorld.step();
  }

  const qClean = cleanWorld.snapshot('JNC-BLR-001').approaches[0].queueVeh;
  const snapIncidentAt600 = incidentWorld.snapshot('JNC-BLR-001');
  const qIncidentAt600 = snapIncidentAt600.approaches[0].queueVeh;

  assert.strictEqual(snapIncidentAt600.stalledVehicleDetected, true);
  assert.ok(
    qIncidentAt600 > qClean,
    `Expected incident queue (${qIncidentAt600}) > clean queue (${qClean})`
  );

  // Step once past expiry (t=601): queue must NOT vanish instantaneously
  incidentWorld.step();
  const snapAfterClear = incidentWorld.snapshot('JNC-BLR-001');
  const qImmediate = snapAfterClear.approaches[0].queueVeh;
  assert.strictEqual(snapAfterClear.stalledVehicleDetected, false);
  assert.ok(
    qImmediate > qIncidentAt600 * 0.85,
    `Queue must not reset on clear: at600=${qIncidentAt600}, immediate=${qImmediate}`
  );

  // Switch to midday/night lighter demand and verify queue drains smoothly over time
  incidentWorld.simTimeMs = Date.parse('2026-11-14T20:00:00.000Z'); // ~01:30 IST night trough (0.3x)
  for (let t = 0; t < 600; t++) {
    incidentWorld.step();
  }
  const qAfterDrain = incidentWorld.snapshot('JNC-BLR-001').approaches[0].queueVeh;
  assert.ok(
    qAfterDrain < qImmediate * 0.5,
    `Expected queue to drain significantly after incident cleared under lighter load: immediate=${qImmediate}, afterDrain=${qAfterDrain}`
  );
});

test('8. Emergency preemption: weaving speed + queue-clearance lead makes preempt=true strictly faster than preempt=false', () => {
  const path = ['JNC-BLR-004', 'JNC-BLR-001', 'JNC-BLR-003', 'JNC-BLR-011'];

  // Verify weaving kinematics: 40 km/h upstream of queue, >= 12 km/h weaving inside queue (not 3 km/h)
  const kinWorld = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'fixed-tod',
    startTime: EVENING_PEAK_START,
  });
  const flatIdx0 = kinWorld.junctionApproachOffsets[3]; // JNC-BLR-004 approach 0
  kinWorld.queueVeh[flatIdx0] = kinWorld.storageCapVeh[flatIdx0]; // Full queue (~50+ veh, queueLengthM = storageCapM)
  assert.ok(
    kinWorld._approachSpeedKmph(flatIdx0) < 4,
    'Sanity check: mixed-traffic queue tail speed drops near MIN_SPEED_KMPH (3 km/h)'
  );
  const emKin = kinWorld.dispatchEmergency({ path, preempt: true });
  emKin.remainingDistM = 5000; // Upstream of queue
  assert.strictEqual(kinWorld._emergencySpeedMps(emKin, flatIdx0) * 3.6, FREE_FLOW_SPEED_KMPH);
  emKin.remainingDistM = 50; // Inside queue along road shoulder
  const insideSpeedKmph = kinWorld._emergencySpeedMps(emKin, flatIdx0) * 3.6;
  assert.ok(
    insideSpeedKmph >= EMERGENCY_WEAVING_SPEED_KMPH && MIN_SPEED_KMPH < EMERGENCY_WEAVING_SPEED_KMPH,
    `Expected shoulder weaving >= ${EMERGENCY_WEAVING_SPEED_KMPH} km/h, got ${insideSpeedKmph} km/h`
  );

  // A. Isolated preemption check (same Fixed-TOD controller, preempt=true vs preempt=false)
  const wPreempt = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'fixed-tod',
    startTime: EVENING_PEAK_START,
  });
  const wNoPreempt = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'fixed-tod',
    startTime: EVENING_PEAK_START,
  });

  for (let t = 0; t < 120; t++) {
    wPreempt.step();
    wNoPreempt.step();
  }

  const fixedPreempt = wPreempt.dispatchEmergency({ path, preempt: true });
  const fixedNoPreempt = wNoPreempt.dispatchEmergency({ path, preempt: false });

  for (let t = 0; t < 3600; t++) {
    wPreempt.step();
    wNoPreempt.step();
    if (fixedPreempt.status === 'completed' && fixedNoPreempt.status === 'completed') {
      break;
    }
  }

  assert.strictEqual(fixedPreempt.status, 'completed');
  assert.strictEqual(fixedNoPreempt.status, 'completed');
  assert.ok(
    fixedPreempt.travelTimeSec < fixedNoPreempt.travelTimeSec,
    `Expected Fixed-TOD preempt=true (${fixedPreempt.travelTimeSec}s) < preempt=false (${fixedNoPreempt.travelTimeSec}s)`
  );

  // B. CounterfactualPair check (live MaxPressure + preempt=true vs baseline Fixed-TOD + preempt=false)
  const pair = new CounterfactualPair({
    seed: 20261114,
    startTime: EVENING_PEAK_START,
    liveControllerFactory: 'max-pressure',
  });
  assert.strictEqual(pair.baseline.controllers[0].name, 'fixed-tod');

  for (let t = 0; t < 120; t++) {
    pair.step();
  }
  const { live: preemptAgent, baseline: nonPreemptAgent } = pair.dispatchEmergency({
    path,
    preempt: true,
  });
  for (let t = 0; t < 3600; t++) {
    pair.step();
    if (preemptAgent.status === 'completed' && nonPreemptAgent.status === 'completed') {
      break;
    }
  }

  console.log('[Emergency Corridor Preemption Travel Times]');
  console.log(
    `  Path: ${path.join(' -> ')} | length=${fixedPreempt.totalLengthKm} km | freeFlowTime=${fixedPreempt.freeFlowTimeSec}s`
  );
  console.log(
    `  Isolated Fixed-TOD: preempt=true -> travel=${fixedPreempt.travelTimeSec}s (redWait=${fixedPreempt.waitingAtRedSec}s) vs preempt=false -> travel=${fixedNoPreempt.travelTimeSec}s (redWait=${fixedNoPreempt.waitingAtRedSec}s)`
  );
  console.log(
    `  CounterfactualTwin: live(MaxPressure+preempt) -> travel=${preemptAgent.travelTimeSec}s (redWait=${preemptAgent.waitingAtRedSec}s) vs baseline(Fixed-TOD) -> travel=${nonPreemptAgent.travelTimeSec}s (redWait=${nonPreemptAgent.waitingAtRedSec}s)`
  );

  assert.strictEqual(preemptAgent.status, 'completed');
  assert.strictEqual(nonPreemptAgent.status, 'completed');
  assert.ok(
    preemptAgent.travelTimeSec < nonPreemptAgent.travelTimeSec,
    `Expected live preempt=true (${preemptAgent.travelTimeSec}s) < baseline preempt=false (${nonPreemptAgent.travelTimeSec}s)`
  );
  assert.ok(
    preemptAgent.waitingAtRedSec < nonPreemptAgent.waitingAtRedSec,
    `Expected lower red-wait under preemption (${preemptAgent.waitingAtRedSec}s vs ${nonPreemptAgent.waitingAtRedSec}s)`
  );
});

test('9. Performance: 12-junction network step executes well under 2 ms per step', () => {
  const world = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'max-pressure',
    startTime: EVENING_PEAK_START,
  });

  // Warm up JIT
  for (let i = 0; i < 200; i++) world.step();

  const steps = 2000;
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    world.step();
  }
  const elapsedMs = performance.now() - t0;
  const avgStepMs = elapsedMs / steps;

  console.log(`[Performance] ${steps} steps across ${DEFAULT_NETWORK.junctions.length} junctions in ${elapsedMs.toFixed(2)} ms -> avg ${avgStepMs.toFixed(4)} ms/step`);
  assert.ok(avgStepMs < 2.0, `Expected < 2.0 ms/step, measured ${avgStepMs.toFixed(4)} ms/step`);
});

test('10. Fixed-time (Webster-tuned TOD plan): switches plans across TOD period boundary', () => {
  // Use KR Puram (JNC-BLR-006), whose TOD plans differ strictly across am-peak -> midday -> pm-peak
  const junc006 = DEFAULT_NETWORK.junctionMap.get('JNC-BLR-006');
  // 05:57 UTC = 11:27 IST (am-peak ends at 11:30 IST -> midday)
  const startMs = Date.parse('2026-11-14T05:57:00.000Z');
  const ctrl = new FixedTimeController(junc006, { startTimeMs: startMs });
  assert.strictEqual(ctrl.label, 'Fixed-time (Webster-tuned TOD plan)');
  assert.strictEqual(ctrl.activePeriodId, 'am-peak');
  const amCycle = ctrl.cycleSec;
  const amSplits = [...ctrl.splits];

  for (let t = 1; t <= 420; t++) {
    ctrl.decide({ simTimeMs: startMs + t * 1000 }, t);
  }
  const descAfter = ctrl.describe();
  assert.strictEqual(descAfter.activePeriod, 'midday', 'Expected TOD plan to switch from am-peak to midday after 11:30 IST cycle wrap');
  assert.ok(
    descAfter.planned.cycleSec < amCycle &&
      descAfter.planned.splits.some((s, idx) => s !== amSplits[idx]),
    `Expected midday TOD plan to reduce cycle from am-peak (${amCycle}s -> ${descAfter.planned.cycleSec}s)`
  );
});

test('11. R1 Starvation guard (MaxPressure): serves queued approach waited >= maxRedSec (120s) once gmin met', () => {
  const mockJunction = {
    approaches: [
      { lanes: 2, saturationFlowPerSec: 1.0, storageCapVeh: 100 },
      { lanes: 2, saturationFlowPerSec: 1.0, storageCapVeh: 100 },
      { lanes: 2, saturationFlowPerSec: 1.0, storageCapVeh: 100 },
      { lanes: 2, saturationFlowPerSec: 1.0, storageCapVeh: 100 },
    ],
  };

  // Part A: Starved queued phase (phase 3, q=3) is served at red >= 120s, empty phase 2 (q=0) is skipped
  const ctrl = new MaxPressureController(mockJunction, { maxRedSec: 120 });
  const state = {
    approaches: [
      { queueVeh: 30, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 60, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 0, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
      { queueVeh: 3, saturationFlowPerSec: 1.0, downstreamPenalty: 0 },
    ],
  };

  ctrl.decide(state, 0);
  let servedPhase3At = null;
  let servedPhase2At = null;
  for (let t = 1; t <= 135; t++) {
    const d = ctrl.decide(state, t);
    if (!d.inIntergreen && d.phaseIndex === 3 && servedPhase3At === null) {
      servedPhase3At = t;
    }
    if (!d.inIntergreen && d.phaseIndex === 2 && servedPhase2At === null) {
      servedPhase2At = t;
    }
    assert.ok(
      t >= 120 || d.phaseIndex === 0 || d.phaseIndex === 1,
      `Phase 3/2 must not pre-empt dominant phases prior to maxRedSec=120 at t=${t}`
    );
  }
  assert.strictEqual(servedPhase2At, null, 'Empty phase 2 (q=0) must NOT trigger starvation switch');
  assert.ok(
    servedPhase3At !== null && servedPhase3At >= 124 && servedPhase3At <= 125,
    `Expected queued phase 3 to receive green right after 4s intergreen at t~124, got t=${servedPhase3At}`
  );

  // Part B: Starvation guard waits for gmin even if maxRedSec threshold expires mid-phase
  const shortGuardCtrl = new MaxPressureController(mockJunction, {
    maxRedSec: 18,
    minGreenSec: 10,
    initialPhaseIndex: 0,
  });
  shortGuardCtrl.decide(state, 0);
  // Runs phase 0 (t=0..10), switches to phase 1 at t=14 (greenElapsed=0), so at t=18 red[3]=18 >= maxRedSec
  // while greenElapsed=4 < gmin=10. Switch MUST wait until t=24 (greenElapsed=10).
  for (let t = 1; t <= 23; t++) {
    const d = shortGuardCtrl.decide(state, t);
    if (t >= 14) {
      assert.strictEqual(d.phaseIndex, 1, `Should hold phase 1 for gmin before t=24 (at t=${t})`);
      assert.strictEqual(d.inIntergreen, false, `Must wait for gmin=10s after t=18 starvation breach (at t=${t})`);
    }
  }
  const dStarveRelease = shortGuardCtrl.decide(state, 24);
  assert.strictEqual(dStarveRelease.inIntergreen, true, 'Must enter intergreen at t=24 once gmin=10s satisfied');
  let dServed = dStarveRelease;
  for (let t = 25; t <= 28; t++) dServed = shortGuardCtrl.decide(state, t);
  assert.strictEqual(dServed.phaseIndex, 3, 'Should serve starved phase 3 right after 4s intergreen');
});

test('12. R2 Measured realised timing: reports real rolling 300s green splits without fabricating MaxPressure budgets', () => {
  for (const ctrlType of ['fixed-tod', 'webster', 'max-pressure']) {
    const world = new TrafficWorld({
      seed: 20261114,
      controllerFactory: ctrlType,
      startTime: EVENING_PEAK_START,
    });
    for (let t = 0; t < 600; t++) {
      world.step();
    }

    const juncId = 'JNC-BLR-001';
    const jIdx = world.junctionIndexById.get(juncId);
    const desc = world.controllers[jIdx].describe();
    const jSnap = world.snapshot(juncId);

    assert.ok(desc.realised, `${ctrlType}: describe().realised must be present`);
    assert.ok(jSnap.control.realised, `${ctrlType}: snapshot().control.realised must be present`);
    assert.strictEqual(desc.realised.windowSec, 300);
    assert.strictEqual(desc.realised.observedSec, 300);

    const sumGreen = desc.realised.greenSec.reduce((a, b) => a + b, 0);
    assert.ok(
      sumGreen > 200 && sumGreen <= 300,
      `${ctrlType}: sum of realised green seconds in 300s window (${sumGreen}s) must reflect green + intergreen`
    );
    const expectedShareSumPct = (sumGreen / desc.realised.observedSec) * 100;
    const sumShare = desc.realised.greenSharePct.reduce((a, b) => a + b, 0);
    assert.ok(
      Math.abs(sumShare - expectedShareSumPct) < 0.5 && sumShare >= 60 && sumShare <= 95,
      `${ctrlType}: greenSharePct measures % of wall time (${expectedShareSumPct.toFixed(1)}%), got ${sumShare.toFixed(1)}%`
    );
    assert.ok(desc.realised.cycleSec > 0, `${ctrlType}: realised cycleSec should be positive`);

    if (ctrlType === 'max-pressure') {
      assert.strictEqual(desc.planned, null, 'MaxPressure must NOT fabricate a planned split budget');
    } else {
      assert.ok(desc.planned && desc.planned.cycleSec > 0, `${ctrlType}: planned cycleSec should exist`);
      assert.strictEqual(desc.planned.splits.length, 4);
    }
  }
});

test('13. TrafficWorld.clone(): produces bit-for-bit identical 300-step future rollout with active disruptions', () => {
  const world = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'auto',
    startTime: EVENING_PEAK_START,
  });

  // Warm up 120s and inject storm, incident, surge, and diversion before cloning
  for (let i = 0; i < 120; i++) world.step();
  world.injectIncident('JNC-BLR-001', 0, { capacityFactor: 0.35, until: 600 });
  world.setDemandSurge('JNC-BLR-005', 1.8, 600, 1);
  world.applyDiversion({ junctionId: 'JNC-BLR-003', approachIdx: 1, reductionFraction: 0.2, until: 600 });
  world.setGlobalWeather({ type: 'monsoon', capacityFactor: 0.7, speedFactor: 0.75, until: 500 });

  const cloned = world.clone();
  for (let i = 0; i < 300; i++) {
    world.step();
    cloned.step();
  }

  assert.deepStrictEqual(cloned.snapshot(), world.snapshot());
});

test('14. AutoSupervisoryController: loads study JSON, enforces >=2 cycle hysteresis, cites study under high Y', () => {
  const policy = loadStudyPolicy();
  assert.strictEqual(policy.loadedFromFile, true, 'Expected committed control-study JSON to load from benchmarks/results/');
  assert.ok(policy.thresholds.heavyFlowRatioY >= 0.5 && policy.thresholds.heavyFlowRatioY <= 0.85);

  const mockJunc = {
    approaches: [
      { lanes: 2, saturationFlowPerSec: 1.0, storageCapVeh: 120, baseDemandPerSec: 0.08 },
      { lanes: 2, saturationFlowPerSec: 1.0, storageCapVeh: 120, baseDemandPerSec: 0.08 },
      { lanes: 2, saturationFlowPerSec: 1.0, storageCapVeh: 120, baseDemandPerSec: 0.08 },
      { lanes: 2, saturationFlowPerSec: 1.0, storageCapVeh: 120, baseDemandPerSec: 0.08 },
    ],
  };

  const ctrl = new AutoSupervisoryController(mockJunc, {
    startTimeMs: Date.parse('2026-11-14T08:00:00.000Z'), // midday start -> initially low Y ('max-pressure-ca')
    minHoldCycles: 2,
    ewmaTimeConstantSec: 20,
  });
  const initialMode = ctrl.describe().activeController;
  assert.strictEqual(initialMode, 'max-pressure-ca');

  // Drive heavy arrival flow (Y = 0.88 across 4 phases -> well above heavyFlowRatioY)
  const heavyState = {
    simTimeMs: Date.parse('2026-11-14T13:30:00.000Z'),
    approaches: [
      { queueVeh: 25, saturationFlowPerSec: 1.0, arrivalRateVehPerSec: 0.22, capacityFactor: 1, storageCapVeh: 120 },
      { queueVeh: 20, saturationFlowPerSec: 1.0, arrivalRateVehPerSec: 0.22, capacityFactor: 1, storageCapVeh: 120 },
      { queueVeh: 18, saturationFlowPerSec: 1.0, arrivalRateVehPerSec: 0.22, capacityFactor: 1, storageCapVeh: 120 },
      { queueVeh: 15, saturationFlowPerSec: 1.0, arrivalRateVehPerSec: 0.22, capacityFactor: 1, storageCapVeh: 120 },
    ],
  };

  // Observe cycle wraps and verify controller holds >= 2 full cycles before switching
  let wrapCount = 0;
  let switchWrapAt = null;
  let prevPhase = 0;
  let sawNonZero = false;
  let prevInIg = false;
  let clonedCopy = null;

  for (let t = 0; t <= 420; t++) {
    const d = ctrl.decide(heavyState, t);
    if (!d.inIntergreen && d.phaseIndex !== 0) sawNonZero = true;
    const wrapped = !d.inIntergreen && d.phaseIndex === 0 && (prevInIg || prevPhase !== 0) && sawNonZero;
    if (wrapped) {
      wrapCount += 1;
      sawNonZero = false;
      if (wrapCount === 1) {
        assert.strictEqual(
          d.activeController,
          initialMode,
          'Hysteresis failed: switched after only 1 cycle instead of holding >= 2 cycles'
        );
      }
    }
    if (switchWrapAt === null && d.activeController !== initialMode) {
      switchWrapAt = wrapCount;
    }
    prevPhase = d.phaseIndex;
    prevInIg = d.inIntergreen;

    if (t === 50) clonedCopy = ctrl.clone();
  }

  const desc = ctrl.describe();
  assert.ok(switchWrapAt !== null && switchWrapAt >= 2, `Expected switch at wrap >= 2, got ${switchWrapAt}`);
  assert.ok(
    desc.activeController === 'webster' || desc.activeController === 'fixed-tod',
    `Expected study-optimal controller webster/fixed-tod under heavy Y>=0.65, got ${desc.activeController}`
  );
  assert.ok(desc.recentSwitches.length >= 2 && desc.lastReason.includes('study'), 'Expected switch reason citing study evidence');
  assert.strictEqual(clonedCopy.name, 'auto');
});

test('15. Monsoon chaos & conservation-honest upstream diversion preserve conservation and shift flow', () => {
  const dryWorld = new TrafficWorld({ seed: 777, controllerFactory: 'fixed-tod', startTime: EVENING_PEAK_START });
  const monsoonWorld = new TrafficWorld({ seed: 777, controllerFactory: 'fixed-tod', startTime: EVENING_PEAK_START });

  monsoonWorld.setGlobalWeather({ type: 'monsoon', capacityFactor: 0.7, speedFactor: 0.75, until: 400 });
  for (let i = 0; i < 180; i++) {
    dryWorld.step();
    monsoonWorld.step();
  }

  const drySnap = dryWorld.snapshot();
  const rainSnap = monsoonWorld.snapshot();
  assert.ok(
    rainSnap.network.totalDelayVehSec > drySnap.network.totalDelayVehSec,
    `Monsoon (0.7 cap, 0.75 speed) must increase delay (${rainSnap.network.totalDelayVehSec} vs ${drySnap.network.totalDelayVehSec})`
  );

  // Apply 20% upstream diversion onto JNC-BLR-001 approach 1 (which has incoming link LNK-005-001)
  const div = dryWorld.applyDiversion({
    junctionId: 'JNC-BLR-001',
    approachIdx: 1,
    reductionFraction: 0.2,
    until: 500,
  });
  assert.ok(div && div.targetJunctionId !== 'JNC-BLR-001');

  for (let i = 0; i < 120; i++) dryWorld.step();
  assert.ok(dryWorld.totalDivertedVeh > 0, 'Expected diverted vehicles to be conserved onto alternate boundary entry');

  // Verify exact vehicle conservation on every approach after diversion
  for (let j = 0; j < dryWorld.numJunctions; j++) {
    const off = dryWorld.junctionApproachOffsets[j];
    const cnt = dryWorld.junctionApproachCounts[j];
    for (let a = 0; a < cnt; a++) {
      const f = off + a;
      const lhs = dryWorld.totalArrived[f];
      const rhs = dryWorld.totalDeparted[f] + dryWorld.queueVeh[f];
      assert.ok(Math.abs(lhs - rhs) < 1e-4, `Conservation violated post-diversion at j=${j}, a=${a}: ${lhs} vs ${rhs}`);
    }
  }
});

test('16. Copilot analyzeDevice(): K=12 CRN probability confidence, evidenceScore, 300s MPC delay savings', async () => {
  // Construct two scenarios with different saturation & R² evidence to verify evidenceScore + K=12 CRN confidence
  simulatorService.reset({ startTime: EVENING_PEAK_START, liveControllerFactory: 'fixed-naive' });
  // Noisy/early scenario: short history, mild congestion
  simulatorService.injectChaos('JNC-BLR-001', 'totalFlowVehiclesPerMin', 1.8, 300, { approachIdx: 0 });
  for (let i = 0; i < 8; i++) simulatorService.stepPhysics();
  const mildDiag = await copilotService.analyzeDevice('JNC-BLR-001');

  // Sustained overloaded scenario: longer history, higher saturation & stronger monotonic queue growth
  simulatorService.reset({ startTime: EVENING_PEAK_START, liveControllerFactory: 'fixed-naive' });
  simulatorService.injectChaos('JNC-BLR-001', 'totalFlowVehiclesPerMin', 2.8, 400, { approachIdx: 0 });
  for (let i = 0; i < 65; i++) simulatorService.stepPhysics();
  const heavyDiag = await copilotService.analyzeDevice('JNC-BLR-001');

  assert.ok(heavyDiag.findings.length >= 1, 'Expected findings on saturated junction');
  assert.ok(heavyDiag.diagnosticsTiming && typeof heavyDiag.diagnosticsTiming.totalMs === 'number');
  const heavyCtrlFinding = heavyDiag.findings.find((f) => f.runbook?.action === 'switch_controller');
  assert.ok(heavyCtrlFinding, 'Expected switch_controller finding on fixed-naive saturated junction');
  assert.ok(heavyCtrlFinding.evidenceInputs && heavyCtrlFinding.evidenceInputs.sampleCount >= 30);
  assert.strictEqual(heavyCtrlFinding.rolloutsCount, 12);
  assert.ok(
    typeof heavyCtrlFinding.probabilityImproves === 'number' &&
      heavyCtrlFinding.probabilityImproves >= 0 &&
      heavyCtrlFinding.probabilityImproves <= 1
  );
  assert.strictEqual(
    heavyCtrlFinding.confidence,
    Math.round(heavyCtrlFinding.probabilityImproves * 100),
    'Confidence must equal round(P(with-action delay < without-action delay) * 100)'
  );
  assert.ok(
    heavyCtrlFinding.interval90 &&
      typeof heavyCtrlFinding.interval90.low === 'number' &&
      typeof heavyCtrlFinding.interval90.high === 'number' &&
      heavyCtrlFinding.interval90.low <= heavyCtrlFinding.interval90.high
  );
  assert.ok(
    heavyCtrlFinding.predictedEffect && heavyCtrlFinding.predictedEffect.delayDeltaVehSec < 0,
    `Expected 300s MPC rollout to project negative delay delta (reduction), got ${heavyCtrlFinding.predictedEffect?.delayDeltaVehSec}`
  );
  assert.ok(heavyCtrlFinding.evidence.studyCell, 'Expected switch_controller finding to cite studyCell');

  const mildCtrlFinding = mildDiag.findings.find((f) => f.runbook?.action === 'switch_controller');
  if (mildCtrlFinding) {
    assert.notStrictEqual(
      mildCtrlFinding.evidenceScore,
      heavyCtrlFinding.evidenceScore,
      `evidenceScore must vary with sampleCount/R² (${mildCtrlFinding.evidenceScore})`
    );
  }
});

test('17. Copilot executeRemediation(): live-only mutation, 300s realisedEffect auditing, delayed tow clearance', async () => {
  simulatorService.reset({ startTime: EVENING_PEAK_START, liveControllerFactory: 'fixed-naive' });
  simulatorService.injectChaos('JNC-BLR-005', 'totalFlowVehiclesPerMin', 2.5, 500, { approachIdx: 0 });
  for (let i = 0; i < 40; i++) simulatorService.stepPhysics();

  const res = await copilotService.executeRemediation('JNC-BLR-005', 'switch_controller', 'Priya Nair', {
    controller: 'webster',
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.actionRecord.actor, 'Priya Nair');
  assert.strictEqual(res.actionRecord.status, 'pending');
  assert.strictEqual(res.actionRecord.realisedEffect, null);

  // Baseline twin MUST remain fixed-tod untouched
  assert.strictEqual(
    simulatorService.pair.live.snapshot('JNC-BLR-005').control.controller,
    'webster'
  );
  assert.strictEqual(
    simulatorService.pair.baseline.snapshot('JNC-BLR-005').control.controller,
    'fixed-tod'
  );

  // Step exactly 300 sim-seconds -> pending action finalizes realisedEffect
  for (let i = 0; i < 300; i++) simulatorService.stepPhysics();
  assert.strictEqual(res.actionRecord.status, 'measured');
  assert.ok(res.actionRecord.realisedEffect !== null);
  assert.strictEqual(typeof res.actionRecord.realisedEffect.actualDelaySavedVsBaselineDeltaVehSec, 'number');

  // Verify stalled-vehicle dispatch_tow clears LIVE ONLY after depot ETA (90-240s), never instantaneously
  simulatorService.injectChaos('JNC-BLR-002', 'stalledVehicle', 2.5, 600, { stalled: true, approachIdx: 0 });
  const towRes = await copilotService.executeRemediation('JNC-BLR-002', 'dispatch_tow', 'Ananya Rao', {});
  const towEta = towRes.actionRecord.params.towEtaSec;
  assert.ok(towEta >= 90 && towEta <= 240, `Expected BTP tow ETA in [90,240]s, got ${towEta}s`);

  // Step 30s -> stalled vehicle MUST still be active in BOTH twins
  for (let i = 0; i < 30; i++) simulatorService.stepPhysics();
  assert.strictEqual(simulatorService.pair.live.snapshot('JNC-BLR-002').stalledVehicleDetected, true);
  assert.strictEqual(simulatorService.pair.baseline.snapshot('JNC-BLR-002').stalledVehicleDetected, true);

  // Step remaining seconds past towEta -> LIVE clears, BASELINE remains stalled
  for (let i = 30; i < towEta + 2; i++) simulatorService.stepPhysics();
  assert.strictEqual(simulatorService.pair.live.snapshot('JNC-BLR-002').stalledVehicleDetected, false);
  assert.strictEqual(simulatorService.pair.baseline.snapshot('JNC-BLR-002').stalledVehicleDetected, true);
});

test('18. Scenario presets & SIM_START resolution: PM/Monsoon/Stall CRN alignment and measured corridor speed', () => {
  const customStart = resolveInitialSimStart('18:30');
  assert.strictEqual(customStart.presetId, 'custom');
  assert.strictEqual(customStart.note, 'SIM_START=18:30 IST');

  const liveNowStart = resolveInitialSimStart('now');
  assert.strictEqual(liveNowStart.presetId, 'live-now');

  const autoStart = resolveInitialSimStart('auto');
  assert.ok(['am-peak', 'pm-peak'].includes(autoStart.presetId));
  assert.ok(SCENARIO_PRESETS.some((s) => s.id === 'monsoon-pm-peak'));

  const pmRes = simulatorService.applyScenario('pm-peak', { actor: 'test-suite' });
  assert.strictEqual(pmRes.meta.scenario, 'pm-peak');
  assert.strictEqual(pmRes.meta.simClockIst, '18:31 IST');
  for (let i = 0; i < 10; i++) simulatorService.stepPhysics();
  const state = simulatorService.getState();
  assert.strictEqual(state.scenario, 'pm-peak');
  assert.ok(Array.isArray(state.corridors) && state.corridors.length > 0);
  assert.ok(typeof state.corridors[0].speedKmph === 'number');
  assert.ok(typeof state.corridors[0].vOverC === 'number');

  const monsoonRes = simulatorService.applyScenario('monsoon-pm-peak', { actor: 'test-suite' });
  assert.strictEqual(monsoonRes.meta.scenario, 'monsoon-pm-peak');
  simulatorService.stepPhysics();
  assert.strictEqual(simulatorService.pair.live.weather.active, true);
  assert.strictEqual(simulatorService.pair.baseline.weather.active, true);

  const stallRes = simulatorService.applyScenario('pm-stalled-silkboard', { actor: 'test-suite' });
  assert.strictEqual(stallRes.meta.scenario, 'pm-stalled-silkboard');
  simulatorService.stepPhysics();
  assert.strictEqual(simulatorService.pair.live.snapshot('JNC-BLR-001').stalledVehicleDetected, true);
  assert.strictEqual(simulatorService.pair.baseline.snapshot('JNC-BLR-001').stalledVehicleDetected, true);
});
