import { Router } from 'express';
import { analyze } from '../controllers/diagnosis.controller.js';

const router = Router();

// Mobile app symptom diagnosis (one AI call, rate-limited per device/IP)
router.post('/analyze', analyze);

export default router;
