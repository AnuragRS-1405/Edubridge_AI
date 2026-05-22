import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from '../types';

export interface IUserDocument extends IUser, Document {}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  interests: { type: [String], default: [] },
  education: { type: String },
  provider: { type: String, enum: ['google', 'github', 'microsoft', 'facebook', 'linkedin', 'credentials'], required: true },
  oauthId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);
