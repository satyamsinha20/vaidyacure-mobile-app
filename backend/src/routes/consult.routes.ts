import { Router } from 'express';
import { cdnCache } from '../middleware/cache.middleware.js';
import { getDoctors, message, premiumAdReward, premiumPurchase, report, start } from '../controllers/consult.controller.js';

const router = Router();

// Mobile app consultations (anonymous device id; all limits enforced server-side)
router.get('/doctors', cdnCache(30, 300), getDoctors);
router.post('/start', start);
router.post('/premium/purchase', premiumPurchase);
router.post('/premium/ad-reward', premiumAdReward);
router.post('/:id/message', message);
router.post('/:id/report', report);

export default router;
