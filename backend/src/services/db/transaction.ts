import mongoose, { type ClientSession } from 'mongoose';

/**
 * Runs `work` in a MongoDB transaction: every write inside it (given the
 * session) is saved together or not at all. Used wherever money moves, so a
 * wallet can never be debited without its ledger entry (or the other way round).
 * The driver may re-run `work` on transient errors, so it must only write to
 * the database (send emails after it returns).
 */
export const withTransaction = async <T>(work: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
};
