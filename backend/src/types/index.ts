import { ObjectId } from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  interests: string[];
  education: string;
  provider: 'google' | 'github' | 'microsoft' | 'facebook' | 'linkedin' | 'credentials';
  oauthId: string;
  createdAt: Date;
}

export interface IQuestion {
  domain: string;
  skill: string;
  difficulty: 'beginner' | 'intermediate' | 'expert';
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

export interface ISkillProfile {
  userId: ObjectId;
  skillScores: Map<string, number>;
  levelPerSkill: Map<string, string>;
  overallLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional';
  assessedAt: Date;
}

export interface ICareer {
  role: string;
  requiredSkills: Map<string, number>;
  demandScore: number;
  description: string;
  learningResources: string[];
}

export interface ISession {
  sessionId: string;
  userId: ObjectId;
  questions: any[];
  createdAt: Date;
}

export interface IJobMarketTrend {
  role: string;
  demandScore: number;
  totalJobs: number;
  avgSalary: number;
  trendingSkills: string[];
  remotePercentage: number;
  updatedAt: Date;
}

export interface IRecommendationHistory {
  userId: ObjectId;
  recommendations: any[];
  generatedAt: Date;
}
