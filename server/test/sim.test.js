import test from 'node:test';
import assert from 'node:assert';
import {
  FixedTimeController,
  WebsterController,
  MaxPressureController,
  computeWebsterPlan,
} from '../src/sim/controllers.js';
import { demandFactor } from '../src/sim/demand.js';
import { DEFAULT_NETWORK } from '../src/sim/network.js';
import { TrafficWorld } from '../src/sim/engine.js';
import { CounterfactualPair } from '../src/sim/twin.js';

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

test('6. Effectiveness: evening-peak + Silk Board surge (1800s) -> MaxPressure and Webster beat FixedTime delay', () => {
  // Sanity-check demandFactor at evening peak
  const peakMult = demandFactor(EVENING_PEAK_START);
  assert.ok(peakMult >= 1.6 && peakMult <= 1.9, `Evening peak multiplier should be ~1.6-1.9x, got ${peakMult}`);

  const runScenario = (ctrlType) => {
    const world = new TrafficWorld({
      seed: 20261114,
      controllerFactory: ctrlType,
      startTime: EVENING_PEAK_START,
    });
    // Asymmetric demand surge on Silk Board (JNC-BLR-001) Hosur Rd from south (approach 0)
    world.setDemandSurge('JNC-BLR-001', 2.4, 1800, 0);
    for (let t = 0; t < 1800; t++) {
      world.step();
    }
    return world.snapshot();
  };

  const fixedSnap = runScenario('fixed-time');
  const websterSnap = runScenario('webster');
  const mpSnap = runScenario('max-pressure');

  console.log('[Effectiveness 1800s @ Evening Peak + Silk Board Asymmetric Surge]');
  console.log(`  FixedTime   totalDelay=${fixedSnap.network.totalDelayVehSec} veh·s (${fixedSnap.network.totalDelayVehHours} veh·h), avgDelay=${fixedSnap.network.avgDelayPerVehSec} s/veh, throughput=${fixedSnap.network.totalThroughputVeh}`);
  console.log(`  Webster     totalDelay=${websterSnap.network.totalDelayVehSec} veh·s (${websterSnap.network.totalDelayVehHours} veh·h), avgDelay=${websterSnap.network.avgDelayPerVehSec} s/veh, throughput=${websterSnap.network.totalThroughputVeh}`);
  console.log(`  MaxPressure totalDelay=${mpSnap.network.totalDelayVehSec} veh·s (${mpSnap.network.totalDelayVehHours} veh·h), avgDelay=${mpSnap.network.avgDelayPerVehSec} s/veh, throughput=${mpSnap.network.totalThroughputVeh}`);

  assert.ok(
    mpSnap.network.totalDelayVehSec < fixedSnap.network.totalDelayVehSec,
    `Expected MaxPressure delay (${mpSnap.network.totalDelayVehSec}) < FixedTime (${fixedSnap.network.totalDelayVehSec})`
  );
  assert.ok(
    websterSnap.network.totalDelayVehSec < fixedSnap.network.totalDelayVehSec,
    `Expected Webster delay (${websterSnap.network.totalDelayVehSec}) < FixedTime (${fixedSnap.network.totalDelayVehSec})`
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

test('8. Emergency preemption: green-wave preempt=true yields strictly lower travel time than preempt=false', () => {
  const path = ['JNC-BLR-004', 'JNC-BLR-001', 'JNC-BLR-003', 'JNC-BLR-011'];

  // A. Isolated preemption check (same FixedTime controller, preempt=true vs preempt=false)
  const wPreempt = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'fixed-time',
    startTime: EVENING_PEAK_START,
  });
  const wNoPreempt = new TrafficWorld({
    seed: 20261114,
    controllerFactory: 'fixed-time',
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
    `Expected FixedTime preempt=true (${fixedPreempt.travelTimeSec}s) < preempt=false (${fixedNoPreempt.travelTimeSec}s)`
  );

  // B. CounterfactualPair check (live MaxPressure + preempt=true vs baseline FixedTime + preempt=false)
  const pair = new CounterfactualPair({
    seed: 20261114,
    startTime: EVENING_PEAK_START,
    liveControllerFactory: 'max-pressure',
  });
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
  console.log(`  Path: ${path.join(' -> ')}`);
  console.log(`  Isolated FixedTime: preempt=true=${fixedPreempt.travelTimeSec}s (redWait=${fixedPreempt.waitingAtRedSec}s) vs preempt=false=${fixedNoPreempt.travelTimeSec}s (redWait=${fixedNoPreempt.waitingAtRedSec}s)`);
  console.log(`  CounterfactualTwin: live(MaxPressure+preempt)=${preemptAgent.travelTimeSec}s (redWait=${preemptAgent.waitingAtRedSec}s) vs baseline(FixedTime)=${nonPreemptAgent.travelTimeSec}s (redWait=${nonPreemptAgent.waitingAtRedSec}s)`);

  assert.strictEqual(preemptAgent.status, 'completed');
  assert.strictEqual(nonPreemptAgent.status, 'completed');
  assert.ok(
    preemptAgent.travelTimeSec < nonPreemptAgent.travelTimeSec,
    `Expected live preempt=true (${preemptAgent.travelTimeSec}s) < baseline preempt=false (${nonPreemptAgent.travelTimeSec}s)`
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
