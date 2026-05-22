import { Router, Request, Response } from 'express';
import Career from '../models/Career';

const router = Router();

// GET /api/careers
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const careers = await Career.find({});
    return res.json(careers);
  } catch (error) {
    console.error('Error fetching careers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/careers/:role
router.get('/:role', async (req: Request, res: Response): Promise<any> => {
  try {
    const role = decodeURIComponent(req.params.role as string);
    const career = await Career.findOne({ role });
    
    if (!career) {
      return res.status(404).json({ error: 'Career not found' });
    }
    
    return res.json(career);
  } catch (error) {
    console.error('Error fetching career:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
