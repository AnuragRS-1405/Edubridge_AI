import mongoose, { Schema, Document } from 'mongoose';
import { IQuestion } from '../types';

export interface IQuestionDocument extends IQuestion, Document {}

const QuestionSchema: Schema = new Schema({
  domain: { type: String, required: true },
  skill: { type: String, required: true },
  difficulty: { type: String, enum: ['beginner', 'intermediate', 'expert'], required: true },
  questionText: { type: String, required: true },
  options: {
    A: { type: String, required: true },
    B: { type: String, required: true },
    C: { type: String, required: true },
    D: { type: String, required: true }
  },
  correctAnswer: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
  explanation: { type: String, required: true },
});

export default mongoose.models.Question || mongoose.model<IQuestionDocument>('Question', QuestionSchema);
