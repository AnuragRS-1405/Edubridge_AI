import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from src.routers import questions, scoring, careers, skill_gap

load_dotenv()

app = FastAPI(title="EduBridge AI - AI Service")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    fallback_model = os.getenv("OLLAMA_FALLBACK_MODEL", "llama3:latest")
    print(f"[startup] Ollama configured at {ollama_url} with model={model}, fallback={fallback_model}")

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "ollamaUrl": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        "models": [
            os.getenv("OLLAMA_MODEL", "qwen2.5:3b"),
            os.getenv("OLLAMA_FALLBACK_MODEL", "llama3:latest"),
        ],
    }

app.include_router(questions.router, prefix="/api", tags=["questions"])
app.include_router(scoring.router, prefix="/api", tags=["scoring"])
app.include_router(careers.router, prefix="/api", tags=["careers"])
app.include_router(skill_gap.router, prefix="/api", tags=["skill-gap"])
