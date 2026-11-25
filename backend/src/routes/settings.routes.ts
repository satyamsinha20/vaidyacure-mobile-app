import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticateAdmin, requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ROLES } from '../config/constants.js';
import * as settings from '../controllers/settings.controller.js';

/** Admin panel > Settings (/api/admin/settings): SMTP, reminder URL and email texts. Super admin only. */
const router = Router();

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(authenticateAdmin, requireRole(ADMIN_ROLES.SUPERADMIN));

router.get('/email', settings.getEmail);
router.put('/email', settings.updateEmail);
router.post('/email/test', settings.testEmail);
router.post('/cron-key', settings.createCronKey);

router.get('/email-templates', settings.listTemplates);
router.put('/email-templates/:key', settings.saveTemplate);
router.delete('/email-templates/:key', settings.resetTemplate);
router.post('/email-templates/:key/preview', settings.previewTemplate);

export default router;
