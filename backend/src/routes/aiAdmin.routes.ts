import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ROLES } from '../config/constants.js';
import {
  createDoctor,
  createProvider,
  deleteDoctor,
  deleteProvider,
  getProviderModels,
  getSettings,
  getStatus,
  listAudit,
  listDoctors,
  listProviders,
  testDoctor,
  testProvider,
  updateDoctor,
  updateProvider,
  updateSettings,
} from '../controllers/aiAdmin.controller.js';

const router = Router();

// Everything here manages paid API credentials: super admin only
router.use(authenticateAdmin, requireRole(ADMIN_ROLES.SUPERADMIN));

router.get('/status', getStatus);

router.get('/providers', listProviders);
router.post('/providers', createProvider);
router.put('/providers/:id', updateProvider);
router.delete('/providers/:id', deleteProvider);
router.post('/providers/:id/test', testProvider);
router.get('/providers/:id/models', getProviderModels);

router.get('/doctors', listDoctors);
router.post('/doctors', createDoctor);
router.put('/doctors/:id', updateDoctor);
router.delete('/doctors/:id', deleteDoctor);
router.post('/doctors/:id/test', testDoctor);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

router.get('/audit', listAudit);

export default router;
