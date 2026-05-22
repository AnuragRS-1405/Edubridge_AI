import { Router, Request, Response } from 'express';
import JobMarketTrend from '../models/JobMarketTrend';
import Career from '../models/Career';
import { marketTrendService } from '../services/marketTrendService';

const router = Router();

// GET /api/market/trends
router.get('/trends', async (req: Request, res: Response): Promise<any> => {
  try {
    const trends = await JobMarketTrend.find({}).sort({ demandScore: -1 }).limit(10);
    return res.json(trends);
  } catch (error) {
    console.error('Error fetching market trends:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/market/sync
// This endpoint can be triggered by an external scheduler like n8n or node-cron
router.post('/sync', async (req: Request, res: Response): Promise<any> => {
  try {
    const careers = await Career.find({});
    
    // Process in batches or one by one
    let synced = 0;
    for (const career of careers) {
      await marketTrendService.getOrUpdateMarketTrend(career.role);
      synced++;
    }

    return res.json({ message: 'Market sync completed successfully', syncedCount: synced });
  } catch (error) {
    console.error('Error during market sync:', error);
    return res.status(500).json({ error: 'Internal server error during market sync' });
  }
});

export default router;
