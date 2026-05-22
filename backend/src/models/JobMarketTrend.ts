import mongoose, { Schema, Document } from 'mongoose';
import { IJobMarketTrend } from '../types';

export interface IJobMarketTrendDocument extends IJobMarketTrend, Document {}

const JobMarketTrendSchema: Schema = new Schema({
  role: { type: String, required: true, unique: true },
  demandScore: { type: Number, required: true },
  totalJobs: { type: Number, required: true },
  avgSalary: { type: Number, required: true },
  trendingSkills: { type: [String], default: [] },
  remotePercentage: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.JobMarketTrend || mongoose.model<IJobMarketTrendDocument>('JobMarketTrend', JobMarketTrendSchema);
