import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vaidyacure';
    
    const conn = await mongoose.connect(mongoURI);
    
    console.log(`🌿 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    // Do not terminate process immediately so developer can start Mongo Compass if needed
  }
};
