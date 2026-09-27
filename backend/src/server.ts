import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { ENV } from './config/constants.js';
import { seedDefaultAdmin } from './scripts/seedAdmin.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import remedyRoutes from './routes/remedy.routes.js';

// Load environment configuration
dotenv.config();

// Initialize Express application
const app = express();

/* -------------------------------------------------------------------------- */
/* DATABASE CONNECTION & SEEDING                                              */
/* -------------------------------------------------------------------------- */
connectDB().then(() => {
  seedDefaultAdmin();
});

/* -------------------------------------------------------------------------- */
/* GLOBAL MIDDLEWARES                                                         */
/* -------------------------------------------------------------------------- */
// Cross-Origin Resource Sharing configured for Admin Panel (3003) and Mobile App
const allowedOrigins = [
  ENV.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:3003',
  'http://localhost:8081',
  'http://localhost:19006',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like native mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || ENV.NODE_ENV === 'development') {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logger
if (ENV.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
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

// System health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'vaidyacure-backend',
    database: 'mongodb-localhost',
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Users tracking & onboarding routes
app.use('/api/users', userRoutes);

// Remedies & Medicines catalog routes (shared across SuperAdmin, Moderator, App)
app.use('/api/remedies', remedyRoutes);

/* -------------------------------------------------------------------------- */
/* ERROR HANDLING MIDDLEWARES                                                 */
/* -------------------------------------------------------------------------- */
// 404 Route Not Found
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Exception Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
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
