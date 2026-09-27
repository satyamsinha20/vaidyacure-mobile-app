import { Admin } from '../models/Admin.js';
import { ADMIN_ROLES } from '../config/constants.js';

export const seedDefaultAdmin = async (): Promise<void> => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      console.log('🌱 No admin accounts detected. Seeding initial superadmin...');
      
      const defaultAdmin = new Admin({
        name: 'Vaidya Master Admin',
        email: 'admin@vaidyacure.com',
        password: 'Admin@12345', // Will be auto-hashed by Admin.pre('save')
        role: ADMIN_ROLES.SUPERADMIN,
        isActive: true,
      });

      await defaultAdmin.save();
      console.log('✅ Default superadmin seeded successfully:');
      console.log('   Email: admin@vaidyacure.com');
      console.log('   Password: Admin@12345');
    }
  } catch (error) {
    console.error('⚠️ Error seeding default admin:', error);
  }
};
