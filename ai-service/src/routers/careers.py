import json
import os
import re
from typing import Dict, List, Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class CareerDatasetItem(BaseModel):
    role: str
    requiredSkills: Dict[str, float] = {}
    demandScore: float = 50
    description: str = ""


class RecommendCareersRequest(BaseModel):
    skill_scores: Dict[str, float]
    level_per_skill: Dict[str, str]
    overall_level: str
    career_dataset: List[CareerDatasetItem] = []
    interests: List[str] = []


def clamp_score(value: float) -> float:
    try:
        return max(0.0, min(100.0, round(float(value), 2)))
    except (TypeError, ValueError):
        return 0.0


def normalize_term(value: str) -> str:
    normalized = value.lower().replace("&", " and ").replace("/", " ")
    normalized = re.sub(r"[^a-z0-9+#.]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def token_set(value: str) -> set:
    return {token for token in normalize_term(value).split() if len(token) > 1}


def calculate_readiness(score: float) -> str:
    if score >= 80:
        return "Ready to apply"
    if score >= 60:
        return "Almost ready"
    if score >= 40:
        return "Some preparation needed"
    return "Significant preparation needed"


def best_user_score_for_required_skill(required_skill: str, skill_scores: Dict[str, float]) -> float:
    required_tokens = token_set(required_skill)
    best_score = 0.0

    for user_skill, raw_score in skill_scores.items():
        user_tokens = token_set(user_skill)
        score = clamp_score(raw_score)
        if normalize_term(user_skill) == normalize_term(required_skill):
            return score
        if required_tokens and user_tokens:
            overlap = len(required_tokens & user_tokens) / len(required_tokens | user_tokens)
            if overlap > 0:
                best_score = max(best_score, score * overlap)
        if normalize_term(required_skill) in normalize_term(user_skill) or normalize_term(user_skill) in normalize_term(required_skill):
            best_score = max(best_score, score * 0.85)

    return clamp_score(best_score)


async def generate_dynamic_careers(request: RecommendCareersRequest) -> List[CareerDatasetItem]:
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    models = [
        os.getenv("OLLAMA_MODEL", "qwen2.5:3b"),
        os.getenv("OLLAMA_FALLBACK_MODEL", "llama3:latest"),
        "llama3:latest",
    ]
    prompt = f"""
You are an expert technical career architect.
Generate 6 realistic technology career roles for this learner.

Skill scores: {json.dumps(request.skill_scores)}
Skill levels: {json.dumps(request.level_per_skill)}
Overall level: {request.overall_level}
Interests: {json.dumps(request.interests)}

Return ONLY valid JSON as an array. Each item must include:
role, requiredSkills, demandScore, description.
requiredSkills must be an object of skill names to required scores from 0 to 100.
demandScore is a neutral market prior from 35 to 80; live market data will adjust it later.
"""

    for model in dict.fromkeys(models):
        try:
            async with httpx.AsyncClient(timeout=float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "45"))) as client:
                response = await client.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json",
                        "options": {"temperature": 0.5},
                    },
                )
                response.raise_for_status()
            content = str(response.json().get("response", "")).strip()
            match = re.search(r"\[[\s\S]*\]", content)
            parsed = json.loads(match.group(0) if match else content)
            careers = []
            for item in parsed:
                if not item.get("role") or not isinstance(item.get("requiredSkills"), dict):
                    continue
                careers.append(CareerDatasetItem(
                    role=str(item["role"]).strip(),
                    requiredSkills={str(k): clamp_score(v) for k, v in item["requiredSkills"].items()},
                    demandScore=clamp_score(item.get("demandScore", 50)),
                    description=str(item.get("description", "")).strip() or f"Career path aligned with {', '.join(request.skill_scores.keys())}.",
                ))
            if careers:
                print(f"[careers] generated {len(careers)} dynamic roles using {model}")
                return careers[:6]
        except Exception as exc:
            print(f"[careers] dynamic role generation failed with {model}: {exc}")
            if isinstance(exc, httpx.TimeoutException):
                return []

    return []


def calculate_compatibility(career: CareerDatasetItem, skill_scores: Dict[str, float]) -> tuple[float, List[dict]]:
    if not career.requiredSkills:
        if not skill_scores:
            return 35.0, []
        average_score = sum(clamp_score(score) for score in skill_scores.values()) / len(skill_scores)
        return clamp_score(average_score * 0.65), []

    total_required = sum(max(float(score), 1.0) for score in career.requiredSkills.values())
    compatibility_score = 0.0
    skill_gap = []

    for required_skill, req_score_raw in career.requiredSkills.items():
        req_score = max(clamp_score(req_score_raw), 1.0)
        user_score = best_user_score_for_required_skill(required_skill, skill_scores)
        skill_weight = req_score / total_required
        compatibility_score += min(user_score / req_score, 1.0) * skill_weight * 100

        if user_score + 1 < req_score:
            skill_gap.append({
                "skill": required_skill,
                "user_score": clamp_score(user_score),
                "required_score": clamp_score(req_score),
                "gap": clamp_score(req_score - user_score),
            })

    return clamp_score(compatibility_score), skill_gap[:6]


def build_skill_based_career_dataset(request: RecommendCareersRequest) -> List[CareerDatasetItem]:
    ranked_skills = sorted(
        ((skill, clamp_score(score)) for skill, score in request.skill_scores.items()),
        key=lambda item: item[1],
        reverse=True,
    )
    skill_names = [skill for skill, _score in ranked_skills] or ["Software Engineering"]
    primary = skill_names[0]
    secondary = skill_names[1] if len(skill_names) > 1 else primary
    lower_skills = " ".join(skill_names).lower()
    lower_interests = " ".join(request.interests).lower()

    candidates: List[CareerDatasetItem] = []

    def add(role: str, required: Dict[str, float], description: str, demand: float = 55) -> None:
        if any(existing.role.lower() == role.lower() for existing in candidates):
            return
        candidates.append(CareerDatasetItem(
            role=role,
            requiredSkills=required,
            demandScore=demand,
            description=description,
        ))

    if "react" in lower_skills or "javascript" in lower_skills or "typescript" in lower_skills:
        add(
            "Frontend Developer",
            {skill: 65 for skill in skill_names if normalize_term(skill) in {"react", "javascript", "typescript", "html css", "html/css"}},
            "Build interactive, accessible web interfaces using modern frontend frameworks.",
            62,
        )

    if "node" in lower_skills or "python" in lower_skills or "java" in lower_skills:
        add(
            "Backend Developer",
            {skill: 65 for skill in skill_names if any(term in normalize_term(skill) for term in ["node", "python", "java", "sql"])},
            "Design APIs, services, data flows, and server-side business logic.",
            64,
        )

    if "react" in lower_skills and ("node" in lower_skills or "sql" in lower_skills):
        add(
            "Full Stack Developer",
            {skill: 65 for skill in skill_names if any(term in normalize_term(skill) for term in ["react", "node", "javascript", "typescript", "sql"])},
            "Work across frontend UI, backend APIs, and persistence for web products.",
            66,
        )

    if "machine learning" in lower_skills or "python" in lower_skills and "statistics" in lower_skills:
        add(
            "Machine Learning Engineer",
            {skill: 70 for skill in skill_names if any(term in normalize_term(skill) for term in ["python", "machine learning", "statistics", "sql"])},
            "Build, evaluate, and deploy machine learning models and data pipelines.",
            68,
        )

    if "sql" in lower_skills or "statistics" in lower_skills or "data" in lower_interests:
        add(
            "Data Analyst",
            {skill: 60 for skill in skill_names if any(term in normalize_term(skill) for term in ["sql", "python", "statistics", "excel"])},
            "Analyze datasets, create reports, and turn metrics into business decisions.",
            63,
        )

    if "docker" in lower_skills or "linux" in lower_skills or "cloud" in lower_skills or "devops" in lower_interests:
        add(
            "DevOps Engineer",
            {skill: 65 for skill in skill_names if any(term in normalize_term(skill) for term in ["docker", "linux", "cloud"])},
            "Improve deployment automation, infrastructure reliability, and operational visibility.",
            65,
        )

    add(
        f"{primary} Engineer",
        {primary: 65, secondary: 55},
        f"Apply {primary} and adjacent skills to production software engineering problems.",
        55,
    )
    add(
        f"{primary} Application Developer",
        {skill: 55 for skill in skill_names[:4]},
        f"Build practical applications using {', '.join(skill_names[:4])}.",
        53,
    )
    add(
        f"{primary} Technical Associate",
        {skill: 50 for skill in skill_names[:3]},
        f"An entry-to-mid path focused on strengthening {primary} through real implementation work.",
        50,
    )

    return candidates[:8]


@router.post("/recommend-careers")
async def recommend_careers(request: RecommendCareersRequest):
    career_dataset = request.career_dataset or await generate_dynamic_careers(request)

    if not career_dataset:
        career_dataset = build_skill_based_career_dataset(request)

    recommendations = []
    for career in career_dataset:
        compatibility_score, skill_gap = calculate_compatibility(career, request.skill_scores)

        if request.overall_level in ["advanced", "professional"] and compatibility_score >= 70:
            compatibility_score = clamp_score(compatibility_score + 5)

        recommendations.append({
            "role": career.role,
            "compatibility_score": compatibility_score,
            "compatibility": compatibility_score,
            "readiness_label": calculate_readiness(compatibility_score),
            "skill_gap": skill_gap,
            "missingSkills": [gap["skill"] for gap in skill_gap],
            "demand_score": clamp_score(career.demandScore),
            "description": career.description,
        })

    recommendations.sort(key=lambda item: item["compatibility_score"], reverse=True)
    top_5 = recommendations[:6]

    for index, rec in enumerate(top_5):
        rec["rank"] = index + 1

    return {
        "recommendations": top_5,
        "top_recommendation": top_5[0]["role"] if top_5 else None,
        "overall_level": request.overall_level,
    }
