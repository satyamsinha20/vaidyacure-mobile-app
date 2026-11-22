import express, { Router } from 'express';
import { cdnCache } from '../middleware/cache.middleware.js';
import { search, searchImage } from '../controllers/search.controller.js';

const router = Router();

// Same query → same answer: cache at the CDN edge for 5 minutes
router.get('/', cdnCache(300, 3600), search);

// Photos need a larger body than the global 50 KB limit
router.post('/image', express.json({ limit: '4mb' }), searchImage);

export default router;
