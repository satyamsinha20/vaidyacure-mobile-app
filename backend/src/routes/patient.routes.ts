import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticatePatient } from '../services/patient/auth.js';
import * as patient from '../controllers/patient.controller.js';

/** Mobile app: patient login, wallet, bookings and real-doctor chat (/api/patient) */
const router = Router();

// Personal data: never cached by the CDN or the phone
router.use((_req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/auth/request-otp', patient.requestOtp);
router.post('/auth/verify-otp', patient.verifyOtp);

router.use(authenticatePatient);
router.post('/auth/logout', patient.logout);
router.get('/me', patient.getMe);
router.put('/me', patient.updateMe);

router.get('/wallet', patient.getWallet);
router.post('/wallet/topups', patient.addTopup);

router.get('/bookings', patient.listBookings);
router.post('/bookings', patient.createBooking);
router.post('/bookings/ai', patient.createAiDoctorBooking);
router.get('/bookings/:id', patient.getBooking);
router.post('/bookings/:id/payment', patient.payBooking);
router.post('/bookings/:id/cancel', patient.cancelBooking);
router.post('/bookings/:id/start-ai', patient.startAiDoctorBooking);
router.get('/bookings/:id/messages', patient.readMessages);
router.post('/bookings/:id/messages', patient.sendMessage);

export default router;
