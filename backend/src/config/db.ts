import mongoose from 'mongoose';

// Cached across requests in the same (warm) serverless instance, so each
// request reuses one connection instead of opening a new one.
let connectionPromise: Promise<typeof mongoose> | null = null;

export const connectDB = async (): Promise<typeof mongoose> => {
  if (mongoose.connection.readyState === 1) return mongoose;

  if (!connectionPromise) {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vaidyacure';

    connectionPromise = mongoose
      // Small pool: each serverless instance handles few concurrent requests
      .connect(mongoURI, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10, minPoolSize: 1 })
      .then((conn) => {
        console.log(`🌿 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      })
      .catch((error) => {
        // Clear the cache so the next request retries instead of reusing a failed attempt
        connectionPromise = null;
        console.error('❌ MongoDB Connection Error:', error);
        throw error;
      });
  }

  return connectionPromise;
};
