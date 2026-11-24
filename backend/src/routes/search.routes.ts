import express, { Router } from 'express';
import { cdnCache } from '../middleware/cache.middleware.js';
import { search, searchAi, searchImage } from '../controllers/search.controller.js';

const router = Router();

// Same query → same answer: cache at the CDN edge for 5 minutes
router.get('/', cdnCache(300, 3600), search);

// AI answer for a search (sets its own cache headers: only real answers are cached)
router.get('/ai', searchAi);

// Photos need a larger body than the global 50 KB limit
router.post('/image', express.json({ limit: '4mb' }), searchImage);

export default router;
