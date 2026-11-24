import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../middleware/auth.middleware.js';
import { cdnCache } from '../middleware/cache.middleware.js';
import { ADMIN_ROLES } from '../config/constants.js';
import {
  activeAds,
  carousel,
  createAd,
  createTip,
  deleteAd,
  deleteFeedback,
  deleteNotification,
  deleteTip,
  feedbackStatus,
  feedbackSummary,
  homeContent,
  latestNotifications,
  listAds,
  listFeedback,
  listTips,
  recordAdEvent,
  submitFeedback,
  todaysTip,
  updateAd,
  updateAdSettings,
  updateFeedbackStatus,
  updateTip,
} from '../controllers/content.controller.js';

/* Public endpoints used by the mobile app (/api/app) */
export const appContentRouter = Router();
appContentRouter.get('/feedback/status', feedbackStatus);
appContentRouter.post('/feedback', submitFeedback);
// Cached for only 3 seconds at the CDN: changes made in the admin panel show up in the app
// almost at once, while many phones refreshing together still cost one server call per few seconds
const LIVE = cdnCache(3, 0);
appContentRouter.get('/home', LIVE, homeContent);
appContentRouter.get('/carousel', LIVE, carousel);
appContentRouter.get('/ads', LIVE, activeAds);
appContentRouter.post('/ads/:id/event', recordAdEvent);
appContentRouter.get('/wellness-tip', LIVE, todaysTip);
appContentRouter.get('/notifications', LIVE, latestNotifications);

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
adminContentRouter.put('/ads-settings', managers, updateAdSettings);

adminContentRouter.get('/tips', listTips);
adminContentRouter.post('/tips', managers, createTip);
adminContentRouter.put('/tips/:id', managers, updateTip);
adminContentRouter.delete('/tips/:id', managers, deleteTip);

adminContentRouter.delete('/notifications/:id', managers, deleteNotification);
