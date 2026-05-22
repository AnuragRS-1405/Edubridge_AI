import mongoose, { Schema, Document } from 'mongoose';
import { ISkillProfile } from '../types';

export interface ISkillProfileDocument extends ISkillProfile, Document {}

const SkillProfileSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  skillScores: { type: Map, of: Number, required: true },
  levelPerSkill: { type: Map, of: String, required: true },
  overallLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'professional'], required: true },
  assessedAt: { type: Date, default: Date.now }
});

export default mongoose.models.SkillProfile || mongoose.model<ISkillProfileDocument>('SkillProfile', SkillProfileSchema);
