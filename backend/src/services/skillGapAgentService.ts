import careerSkillRequirements from '../data/careerSkillRequirements.json';
import jobMarketDomains from '../data/jobMarketDomains.json';

type ScoreMap = Record<string, number>;

interface CareerRequirement {
  domain: string;
  role: string;
  requiredSkills: ScoreMap;
}

interface JobMarketDomain {
  domain: string;
  roles: string[];
  trendingSkills: string[];
  marketDemand: number;
}

export interface SkillGapAgentInput {
  skillScores: ScoreMap;
  levelPerSkill?: Record<string, string>;
  overallLevel?: string;
  recommendations: any[];
  scoreDetails?: any;
  assessmentDomain?: string;
}

interface SkillGapDetail {
  skill: string;
  userScore: number;
  requiredScore: number;
  gap: number;
  sourceRoles: string[];
  marketRelevance: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

function clampScore(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[/.+#_-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter(token => token.length > 1));
}

function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (normalize(a) === normalize(b)) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  const overlap = [...left].filter(token => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  const jaccard = overlap / union;
  const contains = normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a)) ? 0.85 : 0;
  return Math.max(jaccard, contains);
}

function bestUserScore(requiredSkill: string, skillScores: ScoreMap): number {
  let best = 0;
  for (const [skill, score] of Object.entries(skillScores)) {
    const match = similarity(requiredSkill, skill);
    if (match >= 0.45) {
      best = Math.max(best, clampScore(score) * match);
    }
  }
  return clampScore(best);
}

function inferAssessmentDomain(input: SkillGapAgentInput): string {
  if (input.assessmentDomain) return normalize(input.assessmentDomain).replace(/\s/g, '_');

  const text = [
    ...Object.keys(input.skillScores),
    ...(input.recommendations || []).slice(0, 3).map(rec => String(rec.role || '')),
  ].join(' ');

  let bestDomain = 'general';
  let bestScore = 0;
  for (const domain of jobMarketDomains as unknown as JobMarketDomain[]) {
    const domainText = `${domain.domain} ${domain.roles.join(' ')} ${domain.trendingSkills.join(' ')}`;
    const score = similarity(text, domainText);
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain.domain;
    }
  }
  return bestDomain;
}

function pickRelevantRequirements(input: SkillGapAgentInput): CareerRequirement[] {
  const recommendations = input.recommendations || [];
  const requirementData = careerSkillRequirements as unknown as CareerRequirement[];
  const selected = new Map<string, CareerRequirement>();

  for (const rec of recommendations.slice(0, 5)) {
    const exact = requirementData.find(item => normalize(item.role) === normalize(String(rec.role || '')));
    if (exact) selected.set(exact.role, exact);
  }

  for (const rec of recommendations.slice(0, 5)) {
    if (selected.size >= 5) break;
    const closest = requirementData
      .map(item => ({ item, score: similarity(item.role, String(rec.role || '')) }))
      .filter(match => match.score >= 0.35)
      .sort((a, b) => b.score - a.score)[0];
    if (closest) selected.set(closest.item.role, closest.item);
  }

  if (selected.size === 0) {
    const domain = inferAssessmentDomain(input);
    for (const requirement of requirementData.filter(item => item.domain === domain).slice(0, 3)) {
      selected.set(requirement.role, requirement);
    }
  }

  return Array.from(selected.values());
}

function priorityFor(gap: number, marketRelevance: number): SkillGapDetail['priority'] {
  if (gap >= 45 || (gap >= 30 && marketRelevance >= 80)) return 'critical';
  if (gap >= 30) return 'high';
  if (gap >= 15) return 'medium';
  return 'low';
}

function marketRelevanceForSkill(skill: string, domains: JobMarketDomain[]): number {
  let relevance = 40;
  for (const domain of domains) {
    const isTrending = domain.trendingSkills.some(trend => similarity(skill, trend) >= 0.45);
    if (isTrending) relevance = Math.max(relevance, clampScore(domain.marketDemand, 50));
  }
  return relevance;
}

function getRelevantMarketDomains(assessmentDomain: string, recommendations: any[]): JobMarketDomain[] {
  const domains = jobMarketDomains as unknown as JobMarketDomain[];
  const scored = domains.map(domain => {
    const roleText = recommendations.map(rec => String(rec.role || '')).join(' ');
    const semanticScore = recommendations.reduce(
      (max, rec) => Math.max(max, clampScore(rec.semanticScore ?? rec.semantic_match ?? 0)),
      0
    );
    const roleSimilarity = similarity(roleText, `${domain.domain} ${domain.roles.join(' ')}`);
    const assessmentSimilarity = similarity(assessmentDomain, domain.domain);
    return {
      domain,
      score: clampScore((roleSimilarity * 55) + (assessmentSimilarity * 25) + (semanticScore * 0.2)),
    };
  });

  return scored
    .filter(item => item.score >= 25 || item.domain.domain === assessmentDomain)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.domain);
}

export const skillGapAgentService = {
  analyze(input: SkillGapAgentInput) {
    const skillScores = input.skillScores || {};
    const assessmentDomain = inferAssessmentDomain(input);
    const recommendations = input.recommendations || [];
    const relevantRequirements = pickRelevantRequirements(input);
    const relevantMarketDomains = getRelevantMarketDomains(assessmentDomain, recommendations);
    const gapMap = new Map<string, SkillGapDetail>();

    for (const career of relevantRequirements) {
      for (const [requiredSkill, requiredRaw] of Object.entries(career.requiredSkills)) {
        const requiredScore = clampScore(requiredRaw);
        const userScore = bestUserScore(requiredSkill, skillScores);
        const gap = Math.max(0, requiredScore - userScore);
        if (gap <= 0) continue;

        const existing = gapMap.get(normalize(requiredSkill));
        const marketRelevance = marketRelevanceForSkill(requiredSkill, relevantMarketDomains);
        if (existing) {
          existing.requiredScore = Math.max(existing.requiredScore, requiredScore);
          existing.userScore = Math.min(existing.userScore, userScore);
          existing.gap = Math.max(existing.gap, gap);
          existing.marketRelevance = Math.max(existing.marketRelevance, marketRelevance);
          if (!existing.sourceRoles.includes(career.role)) existing.sourceRoles.push(career.role);
          existing.priority = priorityFor(existing.gap, existing.marketRelevance);
        } else {
          gapMap.set(normalize(requiredSkill), {
            skill: requiredSkill,
            userScore,
            requiredScore,
            gap,
            sourceRoles: [career.role],
            marketRelevance,
            priority: priorityFor(gap, marketRelevance),
          });
        }
      }
    }

    const missingSkills = Array.from(gapMap.values())
      .sort((a, b) => (b.gap + b.marketRelevance * 0.25) - (a.gap + a.marketRelevance * 0.25));

    const totalGap = missingSkills.reduce((sum, item) => sum + item.gap, 0);
    const overallGapPercentage = missingSkills.length > 0
      ? clampScore(totalGap / missingSkills.length)
      : 0;

    const readinessScore = clampScore(100 - overallGapPercentage);
    const roleGapSummary = relevantRequirements.map(career => {
      const roleGaps = Object.entries(career.requiredSkills).map(([skill, required]) => {
        const userScore = bestUserScore(skill, skillScores);
        return Math.max(0, clampScore(required) - userScore);
      });
      const averageGap = roleGaps.length
        ? clampScore(roleGaps.reduce((sum, gap) => sum + gap, 0) / roleGaps.length)
        : 0;
      return {
        role: career.role,
        domain: career.domain,
        averageGap,
        readinessScore: clampScore(100 - averageGap),
      };
    }).sort((a, b) => a.averageGap - b.averageGap);

    const marketDrivenSkills = relevantMarketDomains
      .flatMap(domain => domain.trendingSkills.map(skill => ({
        skill,
        domain: domain.domain,
        marketDemand: domain.marketDemand,
        userScore: bestUserScore(skill, skillScores),
      })))
      .filter(item => item.userScore < 70)
      .filter((item, index, array) => array.findIndex(other => normalize(other.skill) === normalize(item.skill)) === index)
      .sort((a, b) => b.marketDemand - a.marketDemand)
      .slice(0, 8);

    return {
      agentName: 'Skill Gap Agent',
      assessmentDomain,
      overallGapPercentage,
      readinessScore,
      gapLevel: overallGapPercentage >= 45 ? 'critical' : overallGapPercentage >= 30 ? 'high' : overallGapPercentage >= 15 ? 'moderate' : 'low',
      missingSkills: missingSkills.slice(0, 10),
      requiredCareerSkillsCompared: relevantRequirements,
      roleGapSummary,
      marketDomainsCompared: relevantMarketDomains,
      marketDrivenSkills,
      summary: missingSkills.length
        ? `Skill Gap Agent found a ${overallGapPercentage}% average gap against recommended career requirements and current market trends.`
        : 'Skill Gap Agent found no major deterministic gaps against the selected career requirements.',
    };
  },
};
