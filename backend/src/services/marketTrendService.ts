import { jobMarketService } from './jobMarketService';
import JobMarketTrend from '../models/JobMarketTrend';

export class MarketTrendService {
  async getOrUpdateMarketTrend(role: string): Promise<any> {
    // Check if we have a recent trend in DB
    const recentTrend = await JobMarketTrend.findOne({ role });
    if (recentTrend) {
      // If updated within last 24 hours, use it
      const hoursSinceUpdate = (Date.now() - recentTrend.updatedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 24) {
        return recentTrend;
      }
    }

    // Otherwise, fetch from Adzuna and compute
    const jobs = await jobMarketService.getJobsForRole(role);
    
    if (jobs.length === 0) {
      // If API fails or no jobs, return existing trend or default
      return recentTrend || {
        role,
        demandScore: 50, // default neutral score
        totalJobs: 0,
        avgSalary: 0,
        trendingSkills: [],
        remotePercentage: 0,
        updatedAt: new Date()
      };
    }

    const totalJobs = jobs.length; // We only fetched 50 max, but let's assume it represents demand
    
    let totalSalary = 0;
    let salaryCount = 0;
    let remoteCount = 0;
    const skillCounts: Record<string, number> = {};

    for (const job of jobs) {
      if (job.salaryMin && job.salaryMax) {
        totalSalary += (job.salaryMin + job.salaryMax) / 2;
        salaryCount++;
      }
      if (job.remote) {
        remoteCount++;
      }
      for (const skill of job.skills) {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      }
    }

    const avgSalary = salaryCount > 0 ? Math.round(totalSalary / salaryCount) : 0;
    const remotePercentage = totalJobs > 0 ? Math.round((remoteCount / totalJobs) * 100) : 0;
    
    const trendingSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);

    // Calculate Demand Score
    // 40% job count, 30% salary trend, 20% skill popularity, 10% remote trend
    // Normalizing counts to a 1-100 scale using basic heuristics for MVP
    const countScore = Math.min((totalJobs / 50) * 100, 100) * 0.4;
    const salaryScore = Math.min((avgSalary / 200000) * 100, 100) * 0.3; // Assuming 200k max for normalization
    const skillScore = Math.min((trendingSkills.length / 5) * 100, 100) * 0.2;
    const remoteScore = remotePercentage * 0.1;
    
    let demandScore = Math.round(countScore + salaryScore + skillScore + remoteScore);
    // Ensure between 1 and 100
    demandScore = Math.max(1, Math.min(demandScore, 100));

    const trendData = {
      role,
      demandScore,
      totalJobs,
      avgSalary,
      trendingSkills,
      remotePercentage,
      updatedAt: new Date()
    };

    // Upsert to DB
    const updatedTrend = await JobMarketTrend.findOneAndUpdate(
      { role },
      { $set: trendData },
      { upsert: true, new: true }
    );

    return updatedTrend;
  }
}

export const marketTrendService = new MarketTrendService();
