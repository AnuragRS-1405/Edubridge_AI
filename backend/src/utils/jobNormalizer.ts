export interface NormalizedJob {
  role: string;
  company: string;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string;
  skills: string[];
  remote: boolean;
  source: string;
}

export function normalizeAdzunaJob(job: any): NormalizedJob {
  const title = job.title || 'Unknown Role';
  const description = job.description || '';
  
  // Basic heuristic for remote detection from Adzuna data
  const isRemote = 
    title.toLowerCase().includes('remote') || 
    description.toLowerCase().includes('remote') ||
    (job.location && job.location.display_name && job.location.display_name.toLowerCase().includes('remote'));

  return {
    role: title,
    company: job.company?.display_name || 'Unknown Company',
    salaryMin: job.salary_min || null,
    salaryMax: job.salary_max || null,
    location: job.location?.display_name || 'Unknown Location',
    skills: extractSkillsFromText(description), // Basic extraction
    remote: isRemote,
    source: 'Adzuna'
  };
}

// Very basic skill extraction for normalizer. 
// In a real app, this would use a defined taxonomy or NLP.
function extractSkillsFromText(text: string): string[] {
  const commonSkills = ['react', 'node.js', 'python', 'java', 'sql', 'aws', 'docker', 'mongodb', 'express', 'typescript', 'javascript', 'api', 'machine learning', 'ai', 'data science'];
  const lowerText = text.toLowerCase();
  
  return commonSkills.filter(skill => lowerText.includes(skill));
}
