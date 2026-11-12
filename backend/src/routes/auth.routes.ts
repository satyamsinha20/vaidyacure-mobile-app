import { Router } from 'express';
import {
  loginAdmin,
  getMe,
  logoutAdmin,
  changePassword,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
} from '../controllers/auth.controller.js';
import { authenticateAdmin, requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ROLES } from '../config/constants.js';

const router = Router();

// Public routes (login is rate-limited inside the controller)
router.post('/login', loginAdmin);

// Protected routes
router.get('/me', authenticateAdmin, getMe);
router.post('/logout', authenticateAdmin, logoutAdmin);
router.put('/change-password', authenticateAdmin, changePassword);

// Admin account management: super admin only
const superAdminOnly = [authenticateAdmin, requireRole(ADMIN_ROLES.SUPERADMIN)];
router.get('/roles', ...superAdminOnly, getAllRoles);
router.post('/roles', ...superAdminOnly, createRole);
router.put('/roles/:id', ...superAdminOnly, updateRole);
router.delete('/roles/:id', ...superAdminOnly, deleteRole);

export default router;
