import { Router } from 'express';
import { onboardUser, getAllUsers, getUserCount } from '../controllers/user.controller.js';
import { authenticateAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Public onboarding endpoint (Mobile App)
router.post('/onboard', onboardUser);

// Public count endpoint for dashboard metric card
router.get('/count', getUserCount);

// Admin users endpoint (accessible for Admin Panel SSR & Client)
router.get('/', getAllUsers);

export default router;
