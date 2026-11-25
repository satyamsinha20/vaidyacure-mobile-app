import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticateDoctor, requireReadyDoctor } from '../services/doctor/auth.js';
import * as panel from '../controllers/doctorPanel.controller.js';

/** Real doctors' panel (/api/doctor). Doctor tokens only: admin tokens are rejected here. */
const router = Router();

router.use((_req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(authenticateDoctor);

// Allowed before the first password change / terms
router.get('/me', panel.getMe);
router.post('/auth/change-password', panel.changePassword);
router.post('/auth/accept-terms', panel.acceptTerms);

router.use(requireReadyDoctor);
router.get('/dashboard', panel.dashboard);
router.put('/profile', panel.updateProfile);
router.put('/availability', panel.updateAvailability);
router.put('/bank', panel.updateBank);
router.post('/fee-request', panel.requestFee);

router.get('/bookings', panel.listBookings);
router.get('/bookings/:id', panel.getBooking);
router.get('/bookings/:id/messages', panel.readMessages);
router.post('/bookings/:id/messages', panel.sendMessage);
router.post('/bookings/:id/end', panel.endConsultation);
router.post('/bookings/:id/report', panel.submitReport);

router.get('/patients', panel.listPatients);
router.get('/earnings', panel.getEarnings);

export default router;
