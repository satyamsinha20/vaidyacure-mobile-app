import { Router, Request, Response, NextFunction } from 'express';
import { onboardUser, getAllUsers, getUserCount } from '../controllers/user.controller.js';
import { authenticateAdmin, requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ROLES } from '../config/constants.js';
import { getClientIp, incrementCounter } from '../services/rateLimit.js';

const router = Router();

// Onboarding is public (mobile app) but limited per IP to stop spam sign-ups
const onboardLimit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const hour = Math.floor(Date.now() / 3_600_000);
  const count = await incrementCounter(`onboard:ip:${getClientIp(req)}:${hour}`, 2 * 3_600_000);
  if (count > 20) {
    res.status(429).json({ status: 'error', message: 'Too many requests. Please try again later.' });
    return;
  }
  next();
};

router.post('/onboard', onboardLimit, onboardUser);

// Personal data of app users: admin sessions only
router.get('/count', authenticateAdmin, getUserCount);
router.get('/', authenticateAdmin, requireRole(ADMIN_ROLES.SUPERADMIN), getAllUsers);

export default router;
