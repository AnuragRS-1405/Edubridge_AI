import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';

import usersRoutes from './routes/users';
import assessmentRoutes from './routes/assessment';
import careersRoutes from './routes/careers';
import marketRoutes from './routes/market';
import recommendationsRoutes from './routes/recommendations';
import skillGapRoutes from './routes/skillGap';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routers
app.use('/api/users', usersRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/careers', careersRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/skill-gap', skillGapRoutes);

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
