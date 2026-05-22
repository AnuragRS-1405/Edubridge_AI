import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User';
import Session from '../models/Session';
import SkillProfile from '../models/SkillProfile';
import Career from '../models/Career';
import RecommendationHistory from '../models/RecommendationHistory';
import { marketTrendService } from '../services/marketTrendService';
import { semanticRecommendationService } from '../services/semanticRecommendationService';
import { interestAlignmentService } from '../services/interestAlignmentService';
import { recommendationExplanationService } from '../services/recommendationExplanationService';
import { skillGapAgentService } from '../services/skillGapAgentService';

const router = Router();
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8000';

const RECOMMENDATION_WEIGHTS = {
  compatibility: Number(process.env.RECOMMENDATION_WEIGHT_COMPATIBILITY ?? 0.50),
  marketDemand: Number(process.env.RECOMMENDATION_WEIGHT_MARKET ?? 0.25),
  interestAlignment: Number(process.env.RECOMMENDATION_WEIGHT_INTEREST ?? 0.15),
  semanticReasoning: Number(process.env.RECOMMENDATION_WEIGHT_SEMANTIC ?? 0.10),
};

function clampScore(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function mapLikeToObject(value: any): Record<string, number> {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value.toObject === 'function') return value.toObject();
  return { ...value };
}

function normalizeRecommendationList(payload: any): any[] {
  if (Array.isArray(payload?.recommendations)) return payload.recommendations;
  if (Array.isArray(payload)) return payload;
  return [];
}

function calculateHybridScore(
  compatibility: number,
  marketDemand: number,
  interestAlignment: number,
  semanticReasoning: number
): number {
  const raw =
    compatibility * RECOMMENDATION_WEIGHTS.compatibility +
    marketDemand * RECOMMENDATION_WEIGHTS.marketDemand +
    interestAlignment * RECOMMENDATION_WEIGHTS.interestAlignment +
    semanticReasoning * RECOMMENDATION_WEIGHTS.semanticReasoning;
  return clampScore(raw, 0);
}

function buildSkillsToImprove(scoreDetails: any, recommendations: any[]): any[] {
  const bySkill = new Map<string, { skill: string; currentScore: number; reason: string; priority: number }>();

  for (const item of scoreDetails?.per_skill_breakdown || []) {
    const score = clampScore(item.weighted_score, 0);
    if (score < 75) {
      bySkill.set(item.skill, {
        skill: item.skill,
        currentScore: score,
        reason: score < 50
          ? 'Core assessment score needs foundation work.'
          : 'Good foundation, but more practice is needed for stronger role readiness.',
        priority: 100 - score,
      });
    }
  }

  for (const rec of recommendations.slice(0, 3)) {
    for (const gap of rec.skill_gap || []) {
      const existing = bySkill.get(gap.skill);
      const gapSize = clampScore(gap.gap, 0);
      if (existing) {
        existing.priority += gapSize;
        existing.reason = `Needed for ${rec.role}; target score ${gap.required_score}.`;
      } else {
        bySkill.set(gap.skill, {
          skill: gap.skill,
          currentScore: clampScore(gap.user_score, 0),
          reason: `Needed for ${rec.role}; target score ${gap.required_score}.`,
          priority: 75 + gapSize,
        });
      }
    }
  }

  return Array.from(bySkill.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
    .map(({ priority, ...item }) => item);
}

function buildSkillMatchFallbackRecommendations(skillScores: Record<string, number>): any[] {
  const skills = Object.entries(skillScores)
    .map(([skill, score]) => ({ skill, score: clampScore(score, 50) }))
    .sort((a, b) => b.score - a.score);

  if (skills.length === 0) return [];

  const primary = skills[0];
  const secondary = skills[1] || primary;
  const skillText = skills.slice(0, 4).map(item => item.skill).join(', ');
  const candidates = [
    {
      role: `${primary.skill} Engineer`,
      compatibility_score: primary.score,
      description: `A role focused on applying ${primary.skill} to production engineering problems.`
    },
    {
      role: `${primary.skill} Application Developer`,
      compatibility_score: Math.round((primary.score + secondary.score) / 2),
      description: `Build practical applications using ${skillText}.`
    },
    {
      role: 'Full Stack Developer',
      compatibility_score: skills.some(item => /react|javascript|typescript/i.test(item.skill)) && skills.some(item => /node|sql|python/i.test(item.skill)) ? 70 : 52,
      description: 'Work across frontend UI, backend services, and data persistence.'
    },
    {
      role: 'Backend Developer',
      compatibility_score: skills.some(item => /node|python|java|sql/i.test(item.skill)) ? 68 : 50,
      description: 'Design APIs, business logic, and server-side data flows.'
    },
    {
      role: 'Data Analyst',
      compatibility_score: skills.some(item => /sql|python|statistics|excel/i.test(item.skill)) ? 66 : 48,
      description: 'Analyze datasets and translate metrics into decisions.'
    },
    {
      role: 'DevOps Engineer',
      compatibility_score: skills.some(item => /docker|linux|cloud/i.test(item.skill)) ? 66 : 47,
      description: 'Improve deployment automation, infrastructure reliability, and observability.'
    },
  ];

  return candidates
    .filter((candidate, index, array) => array.findIndex(item => item.role === candidate.role) === index)
    .sort((a, b) => b.compatibility_score - a.compatibility_score)
    .slice(0, 6)
    .map(candidate => ({
      ...candidate,
      readiness_label: candidate.compatibility_score >= 70 ? 'Almost ready' : 'Some preparation needed',
      skill_gap: [],
      demand_score: 50,
    }));
}

// POST /api/assessment/start
router.post(
  '/start',
  [
    body('userId').isMongoId().withMessage('Valid User ID is required'),
    body('interests').isArray().withMessage('Interests must be an array'),
    body('skills').isArray().withMessage('Skills must be an array'),
  ],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId, interests, skills } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      user.interests = interests;
      await user.save();

      // Determine domain from first interest or default
      const domain = interests.length > 0 ? interests[0].toLowerCase().replace(/ /g, '_') : 'general';

      let aiResponse;
      try {
        aiResponse = await axios.post(`${FASTAPI_BASE_URL}/api/generate-questions`, {
          domain,
          skills
        });
      } catch (error) {
        const upstreamStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
        const detail = axios.isAxiosError(error)
          ? error.response?.data?.detail || error.response?.data?.error || error.message
          : 'AI service unavailable';

        console.error('Error calling AI service (/generate-questions):', detail);
        return res.status(upstreamStatus === 503 ? 503 : 502).json({ error: `AI question generation failed: ${detail}` });
      }

      const questions = aiResponse.data.questions;
      const total = aiResponse.data.total;
      const sessionId = uuidv4();

      const session = new Session({
        sessionId,
        userId,
        questions,
      });
      await session.save();

      return res.json({
        sessionId,
        questions,
        total
      });
    } catch (error) {
      console.error('Error starting assessment:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/assessment/submit
router.post(
  '/submit',
  [
    body('userId').isMongoId().withMessage('Valid User ID is required'),
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('answers').isArray().withMessage('Answers must be an array'),
  ],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId, sessionId, answers } = req.body;

      const session = await Session.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({ error: 'Assessment session not found or expired' });
      }

      // Call Python scoring service
      let scoreResponse;
      try {
        scoreResponse = await axios.post(`${FASTAPI_BASE_URL}/api/score-assessment`, {
          answers
        });
      } catch (error) {
        console.error('Error calling AI service (/score-assessment):', error);
        return res.status(502).json({ error: 'AI service unavailable' });
      }

      const { skill_scores, level_per_skill, overall_level } = scoreResponse.data;

      const user = await User.findById(userId);
      const userInterests = user?.interests || [];
      const userSkills = Object.keys(skill_scores);

      // Fetch career dataset
      const careers = await Career.find({});
      const career_dataset = careers.map(c => ({
        role: c.role,
        requiredSkills: mapLikeToObject(c.requiredSkills),
        demandScore: clampScore(c.demandScore, 50),
        description: c.description
      }));

      // Call Python recommend service
      let recommendResponse;
      try {
        recommendResponse = await axios.post(`${FASTAPI_BASE_URL}/api/recommend-careers`, {
          skill_scores,
          level_per_skill,
          overall_level,
          career_dataset,
          interests: userInterests
        });
      } catch (error) {
        console.error('Error calling AI service (/recommend-careers):', error);
        recommendResponse = {
          data: {
            recommendations: buildSkillMatchFallbackRecommendations(skill_scores)
          }
        };
      }

      const aiRecommendations = recommendResponse.data;

      // Prepare fallback recommendations in case enrichment fails
      const fallbackRecs = buildSkillMatchFallbackRecommendations(skill_scores);

      const enrichedRecommendations = [];

      for (const rec of normalizeRecommendationList(aiRecommendations)) {
        let marketData;
        try {
          marketData = await marketTrendService.getOrUpdateMarketTrend(rec.role);
        } catch (e) {
          console.error('Market fetch error for role', rec.role, e);
          marketData = { demandScore: 50, avgSalary: 0, trendingSkills: [], remotePercentage: 0 };
        }

        const compatibility = clampScore(rec.compatibility_score ?? rec.compatibility, 0);
        const marketDemand = clampScore(marketData.demandScore ?? rec.demand_score, 50);
        const interestScore = await interestAlignmentService.getInterestScore(userInterests, rec.role);
        const semanticScore = await semanticRecommendationService.getSemanticScore(userSkills, rec.role);

        const finalScore = calculateHybridScore(compatibility, marketDemand, interestScore, semanticScore);

        const explanation = await recommendationExplanationService.generateExplanation(
          rec.role,
          { skillScores: new Map(Object.entries(skill_scores)), overallLevel: overall_level },
          marketData,
          interestScore
        );

        enrichedRecommendations.push({
          ...rec,
          compatibility,
          compatibility_score: compatibility,
          marketDemand,
          market_demand: marketDemand,
          semanticScore,
          semantic_match: semanticScore,
          interestAlignment: interestScore,
          interest_alignment: interestScore,
          finalScore,
          final_hybrid_score: finalScore,
          salary_min: marketData.avgSalary > 0 ? Math.round(marketData.avgSalary * 0.8) : 0,
          salary_max: marketData.avgSalary > 0 ? Math.round(marketData.avgSalary * 1.2) : 0,
          salaryRange: marketData.avgSalary > 0
            ? { min: Math.round(marketData.avgSalary * 0.8), max: Math.round(marketData.avgSalary * 1.2) }
            : null,
          marketTrend: {
            totalJobs: marketData.totalJobs ?? 0,
            remotePercentage: marketData.remotePercentage ?? 0,
            trendingSkills: marketData.trendingSkills ?? []
          },
          trending_skills: marketData.trendingSkills ?? [],
          missingSkills: rec.missingSkills ?? (rec.skill_gap || []).map((gap: any) => gap.skill),
          explanation,
        });
      }

      // If enrichment produced no results, use fallback list
      if (enrichedRecommendations.length === 0) {
        for (const rec of fallbackRecs) {
          const compatibility = clampScore(rec.compatibility_score, 50);
          const finalScore = calculateHybridScore(compatibility, 50, 50, 50);
          enrichedRecommendations.push({
            ...rec,
            compatibility,
            compatibility_score: compatibility,
            finalScore,
            final_hybrid_score: finalScore,
            marketDemand: 50,
            market_demand: 50,
            semanticScore: 50,
            semantic_match: 50,
            interestAlignment: 50,
            interest_alignment: 50,
            salary_min: 0,
            salary_max: 0,
            salaryRange: null,
            marketTrend: { totalJobs: 0, remotePercentage: 0, trendingSkills: [] },
            trending_skills: [],
            missingSkills: [],
            explanation: 'Recommended from your assessed skills while live recommendation enrichment is unavailable.',
          });
        }
      }

      // Re-sort by hybrid score
      enrichedRecommendations.sort((a, b) => b.finalScore - a.finalScore);
      enrichedRecommendations.forEach((rec, index) => {
        rec.rank = index + 1;
      });
      const top_recommendation = enrichedRecommendations.length > 0 ? enrichedRecommendations[0].role : null;
      const skillsToImprove = buildSkillsToImprove(scoreResponse.data, enrichedRecommendations);
      const skillGapAnalysis = skillGapAgentService.analyze({
        skillScores: skill_scores,
        levelPerSkill: level_per_skill,
        overallLevel: overall_level,
        recommendations: enrichedRecommendations,
        scoreDetails: scoreResponse.data,
        assessmentDomain: userInterests[0],
      });

      const recommendations = {
        recommendations: enrichedRecommendations,
        top_recommendation,
        overall_level: aiRecommendations.overall_level,
        skillsToImprove,
        skillGapAnalysis
      };

      // Save RecommendationHistory
      await RecommendationHistory.create({
        userId,
        recommendations: enrichedRecommendations
      });

      // Save SkillProfile
      const skillProfile = new SkillProfile({
        userId,
        skillScores: skill_scores,
        levelPerSkill: level_per_skill,
        overallLevel: overall_level,
      });
      await skillProfile.save();

      // Clear session after submission
      await Session.deleteOne({ _id: session._id });

      return res.json({
        skillProfile,
        scoreDetails: scoreResponse.data,
        recommendations,
        skillsToImprove,
        skillGapAnalysis
      });
    } catch (error) {
      console.error('Error submitting assessment:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/assessment/results/:userId
router.get(
  '/results/:userId',
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { userId } = req.params;

      const skillProfile = await SkillProfile.findOne({ userId }).sort({ assessedAt: -1 });
      if (!skillProfile) {
        return res.status(404).json({ error: 'No skill profile found for this user' });
      }

      return res.json(skillProfile);
    } catch (error) {
      console.error('Error fetching results:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
