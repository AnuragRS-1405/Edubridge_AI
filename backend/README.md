# EduBridge AI - Backend

Node.js and Express backend service in TypeScript.

## Getting Started

1. Copy `.env.example` to `.env` and fill in `MONGODB_URI` and other variables.
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`

## Skill Gap Agent

- `POST /api/skill-gap/analyze` computes deterministic skill gaps from skill scores, recommended roles, predefined career requirements, and market trend domain data.
- `GET /api/skill-gap/latest/:userId` recomputes the latest skill gap analysis from the user's most recent assessment profile and recommendation history.
- Assessment submission also returns `skillGapAnalysis` directly in `POST /api/assessment/submit`.
