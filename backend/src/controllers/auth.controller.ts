import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/constants.js';
import { Admin } from '../models/Admin.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

// Helper to generate JWT
const signToken = (id: string, email: string, role: string): string => {
  return jwt.sign({ id, email, role }, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN as any,
  });
};

/**
 * @desc    Authenticate Admin & generate JWT
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validate request inputs
    if (!email || !password) {
      res.status(400).json({
        status: 'error',
        message: 'Please provide both email and password.',
      });
      return;
    }

    // Find admin by email and explicitly include password field
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!admin) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid email or password.',
      });
      return;
    }

    // Check if account is active
    if (!admin.isActive) {
      res.status(403).json({
        status: 'error',
        message: 'Your administrator account has been disabled.',
      });
      return;
    }

    // Verify password match
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid email or password.',
      });
      return;
    }

    // Update last login timestamp
    admin.lastLogin = new Date();
    await admin.save({ validateBeforeSave: false });

    // Generate JWT
    const token = signToken(admin._id.toString(), admin.email, admin.role);

    res.status(200).json({
      status: 'success',
      message: 'Authentication successful.',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An unexpected error occurred during login.',
    });
  }
};

/**
 * @desc    Get currently logged in admin profile
 * @route   GET /api/auth/me
 * @access  Protected
 */
export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const admin = req.admin;

    if (!admin) {
      res.status(401).json({
        status: 'error',
        message: 'Not authorized.',
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve admin profile.',
    });
  }
};

/**
 * @desc    Logout admin
 * @route   POST /api/auth/logout
 * @access  Protected
 */
export const logoutAdmin = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully.',
  });
};

/**
 * @desc    Change admin password
 * @route   PUT /api/auth/change-password
 * @access  Protected
 */
export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        status: 'error',
        message: 'Please provide both current password and new password.',
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        status: 'error',
        message: 'New password must be at least 6 characters long.',
      });
      return;
    }

    const admin = await Admin.findById(req.admin?._id).select('+password');
    if (!admin) {
      res.status(404).json({
        status: 'error',
        message: 'Admin account not found.',
      });
      return;
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(400).json({
        status: 'error',
        message: 'Current password is incorrect.',
      });
      return;
    }

    admin.password = newPassword;
    await admin.save();

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully.',
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update password.',
    });
  }
};

/**
 * @desc    Get all admin roles
 * @route   GET /api/auth/roles
 * @access  Protected
 */
export const getAllRoles = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const roles = await Admin.find({})
      .select('name email role isActive createdAt lastLogin')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      count: roles.length,
      roles: roles.map((r) => ({
        id: r._id,
        name: r.name,
        email: r.email,
        role: r.role,
        isActive: r.isActive,
        lastLogin: r.lastLogin,
        createdAt: r.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Get all roles error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch roles.',
    });
  }
};

/**
 * @desc    Create a new role (Moderator or Viewer)
 * @route   POST /api/auth/roles
 * @access  Protected
 */
export const createRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, email, role, password } = req.body;

    if (!name || !email || !role || !password) {
      res.status(400).json({
        status: 'error',
        message: 'Name, email, role, and password are required.',
      });
      return;
    }

    const validRoles = ['moderator', 'viewer', 'editor'];
    if (!validRoles.includes(role.toLowerCase())) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid role specified. Supported roles: moderator, viewer.',
      });
      return;
    }

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (existingAdmin) {
      res.status(400).json({
        status: 'error',
        message: 'An administrator or role with this email already exists.',
      });
      return;
    }

    const newAdmin = await Admin.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: role.toLowerCase(),
      password,
      isActive: true,
    });

    res.status(201).json({
      status: 'success',
      message: 'Role created successfully.',
      roleUser: {
        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        isActive: newAdmin.isActive,
        createdAt: newAdmin.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Create role error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create role.',
    });
  }
};

/**
 * @desc    Update a role (excluding SuperAdmin)
 * @route   PUT /api/auth/roles/:id
 * @access  Protected (SuperAdmin)
 */
export const updateRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive, password } = req.body;

    const admin = await Admin.findById(id).select('+password');
    if (!admin) {
      res.status(404).json({
        status: 'error',
        message: 'Administrator/Role not found.',
      });
      return;
    }

    if (admin.role === 'superadmin') {
      res.status(403).json({
        status: 'error',
        message: 'Super Administrator cannot be modified here.',
      });
      return;
    }

    if (name) admin.name = name.trim();
    if (email) {
      const emailLower = email.toLowerCase().trim();
      if (emailLower !== admin.email) {
        const existing = await Admin.findOne({ email: emailLower });
        if (existing) {
          res.status(400).json({
            status: 'error',
            message: 'An administrator with this email already exists.',
          });
          return;
        }
        admin.email = emailLower;
      }
    }
    if (role) {
      const validRoles = ['moderator', 'viewer', 'editor'];
      if (!validRoles.includes(role.toLowerCase())) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid role specified. Supported: moderator, viewer.',
        });
        return;
      }
      admin.role = role.toLowerCase() as any;
    }
    if (typeof isActive === 'boolean') {
      admin.isActive = isActive;
    }
    if (password && password.trim().length >= 6) {
      admin.password = password.trim();
    }

    await admin.save();

    res.status(200).json({
      status: 'success',
      message: 'Role updated successfully.',
      roleUser: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Update role error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update role.',
    });
  }
};

/**
 * @desc    Delete a role (excluding SuperAdmin)
 * @route   DELETE /api/auth/roles/:id
 * @access  Protected (SuperAdmin)
 */
export const deleteRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id);
    if (!admin) {
      res.status(404).json({
        status: 'error',
        message: 'Administrator/Role not found.',
      });
      return;
    }

    if (admin.role === 'superadmin') {
      res.status(403).json({
        status: 'error',
        message: 'Super Administrator cannot be deleted.',
      });
      return;
    }

    await Admin.findByIdAndDelete(id);

    res.status(200).json({
      status: 'success',
      message: `Role "${admin.name}" deleted successfully.`,
    });
  } catch (error: any) {
    console.error('Delete role error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete role.',
    });
  }
};

