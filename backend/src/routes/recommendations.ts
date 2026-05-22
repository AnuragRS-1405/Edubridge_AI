import { Router, Request, Response } from 'express';
import RecommendationHistory from '../models/RecommendationHistory';

const router = Router();

// GET /api/recommendations/history/:userId
router.get('/history/:userId', async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;
    const history = await RecommendationHistory.findOne({ userId }).sort({ generatedAt: -1 });
    
    if (!history) {
      return res.status(404).json({ error: 'No recommendation history found for this user' });
    }
    
    return res.json(history);
  } catch (error) {
    console.error('Error fetching recommendation history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
