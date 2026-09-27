import { Request, Response } from 'express';
import { User, IUser } from '../models/User.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

// Helper to extract clean client IP
const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || 'Unknown';
};

/**
 * @desc    Onboard a new user from mobile app and track device & IP
 * @route   POST /api/users/onboard
 * @access  Public
 */
export const onboardUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, age, gender, deviceInfo } = req.body;

    // Validate required fields
    if (!name || !email || !age || !gender) {
      res.status(400).json({
        status: 'error',
        message: 'Please provide name, email, age, and gender.',
      });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();
    const numericAge = Number(age);
    const cleanGender = gender.toLowerCase().trim();

    if (isNaN(numericAge) || numericAge < 1 || numericAge > 120) {
      res.status(400).json({
        status: 'error',
        message: 'Please provide a valid age between 1 and 120.',
      });
      return;
    }

    if (!['male', 'female', 'other'].includes(cleanGender)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid gender. Allowed values: male, female, other.',
      });
      return;
    }

    const clientIp = getClientIp(req);

    // Check if user already exists
    let user = await User.findOne({ email: cleanEmail });

    if (user) {
      // Update existing user's details and device tracking
      user.name = cleanName;
      user.age = numericAge;
      user.gender = cleanGender as 'male' | 'female' | 'other';
      user.ipAddress = clientIp;
      user.lastActiveAt = new Date();

      if (deviceInfo) {
        user.deviceInfo = {
          ...user.deviceInfo,
          ...deviceInfo,
        };
      }

      await user.save();

      res.status(200).json({
        status: 'success',
        message: 'User profile updated successfully.',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          age: user.age,
          gender: user.gender,
          ipAddress: user.ipAddress,
          deviceInfo: user.deviceInfo,
          firstOpenedAt: user.firstOpenedAt,
          lastActiveAt: user.lastActiveAt,
        },
      });
      return;
    }

    // Create new user in users collection
    user = await User.create({
      name: cleanName,
      email: cleanEmail,
      age: numericAge,
      gender: cleanGender,
      ipAddress: clientIp,
      deviceInfo: {
        platform: deviceInfo?.platform || 'android',
        osVersion: deviceInfo?.osVersion || 'unknown',
        brand: deviceInfo?.brand || 'unknown',
        model: deviceInfo?.model || 'unknown',
        appVersion: deviceInfo?.appVersion || '1.0.0',
        userAgent: (req.headers['user-agent'] as string) || 'VaidyaCure-Mobile-App',
      },
      isRegistered: true,
      firstOpenedAt: new Date(),
      lastActiveAt: new Date(),
    });

    res.status(201).json({
      status: 'success',
      message: 'User onboarded and tracked successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        ipAddress: user.ipAddress,
        deviceInfo: user.deviceInfo,
        firstOpenedAt: user.firstOpenedAt,
        lastActiveAt: user.lastActiveAt,
      },
    });
  } catch (error: any) {
    console.error('Onboard user error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to onboard user.',
    });
  }
};

/**
 * @desc    Get all users (for Admin Panel tracking)
 * @route   GET /api/users
 * @access  Protected (Admin only)
 */
export const getAllUsers = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      totalUsers: users.length,
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        age: u.age,
        gender: u.gender,
        ipAddress: u.ipAddress,
        deviceInfo: u.deviceInfo,
        firstOpenedAt: u.firstOpenedAt,
        lastActiveAt: u.lastActiveAt,
        createdAt: u.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Get all users error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users.',
    });
  }
};

/**
 * @desc    Get total count of mobile app users in users collection
 * @route   GET /api/users/count
 * @access  Public
 */
export const getUserCount = async (_req: Request, res: Response): Promise<void> => {
  try {
    const totalUsers = await User.countDocuments();
    res.status(200).json({
      status: 'success',
      totalUsers,
    });
  } catch (error: any) {
    console.error('Get user count error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to count users.',
    });
  }
};

