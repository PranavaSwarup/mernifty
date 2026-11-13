import express from 'express';
import { copilotService } from '../services/copilotService.js';

const router = express.Router();

// Run diagnosis on a device
router.get('/diagnose/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const diagnosis = await copilotService.analyzeDevice(deviceId);
    if (!diagnosis) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    res.json({ success: true, diagnosis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Execute automated remediation runbook
router.post('/remediate', async (req, res) => {
  try {
    const { deviceId, action } = req.body;
    if (!deviceId || !action) {
      return res.status(400).json({ success: false, error: 'deviceId and action are required' });
    }
    const result = await copilotService.executeRunbook(deviceId, action);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
