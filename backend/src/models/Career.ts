import mongoose, { Schema, Document } from 'mongoose';
import { ICareer } from '../types';

export interface ICareerDocument extends ICareer, Document {}

const CareerSchema: Schema = new Schema({
  role: { type: String, required: true },
  requiredSkills: { type: Map, of: Number, required: true },
  demandScore: { type: Number, min: 0, max: 100, required: true },
  description: { type: String, required: true },
  learningResources: { type: [String], default: [] }
});

export default mongoose.models.Career || mongoose.model<ICareerDocument>('Career', CareerSchema);
