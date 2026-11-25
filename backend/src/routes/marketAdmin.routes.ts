import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticateAdmin, requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ROLES } from '../config/constants.js';
import * as admin from '../controllers/marketAdmin.controller.js';

/** Real doctors, payments, refunds, payouts, email and chat safety log (/api/admin/market): super admin only */
const router = Router();

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(authenticateAdmin, requireRole(ADMIN_ROLES.SUPERADMIN));

router.get('/summary', admin.summary);
router.get('/settings', admin.getSettings);
router.put('/settings', admin.updateSettings);

router.get('/doctors', admin.listDoctors);
router.post('/doctors', admin.addDoctor);
router.put('/doctors/:id', admin.editDoctor);
router.post('/doctors/:id/reset-password', admin.resetPassword);
router.post('/doctors/:id/plan', admin.addPlanPayment);
router.post('/doctors/:id/fee/:decision(approve|reject)', admin.decideFee);
router.get('/doctors/:id/bank', admin.getBank);
router.post('/doctors/:id/bank/reviewed', admin.markBankReviewed);

router.get('/bookings', admin.listBookings);
router.post('/bookings/:id/cancel', admin.cancelBooking);
router.get('/payments/bookings', admin.paymentsToVerify);
router.post('/payments/bookings/:id/approve', admin.approvePayment);
router.post('/payments/bookings/:id/reject', admin.rejectPayment);
router.get('/payments/topups', admin.listTopups);
router.post('/payments/topups/:id/approve', admin.approveWalletTopup);
router.post('/payments/topups/:id/reject', admin.rejectWalletTopup);
router.get('/refunds', admin.listRefunds);
router.post('/refunds/:id/paid', admin.refundPaid);
router.post('/refunds/:id/dismiss', admin.refundDismiss);

router.get('/payouts', admin.getPayouts);
router.post('/payouts/:doctorId/settle', admin.settle);
router.get('/earnings', admin.getEarnings);

router.get('/chats', admin.listChats);
router.get('/chats/:id', admin.getChat);

export default router;
