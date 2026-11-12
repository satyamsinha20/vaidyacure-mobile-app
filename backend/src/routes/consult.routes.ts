import { Router } from 'express';
import { getDoctors, message, premiumAdReward, premiumPurchase, report, start } from '../controllers/consult.controller.js';

const router = Router();

// Mobile app consultations (anonymous device id; all limits enforced server-side)
router.get('/doctors', getDoctors);
router.post('/start', start);
router.post('/premium/purchase', premiumPurchase);
router.post('/premium/ad-reward', premiumAdReward);
router.post('/:id/message', message);
router.post('/:id/report', report);

export default router;
