import express, { Router } from 'express';
import { cdnCache } from '../middleware/cache.middleware.js';
import { search, searchAi, searchConfig, searchImage, searchWebResults } from '../controllers/search.controller.js';

const router = Router();

// Same query → same answer: cache at the CDN edge for 5 minutes
router.get('/', cdnCache(300, 3600), search);

// Which buttons the search screen shows (mic, camera, AI answer, internet)
router.get('/config', cdnCache(30, 60), searchConfig);

// AI answer for a search (sets its own cache headers: only real answers are cached)
router.get('/ai', searchAi);

// Internet results (Google through Serper; sets its own cache headers)
router.get('/web', searchWebResults);

// Photos need a larger body than the global 50 KB limit
router.post('/image', express.json({ limit: '4mb' }), searchImage);

export default router;
