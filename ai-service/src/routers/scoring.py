from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any

router = APIRouter()

class AnswerData(BaseModel):
    question: str
    skill: str
    difficulty: str
    correct_answer: str
    user_answer: str

class ScoreAssessmentRequest(BaseModel):
    answers: List[AnswerData]

def get_level_description(level: str) -> str:
    descriptions = {
        "beginner": "You're building your foundation. Focus on core concepts and syntax.",
        "intermediate": "You can apply concepts practically. Work on real-world projects to level up.",
        "advanced": "You have strong practical skills. Dive into system design and optimisation.",
        "professional": "Expert-level performance. You're ready for senior roles."
    }
    return descriptions.get(level, descriptions["beginner"])

def determine_tier(beginner_score: float, intermediate_score: float, expert_score: float) -> str:
    if beginner_score < 50:
        return "beginner"
    if beginner_score >= 50 and intermediate_score < 50:
        return "intermediate"
    if intermediate_score >= 50 and expert_score < 50:
        return "advanced"
    if expert_score >= 50:
        return "professional"
    return "beginner"

def clamp_score(value: float) -> int:
    try:
        return max(0, min(100, round(float(value))))
    except (TypeError, ValueError):
        return 0

@router.post("/score-assessment")
async def score_assessment(request: ScoreAssessmentRequest):
    skill_stats = {}
    
    global_stats = {
        "beginner": {"correct": 0, "total": 0},
        "intermediate": {"correct": 0, "total": 0},
        "expert": {"correct": 0, "total": 0}
    }
    
    for ans in request.answers:
        skill = ans.skill.strip() or "General"
        diff = ans.difficulty.lower()
        is_correct = ans.user_answer.strip().upper() == ans.correct_answer.strip().upper()
        
        if skill not in skill_stats:
            skill_stats[skill] = {
                "beginner": {"correct": 0, "total": 0},
                "intermediate": {"correct": 0, "total": 0},
                "expert": {"correct": 0, "total": 0}
            }
            
        if diff in skill_stats[skill]:
            skill_stats[skill][diff]["total"] += 1
            if is_correct:
                skill_stats[skill][diff]["correct"] += 1
                
        if diff in global_stats:
            global_stats[diff]["total"] += 1
            if is_correct:
                global_stats[diff]["correct"] += 1
                
    level_per_skill = {}
    skill_scores = {}
    per_skill_breakdown = []
    
    for skill, stats in skill_stats.items():
        b_total = stats["beginner"]["total"]
        i_total = stats["intermediate"]["total"]
        e_total = stats["expert"]["total"]
        
        b_score = (stats["beginner"]["correct"] / b_total * 100) if b_total > 0 else 0
        i_score = (stats["intermediate"]["correct"] / i_total * 100) if i_total > 0 else 0
        e_score = (stats["expert"]["correct"] / e_total * 100) if e_total > 0 else 0
        
        level = determine_tier(b_score, i_score, e_score)
        level_per_skill[skill] = level
        
        total_earned = (stats["beginner"]["correct"] * 1) + (stats["intermediate"]["correct"] * 2) + (stats["expert"]["correct"] * 3)
        total_possible = (b_total * 1) + (i_total * 2) + (e_total * 3)
        
        weighted_score = (total_earned / total_possible * 100) if total_possible > 0 else 0
        weighted_score = clamp_score(weighted_score)
        
        skill_scores[skill] = weighted_score
        per_skill_breakdown.append({
            "skill": skill,
            "level": level,
            "beginner_score": clamp_score(b_score),
            "intermediate_score": clamp_score(i_score),
            "expert_score": clamp_score(e_score),
            "weighted_score": weighted_score
        })
        
    g_b_total = global_stats["beginner"]["total"]
    g_i_total = global_stats["intermediate"]["total"]
    g_e_total = global_stats["expert"]["total"]
    
    gb_score = (global_stats["beginner"]["correct"] / g_b_total * 100) if g_b_total > 0 else 0
    gi_score = (global_stats["intermediate"]["correct"] / g_i_total * 100) if g_i_total > 0 else 0
    ge_score = (global_stats["expert"]["correct"] / g_e_total * 100) if g_e_total > 0 else 0
    
    overall_level = determine_tier(gb_score, gi_score, ge_score)
    
    total_g_earned = (global_stats["beginner"]["correct"] * 1) + (global_stats["intermediate"]["correct"] * 2) + (global_stats["expert"]["correct"] * 3)
    total_g_possible = (g_b_total * 1) + (g_i_total * 2) + (g_e_total * 3)
    
    overall_score = clamp_score((total_g_earned / total_g_possible * 100) if total_g_possible > 0 else 0)
    
    tier_breakdown = {
        diff: {
            "correct": data["correct"],
            "total": data["total"],
            "score": clamp_score((data["correct"] / data["total"] * 100) if data["total"] > 0 else 0)
        }
        for diff, data in global_stats.items()
    }
    
    return {
        "skill_scores": skill_scores,
        "level_per_skill": level_per_skill,
        "overall_level": overall_level,
        "overall_score": overall_score,
        "level_description": get_level_description(overall_level),
        "tier_breakdown": tier_breakdown,
        "per_skill_breakdown": per_skill_breakdown
    }
