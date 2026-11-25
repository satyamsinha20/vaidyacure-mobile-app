import { Router } from 'express';
import { cdnCache } from '../middleware/cache.middleware.js';
import { cronTick, getInfo, getSlots, listDoctors } from '../controllers/market.controller.js';

/** Public: real doctors patients can book (/api/market) */
export const marketRouter = Router();
marketRouter.get('/doctors', cdnCache(30, 120), listDoctors);
// Short cache: a just-booked time can show as free for a few seconds, but booking it fails safely
marketRouter.get('/doctors/:id/slots', cdnCache(5, 5), getSlots);
marketRouter.get('/info', cdnCache(30, 60), getInfo);

/** Due work for an external cron service (/api/cron) */
export const cronRouter = Router();
cronRouter.get('/tick', cronTick);
cronRouter.post('/tick', cronTick);
