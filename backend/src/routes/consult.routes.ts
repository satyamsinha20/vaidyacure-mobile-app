import { Router } from 'express';
import { cdnCache } from '../middleware/cache.middleware.js';
import { optionalPatient } from '../services/patient/auth.js';
import {
  getDoctorSlots,
  getDoctors,
  message,
  premiumAdReward,
  premiumPurchase,
  report,
  start,
} from '../controllers/consult.controller.js';

const router = Router();

// Mobile app AI consultations (anonymous device id; premium needs a logged-in wallet; all limits enforced server-side)
router.get('/doctors', cdnCache(15, 30), getDoctors);
router.get('/doctors/:id/slots', cdnCache(5, 5), getDoctorSlots);
router.post('/start', optionalPatient, start);
router.post('/ads/reward', premiumAdReward);
router.post('/premium/ad-reward', premiumAdReward); // older app builds
router.post('/premium/purchase', premiumPurchase); // removed: 410
router.post('/:id/message', message);
router.post('/:id/report', report);

export default router;
