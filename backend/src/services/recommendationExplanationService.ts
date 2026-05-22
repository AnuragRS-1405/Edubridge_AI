import axios from 'axios';
import { cacheService } from './cacheService';

export class RecommendationExplanationService {
  async generateExplanation(
    role: string,
    skillProfile: any,
    marketData: any,
    interestScore: number
  ): Promise<string> {
    const userSkills = Array.from(skillProfile.skillScores.keys()).join(', ');
    const cacheKey = `ollama_explain_${userSkills.replace(/\s+/g, '_')}_${role.replace(/\s+/g, '_')}`;
    
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;

    try {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
      
      let marketContext = '';
      if (marketData && marketData.demandScore > 0) {
        marketContext = `Market Demand is currently at ${marketData.demandScore}/100 with ${marketData.totalJobs} recent listings.`;
      } else {
         marketContext = `Market data is currently unavailable.`;
      }
      
      const prompt = `
        You are an expert career advisor. Explain in ONE short, engaging sentence why the role "${role}" is recommended for this user.
        Context:
        User Skills: ${userSkills}
        User Overall Level: ${skillProfile.overallLevel}
        Market Data: ${marketContext}
        Interest Alignment Score: ${interestScore}/100
        
        Keep it concise, professional, and encouraging. Focus on the alignment of skills and market demand.
        Return ONLY the explanation text, no quotes or intro.
      `;

      const response = await axios.post(`${ollamaUrl}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: false,
      }, { timeout: 15000 });

      const explanation = response.data.response.trim();
      cacheService.set(cacheKey, explanation, 86400); // Cache for 24h
      return explanation;
    } catch (error) {
      console.error('Ollama explanation generation failed:', error);
      return `Recommended based on your current skill profile and market trends.`;
    }
  }
}

export const recommendationExplanationService = new RecommendationExplanationService();
