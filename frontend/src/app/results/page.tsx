"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, Briefcase, BarChart3, RefreshCw, AlertCircle, CheckCircle2, TrendingUp, Sparkles, DollarSign, Target, Gauge, Layers3 } from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { AssessmentResults, CareerRecommendation, SkillGap, SkillImprovement } from "../../types/assessment";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-blue-100 text-blue-800 border-blue-200",
  intermediate: "bg-amber-100 text-amber-800 border-amber-200",
  advanced: "bg-emerald-100 text-emerald-800 border-emerald-200",
  professional: "bg-purple-100 text-purple-800 border-purple-200"
};

const TIER_COLORS: Record<string, string> = {
  beginner: "text-blue-600",
  intermediate: "text-amber-600",
  expert: "text-rose-600"
};

export default function ResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState<AssessmentResults | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("assessmentResults");
    if (!stored) {
      router.replace("/");
      return;
    }
    setResults(JSON.parse(stored));
  }, [router]);

  if (!results) return null;

  const { skillProfile, scoreDetails, recommendations } = results;
  const { overallLevel } = skillProfile;
  const badgeColor = LEVEL_COLORS[overallLevel.toLowerCase()] || LEVEL_COLORS["beginner"];
  const recommendationList = Array.isArray(recommendations)
    ? recommendations
    : recommendations?.recommendations || [];
  const skillsToImprove: SkillImprovement[] = results.skillsToImprove
    || (!Array.isArray(recommendations) ? recommendations?.skillsToImprove : undefined)
    || scoreDetails.per_skill_breakdown
      .filter((skill: any) => Number(skill.weighted_score) < 75)
      .sort((a: any, b: any) => Number(a.weighted_score) - Number(b.weighted_score))
      .slice(0, 5)
      .map((skill: any) => ({
        skill: skill.skill,
        currentScore: Number(skill.weighted_score) || 0,
        reason: "Practice this area to improve your assessment readiness."
      }));
  const skillGapAnalysis = results.skillGapAnalysis
    || (!Array.isArray(recommendations) ? recommendations?.skillGapAnalysis : undefined);

  const handleRetake = () => {
    sessionStorage.removeItem("assessmentSessionId");
    sessionStorage.removeItem("assessmentQuestions");
    sessionStorage.removeItem("assessmentResults");
    router.push("/assess?retake=1");
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* HEADER / LEVEL BADGE */}
        <div className="bg-white rounded-3xl p-8 sm:p-12 text-center shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 to-indigo-600" />
          <div className="inline-flex items-center justify-center p-4 bg-slate-50 rounded-full mb-6">
            <Award className="w-12 h-12 text-blue-600" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
            Your Assessment Results
          </h1>
          <div className="flex flex-col items-center gap-4 mt-6">
            <span className={cn("px-6 py-2 rounded-full text-lg font-bold border-2 uppercase tracking-wider", badgeColor)}>
              {overallLevel}
            </span>
            <p className="text-slate-600 text-lg max-w-2xl">
              {scoreDetails.level_description}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: Tiers & Skills */}
          <div className="lg:col-span-1 space-y-8">
            
            {/* TIER BREAKDOWN */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <BarChart3 className="text-blue-600 w-5 h-5" /> Tier Breakdown
              </h3>
              <div className="space-y-4">
                {Object.entries(scoreDetails.tier_breakdown).map(([tier, data]: [string, any]) => (
                  <div key={tier} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className={cn("font-bold capitalize", TIER_COLORS[tier.toLowerCase()] || "text-slate-700")}>
                        {tier}
                      </span>
                      <span className="font-semibold text-slate-900">{data.score}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full", tier === 'beginner' ? 'bg-blue-500' : tier === 'intermediate' ? 'bg-amber-500' : 'bg-rose-500')}
                        style={{ width: `${data.score}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-right">
                      {data.correct} / {data.total} correct
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* SKILL SCORES */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <CheckCircle2 className="text-blue-600 w-5 h-5" /> Skill Mastery
              </h3>
              <div className="space-y-6">
                {scoreDetails.per_skill_breakdown.map((skill: any) => (
                  <div key={skill.skill}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="font-semibold text-slate-800">{skill.skill}</span>
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded uppercase", LEVEL_COLORS[skill.level.toLowerCase()] || LEVEL_COLORS.beginner)}>
                        {skill.level}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-slate-800 rounded-full"
                        style={{ width: `${skill.weighted_score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {skillsToImprove.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-5 flex items-center gap-2">
                  <AlertCircle className="text-amber-500 w-5 h-5" /> Skills to Improve
                </h3>
                <div className="space-y-4">
                  {skillsToImprove.map((item) => (
                    <div key={item.skill} className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-bold text-slate-900">{item.skill}</span>
                        <span className="text-sm font-semibold text-amber-700">{item.currentScore}%</span>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700">{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {skillGapAnalysis && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-5 flex items-center gap-2">
                  <Target className="text-rose-500 w-5 h-5" /> Skill Gap Agent
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                    <div className="text-3xl font-extrabold text-rose-600">{skillGapAnalysis.overallGapPercentage}%</div>
                    <div className="text-xs font-bold uppercase text-rose-700">Overall Gap</div>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="text-3xl font-extrabold text-emerald-600">{skillGapAnalysis.readinessScore}%</div>
                    <div className="text-xs font-bold uppercase text-emerald-700">Readiness</div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-700 mb-4">{skillGapAnalysis.summary}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-700">
                    {skillGapAnalysis.assessmentDomain.replace(/_/g, " ")}
                  </span>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold uppercase",
                    skillGapAnalysis.gapLevel === "critical" ? "bg-rose-100 text-rose-700" :
                    skillGapAnalysis.gapLevel === "high" ? "bg-amber-100 text-amber-700" :
                    "bg-blue-100 text-blue-700"
                  )}>
                    {skillGapAnalysis.gapLevel} gap
                  </span>
                </div>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Careers */}
          <div className="lg:col-span-2 space-y-6">
            {skillGapAnalysis && (
              <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                      <Gauge className="text-rose-500" /> Deterministic Skill Gap
                    </h3>
                    <p className="text-sm text-slate-600 mt-2 max-w-2xl">
                      Assessment scores, career requirements, recommended roles, and market trend domains.
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900 px-5 py-4 text-center text-white">
                    <div className="text-3xl font-extrabold">{skillGapAnalysis.overallGapPercentage}%</div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-300">Gap Present</div>
                  </div>
                </div>

                {skillGapAnalysis.missingSkills.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-3 mb-6">
                    {skillGapAnalysis.missingSkills.slice(0, 6).map((gap) => (
                      <div key={gap.skill} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="font-bold text-slate-900">{gap.skill}</div>
                            <div className="text-xs text-slate-500">{gap.sourceRoles.slice(0, 2).join(", ")}</div>
                          </div>
                          <span className={cn(
                            "rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                            gap.priority === "critical" ? "bg-rose-100 text-rose-700" :
                            gap.priority === "high" ? "bg-amber-100 text-amber-700" :
                            "bg-blue-100 text-blue-700"
                          )}>
                            {gap.priority}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                          <span>{gap.userScore}%</span>
                          <span className="font-bold text-slate-900">Need {gap.requiredScore}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full bg-rose-500" style={{ width: `${gap.gap}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {skillGapAnalysis.marketDrivenSkills.length > 0 && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-indigo-950">
                      <Layers3 className="h-4 w-4" /> Market trend skills to add
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {skillGapAnalysis.marketDrivenSkills.slice(0, 8).map((item) => (
                        <span key={`${item.domain}-${item.skill}`} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-800 border border-indigo-100">
                          {item.skill} | demand {item.marketDemand}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-2">
              <Briefcase className="text-blue-600" /> Top Career Matches
            </h3>
            
            {recommendationList.length > 0 ? recommendationList.map((rec: CareerRecommendation) => {
              const skillGap = rec.skill_gap || [];
              const hybridScore = rec.finalScore ?? rec.final_hybrid_score ?? rec.compatibility_score ?? 0;
              const marketDemand = rec.marketDemand ?? rec.market_demand;
              const interestAlignment = rec.interestAlignment ?? rec.interest_alignment ?? 0;
              const semanticScore = rec.semanticScore ?? rec.semantic_match ?? 0;
              const compatibility = rec.compatibility ?? rec.compatibility_score ?? 0;

              return (
              <div key={rec.role} className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 hover:border-blue-300 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-sm shrink-0">
                        #{rec.rank}
                      </span>
                      <h4 className="text-2xl font-bold text-slate-900">{rec.role}</h4>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-4 mt-3">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase",
                        (rec.readiness_label || "").includes("Ready") && !(rec.readiness_label || "").includes("preparation") ? "bg-emerald-100 text-emerald-800" :
                        (rec.readiness_label || "").includes("Almost") ? "bg-blue-100 text-blue-800" :
                        "bg-amber-100 text-amber-800"
                      )}>
                        {rec.readiness_label || "Recommended"}
                      </span>
                      {marketDemand !== undefined && (
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> Demand: {marketDemand}/100
                        </span>
                      )}
                      {rec.salary_min !== undefined && rec.salary_max !== undefined && rec.salary_min > 0 && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> 
                          £{(rec.salary_min / 1000).toFixed(0)}k - £{(rec.salary_max / 1000).toFixed(0)}k
                        </span>
                      )}
                      {rec.trending_skills && rec.trending_skills.length > 0 && (
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                          Hot: {rec.trending_skills.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-slate-600 text-sm leading-relaxed mb-4">
                      {rec.description}
                    </p>

                    {rec.explanation && (
                      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                        <p className="text-sm text-indigo-900 font-medium flex items-start gap-2">
                          <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                          <span>{rec.explanation}</span>
                        </p>
                      </div>
                    )}

                    {skillGap.length > 0 ? (
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <h5 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500" /> Focus Areas to Improve
                        </h5>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {skillGap.map((gap: SkillGap) => (
                            <div key={gap.skill} className="flex justify-between items-center text-sm">
                              <span className="font-medium text-slate-700">{gap.skill}</span>
                              <span className="text-slate-500">
                                {gap.user_score} → <span className="font-bold text-slate-900">{gap.required_score}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 text-emerald-800 rounded-xl p-4 border border-emerald-100 text-sm font-medium flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> You meet all skill requirements for this role!
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100 w-full sm:w-48">
                    <div className="text-4xl font-extrabold text-blue-600 mb-1">
                      {hybridScore}%
                    </div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center mb-4">
                      Hybrid Match
                    </div>
                    
                    {hybridScore !== undefined && (
                      <div className="w-full space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500">
                          <span>Skills</span>
                          <span>{compatibility}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{width: `${compatibility}%`}} />
                        </div>
                        
                        <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500">
                          <span>Interest</span>
                          <span>{interestAlignment}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full" style={{width: `${interestAlignment}%`}} />
                        </div>

                        <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500">
                          <span>AI Match</span>
                          <span>{semanticScore}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-400 rounded-full" style={{width: `${semanticScore}%`}} />
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );}) : (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200 shadow-sm">
                No career recommendations found for this profile.
              </div>
            )}

            <div className="pt-8 flex justify-center">
              <button 
                onClick={handleRetake}
                className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-md flex items-center gap-2"
              >
                <RefreshCw className="w-5 h-5" /> Retake Assessment
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
