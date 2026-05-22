import {
  SyncUserPayload,
  SyncUserResponse,
  StartAssessmentPayload,
  StartAssessmentResponse,
  SubmitAssessmentPayload,
  SubmitAssessmentResponse,
  Career,
  SkillGapAgentAnalysis
} from '../types/assessment';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    const message =
      data?.error ||
      data?.message ||
      data?.errors?.map((err: { msg?: string }) => err.msg).filter(Boolean).join(', ');

    return new Error(message || fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function syncUser(data: SyncUserPayload): Promise<SyncUserResponse> {
  const response = await fetch(`${API_BASE}/users/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw await parseError(response, 'Failed to sync user');
  return response.json();
}

export async function startAssessment(data: StartAssessmentPayload): Promise<StartAssessmentResponse> {
  const response = await fetch(`${API_BASE}/assessment/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw await parseError(response, 'Failed to start assessment');
  return response.json();
}

export async function submitAssessment(data: SubmitAssessmentPayload): Promise<SubmitAssessmentResponse> {
  const response = await fetch(`${API_BASE}/assessment/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw await parseError(response, 'Failed to submit assessment');
  return response.json();
}

export async function getCareers(): Promise<Career[]> {
  const response = await fetch(`${API_BASE}/careers`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw await parseError(response, 'Failed to fetch careers');
  return response.json();
}

export async function getLatestSkillGap(userId: string): Promise<SkillGapAgentAnalysis> {
  const response = await fetch(`${API_BASE}/skill-gap/latest/${userId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw await parseError(response, 'Failed to fetch skill gap analysis');
  return response.json();
}
