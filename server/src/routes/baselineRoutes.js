import express from 'express';
import { baselineService } from '../services/baselineService.js';
import { simulatorService } from '../services/simulatorService.js';

const router = express.Router();

// Get 24-hour baseline curve for a specific junction
router.get('/:junctionId', (req, res) => {
  const { junctionId } = req.params;
  const curve = [];

  for (let h = 0; h < 24; h++) {
    const b = baselineService.getBaseline(junctionId, h);
    if (b) {
      curve.push(b);
    }
  }

  res.json({
    success: true,
    junctionId,
    baselines: curve,
  });
});

// Get deviation for all junctions in the city for the current simulated hour (Section 5.14)
router.get('/city/deviations', (req, res) => {
  const simDate = simulatorService.getSimulatedTime();
  const simHour = simDate.getHours();
  const deviations = baselineService.getAllCityDeviations(simHour, simulatorService.junctionStates);

  res.json({
    success: true,
    simulatedHour: simHour,
    simulatedTime: simDate.toISOString(),
    deviations,
  });
});

export default router;
