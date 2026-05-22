import axios from 'axios';
import { cacheService } from './cacheService';

function clampScore(value: unknown, fallback = 50): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function lexicalInterestScore(userInterests: string[], role: string): number {
  if (!userInterests.length) return 50;

  const roleTokens = new Set(role.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean));
  let best = 30;

  for (const interest of userInterests) {
    const interestTokens = interest.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
    if (role.toLowerCase().includes(interest.toLowerCase())) {
      best = Math.max(best, 95);
      continue;
    }

    const overlap = interestTokens.filter(token => roleTokens.has(token)).length;
    if (overlap > 0) {
      best = Math.max(best, Math.min(85, 45 + overlap * 20));
    }
  }

  return best;
}

export class InterestAlignmentService {
  async getInterestScore(userInterests: string[], role: string): Promise<number> {
    const interests = (userInterests || []).filter(Boolean);
    if (interests.length === 0) return 50;

    const cacheKey = `ollama_interest_${interests.slice().sort().join('_')}_${role.replace(/\s+/g, '_')}`;
    const cached = cacheService.get(cacheKey);
    if (cached !== null) return cached;

    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
      const prompt = `
You are an expert career advisor.
Score how strongly the learner's interests align with the target role.
Interests: ${interests.join(', ')}
Target role: ${role}

Return ONLY valid JSON: {"interestAlignment": number}
The number must be between 0 and 100.
`;

      const response = await axios.post(`${ollamaUrl}/api/generate`, {
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
      }, { timeout: 10000 });

      const parsed = JSON.parse(response.data.response);
      const score = clampScore(parsed?.interestAlignment, lexicalInterestScore(interests, role));
      cacheService.set(cacheKey, score, 86400);
      return score;
    } catch (error) {
      console.error('Ollama interest alignment failed:', error);
      return lexicalInterestScore(interests, role);
    }
  }
}

export const interestAlignmentService = new InterestAlignmentService();
