import axios from 'axios';
import { cacheService } from './cacheService';

export class SemanticRecommendationService {
  async getSemanticScore(userSkills: string[], role: string): Promise<number> {
    const cacheKey = `ollama_semantic_${userSkills.sort().join('_')}_${role.replace(/\s+/g, '_')}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;

    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
      
      const prompt = `
        You are an expert technical recruiter and AI systems engineer.
        Evaluate the semantic match between the user's skills and the target role.
        User Skills: ${userSkills.join(', ')}
        Target Role: ${role}
        
        Respond ONLY with a JSON object containing a "semanticScore" (a number between 1 and 100). Do not include any other text or markdown formatting.
      `;

      const response = await axios.post(`${ollamaUrl}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: false,
        format: 'json'
      }, { timeout: 10000 });

      let score = 50; // default
      try {
        const parsed = JSON.parse(response.data.response);
        if (parsed && typeof parsed.semanticScore === 'number') {
          score = Math.max(0, Math.min(100, Math.round(parsed.semanticScore)));
        }
      } catch (e) {
        console.error('Failed to parse Ollama semantic score:', e);
      }

      cacheService.set(cacheKey, score, 86400); // Cache for 24h
      return score;
    } catch (error) {
      console.error('Ollama semantic scoring failed:', error);
      return 50; // Fallback neutral score
    }
  }
}

export const semanticRecommendationService = new SemanticRecommendationService();
