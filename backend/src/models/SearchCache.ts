import mongoose, { Document, Schema, Model } from 'mongoose';

/** Cached search results so repeated searches never hit the external sources again */
export interface ISearchCache extends Document {
  key: string;
  result: unknown;
  expiresAt: Date;
}

const SearchCacheSchema = new Schema<ISearchCache>(
  {
    key: { type: String, required: true, unique: true },
    result: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

SearchCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SearchCache: Model<ISearchCache> =
  mongoose.models.SearchCache || mongoose.model<ISearchCache>('SearchCache', SearchCacheSchema);
