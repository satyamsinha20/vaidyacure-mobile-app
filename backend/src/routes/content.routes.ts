import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../middleware/auth.middleware.js';
import { cdnCache } from '../middleware/cache.middleware.js';
import { ADMIN_ROLES } from '../config/constants.js';
import {
  activeAds,
  createAd,
  createTip,
  deleteAd,
  deleteFeedback,
  deleteNotification,
  deleteTip,
  feedbackSummary,
  latestNotifications,
  listAds,
  listFeedback,
  listTips,
  recordAdEvent,
  submitFeedback,
  todaysTip,
  updateAd,
  updateFeedbackStatus,
  updateTip,
} from '../controllers/content.controller.js';

/* Public endpoints used by the mobile app (/api/app) */
export const appContentRouter = Router();
appContentRouter.post('/feedback', submitFeedback);
appContentRouter.get('/ads', cdnCache(60, 600), activeAds);
appContentRouter.post('/ads/:id/event', recordAdEvent);
appContentRouter.get('/wellness-tip', cdnCache(600, 3600), todaysTip);
appContentRouter.get('/notifications', cdnCache(60, 600), latestNotifications);

/* Admin endpoints (/api/admin/content): every admin can read, editors manage content */
export const adminContentRouter = Router();
const { SUPERADMIN, MODERATOR } = ADMIN_ROLES;
const managers = requireRole(SUPERADMIN, MODERATOR);

adminContentRouter.use(authenticateAdmin);

adminContentRouter.get('/feedback', listFeedback);
adminContentRouter.get('/feedback/summary', feedbackSummary);
adminContentRouter.patch('/feedback/:id', managers, updateFeedbackStatus);
adminContentRouter.delete('/feedback/:id', requireRole(SUPERADMIN), deleteFeedback);

adminContentRouter.get('/ads', listAds);
adminContentRouter.post('/ads', managers, createAd);
adminContentRouter.put('/ads/:id', managers, updateAd);
adminContentRouter.delete('/ads/:id', managers, deleteAd);

adminContentRouter.get('/tips', listTips);
adminContentRouter.post('/tips', managers, createTip);
adminContentRouter.put('/tips/:id', managers, updateTip);
adminContentRouter.delete('/tips/:id', managers, deleteTip);

adminContentRouter.delete('/notifications/:id', managers, deleteNotification);
