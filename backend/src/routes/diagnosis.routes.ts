import { Router } from 'express';
import { analyze, interview } from '../controllers/diagnosis.controller.js';

const router = Router();

// Mobile app symptom diagnosis (AI-powered, rate-limited per device/IP)
router.post('/interview', interview);
router.post('/analyze', analyze);

export default router;
