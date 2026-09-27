import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/constants.js';
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

    // Verify JWT
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as JwtPayload;

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
    console.error('Auth verification error:', error.message);
    res.status(401).json({
      status: 'error',
      message: 'Invalid or expired session token.',
    });
  }
};
