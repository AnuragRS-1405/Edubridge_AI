import mongoose, { Schema, Document } from 'mongoose';
import { IRecommendationHistory } from '../types';

export interface IRecommendationHistoryDocument extends IRecommendationHistory, Document {}

const RecommendationHistorySchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recommendations: { type: [Schema.Types.Mixed], default: [] },
  generatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.RecommendationHistory || mongoose.model<IRecommendationHistoryDocument>('RecommendationHistory', RecommendationHistorySchema);
