import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import SkillProfile from '../models/SkillProfile';
import RecommendationHistory from '../models/RecommendationHistory';
import { skillGapAgentService } from '../services/skillGapAgentService';

const router = Router();

function mapLikeToObject(value: any): Record<string, number> {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value.toObject === 'function') return value.toObject();
  return { ...value };
}

router.post(
  '/analyze',
  [
    body('skillScores').optional().isObject().withMessage('skillScores must be an object'),
    body('recommendations').optional().isArray().withMessage('recommendations must be an array'),
  ],
  async (req: Request, res: Response): Promise<any> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const analysis = skillGapAgentService.analyze({
        skillScores: req.body.skillScores || {},
        levelPerSkill: req.body.levelPerSkill || {},
        overallLevel: req.body.overallLevel,
        recommendations: req.body.recommendations || [],
        scoreDetails: req.body.scoreDetails,
        assessmentDomain: req.body.assessmentDomain,
      });

      return res.json(analysis);
    } catch (error) {
      console.error('Error running Skill Gap Agent:', error);
      return res.status(500).json({ error: 'Skill Gap Agent analysis failed' });
    }
  }
);

router.get('/latest/:userId', async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;
    const [skillProfile, history] = await Promise.all([
      SkillProfile.findOne({ userId }).sort({ assessedAt: -1 }),
      RecommendationHistory.findOne({ userId }).sort({ generatedAt: -1 }),
    ]);

    if (!skillProfile) {
      return res.status(404).json({ error: 'No skill profile found for this user' });
    }

    const analysis = skillGapAgentService.analyze({
      skillScores: mapLikeToObject(skillProfile.skillScores),
      levelPerSkill: mapLikeToObject(skillProfile.levelPerSkill) as any,
      overallLevel: skillProfile.overallLevel,
      recommendations: history?.recommendations || [],
    });

    return res.json(analysis);
  } catch (error) {
    console.error('Error fetching latest Skill Gap Agent analysis:', error);
    return res.status(500).json({ error: 'Skill Gap Agent analysis failed' });
  }
});

export default router;
