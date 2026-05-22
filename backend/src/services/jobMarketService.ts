import axios from 'axios';
import { normalizeAdzunaJob, NormalizedJob } from '../utils/jobNormalizer';
import { cacheService } from './cacheService';

export class JobMarketService {
  async getJobsForRole(role: string): Promise<NormalizedJob[]> {
    const cacheKey = `adzuna_jobs_${role.toLowerCase()}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
      console.warn(`Adzuna credentials are not configured. Skipping live market fetch for role ${role}.`);
      return [];
    }

    try {
      const country = process.env.ADZUNA_COUNTRY || 'in';
      const adzunaBaseUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/1`;
      console.log(`Fetching Adzuna jobs for role="${role}" country="${country}"`);
      const response = await axios.get(adzunaBaseUrl, {
        params: {
          app_id: process.env.ADZUNA_APP_ID,
          app_key: process.env.ADZUNA_APP_KEY,
          what: role,
          results_per_page: 50
        },
        timeout: 5000 // 5 seconds timeout
      });

      const jobs = response.data.results || [];
      const normalizedJobs = jobs.map((job: any) => normalizeAdzunaJob(job));
      
      // Cache for 1 hour
      cacheService.set(cacheKey, normalizedJobs, 3600);
      return normalizedJobs;
    } catch (error) {
      console.error(`Error fetching jobs for role ${role} from Adzuna:`, error);
      // Fallback: return empty array so the rest of the flow doesn't break
      return [];
    }
  }
}

export const jobMarketService = new JobMarketService();
