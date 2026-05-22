export interface Question {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  skill: string;
  difficulty: 'beginner' | 'intermediate' | 'expert';
  correct_answer: string;
  explanation?: string;
}

export interface Answer {
  question: string;
  skill: string;
  difficulty: string;
  correct_answer: string;
  user_answer: string;
}

export interface SkillProfile {
  userId: string;
  skillScores: Record<string, number>;
  levelPerSkill: Record<string, string>;
  overallLevel: string;
  assessedAt: string;
}

export interface SkillGap {
  skill: string;
  user_score: number;
  required_score: number;
  gap: number;
}

export interface SkillImprovement {
  skill: string;
  currentScore: number;
  reason: string;
}

export interface SkillGapAgentMissingSkill {
  skill: string;
  userScore: number;
  requiredScore: number;
  gap: number;
  sourceRoles: string[];
  marketRelevance: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface SkillGapAgentAnalysis {
  agentName: string;
  assessmentDomain: string;
  overallGapPercentage: number;
  readinessScore: number;
  gapLevel: 'critical' | 'high' | 'moderate' | 'low';
  missingSkills: SkillGapAgentMissingSkill[];
  requiredCareerSkillsCompared: {
    domain: string;
    role: string;
    requiredSkills: Record<string, number>;
  }[];
  roleGapSummary?: {
    role: string;
    domain: string;
    averageGap: number;
    readinessScore: number;
  }[];
  marketDomainsCompared: {
    domain: string;
    roles: string[];
    trendingSkills: string[];
    marketDemand: number;
  }[];
  marketDrivenSkills: {
    skill: string;
    domain: string;
    marketDemand: number;
    userScore: number;
  }[];
  summary: string;
}

export interface CareerRecommendation {
  rank: number;
  role: string;
  compatibility?: number;
  compatibility_score: number;
  readiness_label: string;
  demand_score: number;
  description: string;
  skill_gap: SkillGap[];
  marketDemand?: number;
  semanticScore?: number;
  interestAlignment?: number;
  finalScore?: number;
  salaryRange?: { min: number; max: number } | null;
  marketTrend?: {
    totalJobs: number;
    remotePercentage: number;
    trendingSkills: string[];
  };
  missingSkills?: string[];
  final_hybrid_score?: number;
  market_demand?: number;
  salary_min?: number;
  salary_max?: number;
  interest_alignment?: number;
  semantic_match?: number;
  trending_skills?: string[];
  explanation?: string;
}

export interface AssessmentResults {
  skillProfile: SkillProfile;
  scoreDetails: {
    overall_score: number;
    level_description: string;
    tier_breakdown: Record<string, { correct: number; total: number; score: number }>;
    per_skill_breakdown: any[];
  };
  recommendations: {
    recommendations: CareerRecommendation[];
    top_recommendation?: string | null;
    overall_level?: string;
    skillsToImprove?: SkillImprovement[];
    skillGapAnalysis?: SkillGapAgentAnalysis;
  } | CareerRecommendation[];
  skillsToImprove?: SkillImprovement[];
  skillGapAnalysis?: SkillGapAgentAnalysis;
}

export interface SyncUserPayload {
  name: string;
  email: string;
  oauthId: string;
  provider: string;
  interests?: string[];
  education?: string;
}

export interface SyncUserResponse {
  userId: string;
  isNew: boolean;
  hasSkillProfile: boolean;
  latestProfile?: SkillProfile | null;
}

export interface StartAssessmentPayload {
  userId: string;
  interests: string[];
  skills: string[];
}

export interface StartAssessmentResponse {
  sessionId: string;
  questions: Question[];
  total: number;
}

export interface SubmitAssessmentPayload {
  userId: string;
  sessionId: string;
  answers: Answer[];
}

export type SubmitAssessmentResponse = AssessmentResults;

export interface Career {
  role: string;
  requiredSkills: Record<string, number>;
  demandScore: number;
  description: string;
  learningResources?: string[];
}
