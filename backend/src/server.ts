import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { ENV, IS_PRODUCTION } from './config/constants.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import remedyRoutes from './routes/remedy.routes.js';
import consultRoutes from './routes/consult.routes.js';
import aiAdminRoutes from './routes/aiAdmin.routes.js';

// Load environment configuration
dotenv.config();

// Initialize Express application
const app = express();

// Vercel / proxies: trust the first proxy hop so req.ip is the real client
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* -------------------------------------------------------------------------- */
/* DATABASE CONNECTION                                                        */
/* -------------------------------------------------------------------------- */
// Warm up the connection on startup; failures are retried per request below
connectDB().catch(() => {});

/* -------------------------------------------------------------------------- */
/* GLOBAL MIDDLEWARES                                                         */
/* -------------------------------------------------------------------------- */
// Security headers (API only: no HTML is served)
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));

// CORS: only the admin panel may call the API from a browser. The mobile app is
// not a browser (it sends no Origin header) and is unaffected by CORS.
const allowedOrigins = new Set(
  [
    ...ENV.CLIENT_URL.split(','),
    'https://admin-panel-fawn-sigma-31.vercel.app',
    ...(IS_PRODUCTION ? [] : ['http://localhost:3000', 'http://localhost:3003', 'http://localhost:8081', 'http://localhost:19006']),
  ]
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Device-Id'],
    maxAge: 600,
  })
);

// Body parsers with small limits (largest legitimate body is a few KB)
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// HTTP request logger (method, path, status, time - no bodies)
if (ENV.NODE_ENV !== 'test') {
  app.use(morgan(IS_PRODUCTION ? 'tiny' : 'dev'));
}

/* -------------------------------------------------------------------------- */
/* API ROUTES                                                                 */
/* -------------------------------------------------------------------------- */
// Root status endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'success',
    service: 'VaidyaCure Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Ensure MongoDB is connected before any API route runs (needed on serverless cold starts)
app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await connectDB();
    next();
  } catch {
    next({ status: 503, message: 'Database unavailable. Please try again shortly.' });
  }
});

// System health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'vaidyacure-backend',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Users tracking & onboarding routes
app.use('/api/users', userRoutes);

// Remedies & Medicines catalog routes (shared across SuperAdmin, Moderator, App)
app.use('/api/remedies', remedyRoutes);

// Doctor consultations for the mobile app
app.use('/api/consult', consultRoutes);

// AI Doctor configuration (admin panel, super admin only)
app.use('/api/admin/ai', aiAdminRoutes);

/* -------------------------------------------------------------------------- */
/* ERROR HANDLING MIDDLEWARES                                                 */
/* -------------------------------------------------------------------------- */
// 404 Route Not Found
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

// Global Exception Handler: client errors keep their message, server errors stay generic
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500) console.error('Unhandled Server Error:', err);
  res.status(status).json({
    status: 'error',
    message:
      status === 413
        ? 'Request is too large.'
        : status < 500 && err?.type === 'entity.parse.failed'
        ? 'Invalid JSON body.'
        : status < 500
        ? err.message || 'Bad request.'
        : 'Internal Server Error',
  });
});

/* -------------------------------------------------------------------------- */
/* SERVER STARTUP                                                             */
/* -------------------------------------------------------------------------- */
app.listen(ENV.PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 VaidyaCure Server running on http://localhost:${ENV.PORT}`);
  console.log(`📡 Auth Endpoints: http://localhost:${ENV.PORT}/api/auth`);
  console.log(`📡 Health Check:    http://localhost:${ENV.PORT}/api/health`);
  console.log(`====================================================`);
});
