import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


CAREER_REQUIREMENTS = [
    {
        "domain": "data",
        "role": "Data Analyst",
        "requiredSkills": {"python": 60, "sql": 70, "statistics": 55, "excel": 55, "data visualization": 60},
    },
    {
        "domain": "ai_ml",
        "role": "Machine Learning Engineer",
        "requiredSkills": {"python": 80, "machine learning": 75, "statistics": 70, "sql": 60, "ml frameworks": 70},
    },
    {
        "domain": "web_development",
        "role": "Frontend Developer",
        "requiredSkills": {"javascript": 75, "typescript": 65, "react": 75, "html css": 70, "accessibility": 55},
    },
    {
        "domain": "web_development",
        "role": "Full Stack Developer",
        "requiredSkills": {"javascript": 70, "typescript": 65, "react": 70, "node.js": 70, "sql": 60, "api design": 60},
    },
    {
        "domain": "backend",
        "role": "Backend Developer",
        "requiredSkills": {"node.js": 70, "python": 65, "api design": 70, "sql": 65, "databases": 65},
    },
    {
        "domain": "cloud_devops",
        "role": "DevOps Engineer",
        "requiredSkills": {"linux": 70, "docker": 70, "cloud": 75, "ci cd": 65, "monitoring": 55},
    },
]

MARKET_DOMAINS = [
    {"domain": "web_development", "roles": ["Frontend Developer", "Full Stack Developer", "Web Developer"], "trendingSkills": ["React", "TypeScript", "Next.js", "API Design", "Accessibility"], "marketDemand": 82},
    {"domain": "backend", "roles": ["Backend Developer", "Full Stack Developer"], "trendingSkills": ["Node.js", "API Design", "PostgreSQL", "System Design", "Cloud"], "marketDemand": 80},
    {"domain": "data", "roles": ["Data Analyst", "Data Engineer", "Business Analyst"], "trendingSkills": ["SQL", "Python", "Data Visualization", "ETL", "Cloud"], "marketDemand": 84},
    {"domain": "ai_ml", "roles": ["Machine Learning Engineer", "AI Engineer"], "trendingSkills": ["Python", "Machine Learning", "MLOps", "Vector Databases", "LLM Integration"], "marketDemand": 88},
    {"domain": "cloud_devops", "roles": ["DevOps Engineer", "Cloud Engineer"], "trendingSkills": ["Docker", "Kubernetes", "Cloud", "CI CD", "Monitoring"], "marketDemand": 86},
]


class SkillGapRequest(BaseModel):
    skill_scores: Dict[str, float]
    level_per_skill: Dict[str, str] = {}
    overall_level: Optional[str] = None
    recommendations: List[Dict[str, Any]] = []
    assessment_domain: Optional[str] = None


def clamp_score(value: Any, fallback: float = 0) -> int:
    try:
        return max(0, min(100, round(float(value))))
    except (TypeError, ValueError):
        return int(fallback)


def normalize(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[/.+#_-]", " ", value)
    value = re.sub(r"[^a-z0-9\s]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def similarity(left: str, right: str) -> float:
    if normalize(left) == normalize(right):
        return 1.0
    left_tokens = {token for token in normalize(left).split() if len(token) > 1}
    right_tokens = {token for token in normalize(right).split() if len(token) > 1}
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = len(left_tokens & right_tokens)
    union = len(left_tokens | right_tokens)
    contains = 0.85 if normalize(left) in normalize(right) or normalize(right) in normalize(left) else 0
    return max(overlap / union, contains)


def best_user_score(required_skill: str, skill_scores: Dict[str, float]) -> int:
    best = 0
    for skill, score in skill_scores.items():
        match = similarity(required_skill, skill)
        if match >= 0.45:
            best = max(best, clamp_score(score) * match)
    return clamp_score(best)


def infer_domain(request: SkillGapRequest) -> str:
    if request.assessment_domain:
        return normalize(request.assessment_domain).replace(" ", "_")
    text = " ".join(list(request.skill_scores.keys()) + [str(rec.get("role", "")) for rec in request.recommendations[:3]])
    best = ("general", 0.0)
    for domain in MARKET_DOMAINS:
        domain_text = f"{domain['domain']} {' '.join(domain['roles'])} {' '.join(domain['trendingSkills'])}"
        score = similarity(text, domain_text)
        if score > best[1]:
            best = (str(domain["domain"]), score)
    return best[0]


@router.post("/skill-gap-agent")
async def skill_gap_agent(request: SkillGapRequest):
    assessment_domain = infer_domain(request)
    selected_roles = {normalize(str(rec.get("role", ""))) for rec in request.recommendations[:5]}
    requirements = [item for item in CAREER_REQUIREMENTS if normalize(item["role"]) in selected_roles]
    if not requirements:
        requirements = [item for item in CAREER_REQUIREMENTS if item["domain"] == assessment_domain][:3]
    if not requirements:
        requirements = CAREER_REQUIREMENTS[:3]

    market_domains = [
        domain for domain in MARKET_DOMAINS
        if domain["domain"] == assessment_domain
        or any(similarity(str(rec.get("role", "")), " ".join(domain["roles"])) >= 0.35 for rec in request.recommendations[:5])
    ][:3]

    gaps: Dict[str, Dict[str, Any]] = {}
    for career in requirements:
        for skill, required in career["requiredSkills"].items():
            user_score = best_user_score(skill, request.skill_scores)
            gap = max(0, clamp_score(required) - user_score)
            if gap <= 0:
                continue
            key = normalize(skill)
            market_relevance = max(
                [clamp_score(domain["marketDemand"], 50) for domain in market_domains if any(similarity(skill, trend) >= 0.45 for trend in domain["trendingSkills"])]
                or [40]
            )
            if key not in gaps or gap > gaps[key]["gap"]:
                gaps[key] = {
                    "skill": skill,
                    "userScore": user_score,
                    "requiredScore": clamp_score(required),
                    "gap": gap,
                    "sourceRoles": [career["role"]],
                    "marketRelevance": market_relevance,
                    "priority": "critical" if gap >= 45 or (gap >= 30 and market_relevance >= 80) else "high" if gap >= 30 else "medium" if gap >= 15 else "low",
                }
            elif career["role"] not in gaps[key]["sourceRoles"]:
                gaps[key]["sourceRoles"].append(career["role"])

    missing_skills = sorted(gaps.values(), key=lambda item: item["gap"] + item["marketRelevance"] * 0.25, reverse=True)
    overall_gap = clamp_score(sum(item["gap"] for item in missing_skills) / len(missing_skills)) if missing_skills else 0

    return {
        "agentName": "Skill Gap Agent",
        "assessmentDomain": assessment_domain,
        "overallGapPercentage": overall_gap,
        "readinessScore": clamp_score(100 - overall_gap),
        "gapLevel": "critical" if overall_gap >= 45 else "high" if overall_gap >= 30 else "moderate" if overall_gap >= 15 else "low",
        "missingSkills": missing_skills[:10],
        "requiredCareerSkillsCompared": requirements,
        "marketDomainsCompared": market_domains,
        "marketDrivenSkills": [
            {"skill": skill, "domain": domain["domain"], "marketDemand": domain["marketDemand"], "userScore": best_user_score(skill, request.skill_scores)}
            for domain in market_domains
            for skill in domain["trendingSkills"]
            if best_user_score(skill, request.skill_scores) < 70
        ][:8],
        "summary": f"Skill Gap Agent found a {overall_gap}% average gap against selected career requirements and market trends.",
    }
