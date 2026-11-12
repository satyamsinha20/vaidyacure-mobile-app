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

const router = Router();

// Public read access (mobile app + admin panel)
router.get('/', getRemedies);
router.get('/:id', getRemedyById);

// Writes require an admin session; viewers are read-only
const { SUPERADMIN, MODERATOR, EDITOR } = ADMIN_ROLES;
router.post('/', authenticateAdmin, requireRole(SUPERADMIN, MODERATOR, EDITOR), createRemedy);
router.put('/:id', authenticateAdmin, requireRole(SUPERADMIN, MODERATOR, EDITOR), updateRemedy);
router.delete('/:id', authenticateAdmin, requireRole(SUPERADMIN, MODERATOR), deleteRemedy);

export default router;
