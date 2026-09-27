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
import { authenticateAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Public routes
router.post('/login', loginAdmin);

// Protected routes
router.get('/me', authenticateAdmin, getMe);
router.post('/logout', authenticateAdmin, logoutAdmin);
router.put('/change-password', authenticateAdmin, changePassword);
router.get('/roles', authenticateAdmin, getAllRoles);
router.post('/roles', authenticateAdmin, createRole);
router.put('/roles/:id', authenticateAdmin, updateRole);
router.delete('/roles/:id', authenticateAdmin, deleteRole);

export default router;


