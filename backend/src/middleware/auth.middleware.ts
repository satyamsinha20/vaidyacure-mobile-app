import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret, ServerConfigError, type AdminRole } from '../config/constants.js';
import { Admin, IAdmin } from '../models/Admin.js';

// Extend Express Request type to include authenticated admin
export interface AuthenticatedRequest extends Request {
  admin?: IAdmin;
}

interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

export const authenticateAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Check Authorization header (Bearer <token>)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required. No token provided.',
      });
      return;
    }

    // Verify JWT (HS256 only, so tokens can never be accepted with another algorithm)
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload;

    // Find admin and verify active status
    const admin = await Admin.findById(decoded.id);

    if (!admin || !admin.isActive) {
      res.status(401).json({
        status: 'error',
        message: 'Account not found or has been deactivated.',
      });
      return;
    }

    // Attach admin to request
    req.admin = admin;
    next();
  } catch (error: any) {
    if (error instanceof ServerConfigError) {
      console.error('[auth] server misconfiguration:', error.message);
      res.status(500).json({ status: 'error', message: 'Server security is not configured. Contact the administrator.' });
      return;
    }
    res.status(401).json({
      status: 'error',
      message: 'Invalid or expired session token.',
    });
  }
};

/** Allows the request only for the given admin roles (use after authenticateAdmin) */
export const requireRole =
  (...roles: AdminRole[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      res.status(403).json({ status: 'error', message: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
