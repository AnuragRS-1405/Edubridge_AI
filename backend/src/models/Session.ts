import mongoose, { Schema, Document } from 'mongoose';
import { ISession } from '../types';

export interface ISessionDocument extends ISession, Document {}

const SessionSchema: Schema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  questions: { type: Array, required: true },
  createdAt: { type: Date, default: Date.now }
});

// TTL index: expire after 2 hours (7200 seconds)
SessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });

export default mongoose.models.Session || mongoose.model<ISessionDocument>('Session', SessionSchema);
