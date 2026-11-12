import { Router } from 'express';
import {
  getRemedies,
  getRemedyById,
  createRemedy,
  updateRemedy,
  deleteRemedy,
} from '../controllers/remedy.controller.js';
import { authenticateAdmin, requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ROLES } from '../config/constants.js';
import { cdnCache } from '../middleware/cache.middleware.js';

const router = Router();

// Public read access (mobile app + admin panel)
// Public reads are cached at the CDN edge for 60s (admin requests with a token bypass it)
router.get('/', cdnCache(60, 600), getRemedies);
router.get('/:id', cdnCache(60, 600), getRemedyById);

// Writes require an admin session; viewers are read-only
const { SUPERADMIN, MODERATOR, EDITOR } = ADMIN_ROLES;
router.post('/', authenticateAdmin, requireRole(SUPERADMIN, MODERATOR, EDITOR), createRemedy);
router.put('/:id', authenticateAdmin, requireRole(SUPERADMIN, MODERATOR, EDITOR), updateRemedy);
router.delete('/:id', authenticateAdmin, requireRole(SUPERADMIN, MODERATOR), deleteRemedy);

export default router;
