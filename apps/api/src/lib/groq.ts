import Groq from 'groq-sdk';
import crypto from 'crypto';
import { getCache, setCache } from './redis';

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Model config
export const GROQ_MODELS = {
  fast: 'llama-3.1-8b-instant',
  smart: 'llama-3.3-70b-versatile',
} as const;

// Hash project description for cache key
function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function trimToWordLimit(text: string, wordLimit?: number): string {
  if (!wordLimit || wordLimit <= 0) return text.trim();

  const words = text.trim().split(/\s+/).filter(Boolean);
  // Allow 10% overage before trimming
  if (words.length <= Math.floor(wordLimit * 1.1)) return text.trim();

  const truncated = words.slice(0, wordLimit).join(' ');
  // Trim to last sentence boundary rather than cutting mid-word
  const lastEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
  );
  if (lastEnd > truncated.length * 0.6) {
    return truncated.substring(0, lastEnd + 1).trim();
  }
  return truncated.trim();
}

// ── Project Analysis ──────────────────────────────────────────────────────────
export interface AnalysisResult {
  recommendedStructure: string[];
  biddingStrategy: 'fixed' | 'hourly' | 'milestone';
  effortLevel: 'low' | 'medium' | 'high';
  hoursEstimate: number;
  techFitScore: number;
  matchedSkills: string[];
  bidRange: { min: number; max: number; currency: string };
  redFlags: string[];
  winningAngle: string;
}

export async function analyzeProject(
  projectTitle: string,
  projectDescription: string,
  userSkills: string[],
  hourlyRate: number,
  clientCountry = 'Unknown',
  extraContext?: {
    projectUrl?: string;
    paymentVerified?: boolean;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    proposalsCount?: number;
  },
): Promise<AnalysisResult> {
  const cacheKey = `ai:analysis:${hashText(projectTitle + projectDescription)}`;
  const cached = await getCache<AnalysisResult>(cacheKey);
  if (cached) return cached;

  const systemPrompt = `You are an expert freelance consultant and proposal strategist with 10+ years of experience on Upwork, Toptal, and Freelancer.com. Analyze the given project and return a structured JSON assessment that helps the freelancer craft a winning proposal. Always respond with valid JSON only, no markdown.`;

  const userPrompt = `Analyze this freelance project and return JSON:

Project Title: ${projectTitle}
Project Description: ${projectDescription}
Client Country: ${clientCountry}
${extraContext?.paymentVerified != null ? `Client Payment Verified: ${extraContext.paymentVerified ? 'Yes' : 'No'}` : ''}
${extraContext?.emailVerified != null ? `Client Email Verified: ${extraContext.emailVerified ? 'Yes' : 'No'}` : ''}
${extraContext?.phoneVerified != null ? `Client Phone Verified: ${extraContext.phoneVerified ? 'Yes' : 'No'}` : ''}
${extraContext?.proposalsCount != null ? `Total Proposals/Bids Submitted: ${extraContext.proposalsCount} (higher competition)` : ''}
Freelancer Skills: ${userSkills.join(', ')}
Freelancer Hourly Rate: $${hourlyRate}/hr

Return this exact JSON structure:
{
  "recommendedStructure": ["section1", "section2", ...],
  "biddingStrategy": "fixed" | "hourly" | "milestone",
  "effortLevel": "low" | "medium" | "high",
  "hoursEstimate": number,
  "techFitScore": 0-100,
  "matchedSkills": ["skill1", ...],
  "bidRange": { "min": number, "max": number, "currency": "USD" },
  "redFlags": ["flag1", ...],
  "winningAngle": "single best USP string"
}`;

  const completion = await groq.chat.completions.create({
    model: GROQ_MODELS.smart,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 1024,
  });

  const text = completion.choices[0]?.message?.content || '{}';
  let result: AnalysisResult;

  try {
    result = JSON.parse(text) as AnalysisResult;
  } catch {
    result = {
      recommendedStructure: ['Hook', 'Solution', 'Experience', 'Timeline', 'CTA'],
      biddingStrategy: 'fixed',
      effortLevel: 'medium',
      hoursEstimate: 40,
      techFitScore: 70,
      matchedSkills: userSkills.slice(0, 3),
      bidRange: { min: hourlyRate * 20, max: hourlyRate * 60, currency: 'USD' },
      redFlags: [],
      winningAngle: 'Deliver high-quality results on time.',
    };
  }

  await setCache(cacheKey, result, 3600);
  return result;
}

// ── Proposal Generation ───────────────────────────────────────────────────────
export async function generateProposal(
  projectTitle: string,
  projectDescription: string,
  analysis: AnalysisResult,
  userName: string,
  userBio: string,
  strategy?: string,
  instruction?: {
    id?: string;
    title: string;
    content: string;
    wordLimit?: number;
    endingText?: string;
    appendEnding?: boolean;
  },
  generationMode: 'auto' | 'instruction' | 'ai' = 'auto',
  projectContext?: {
    budget?: string;
    clientCountry?: string;
    projectUrl?: string;
    proposalsCount?: number;
    paymentVerified?: boolean;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  },
): Promise<string> {
  const systemPrompt = `You are an expert freelance proposal writer.
Write compelling, personalized proposals that win jobs.
The output must be clean, readable, well-structured, and client-focused.
Always use strong paragraph structure.
Default structure unless instruction overrides it: intro -> solution -> value -> CTA -> ending.
CRITICAL FORMATTING RULES: No markdown. No asterisks. No bold or italic. No bullet points. No numbered lists. No section headers. No pound signs. Write in clean flowing paragraphs only. Plain text only.`;

  const modeGuidance = generationMode === 'instruction'
    ? 'STRICTLY follow the provided instruction for tone, structure, word limit, and ending.'
    : generationMode === 'ai'
      ? 'Ignore saved instructions and generate the strongest professional proposal using your own judgment.'
      : instruction
        ? 'Use the provided auto-selected instruction as the primary rule set and follow it closely.'
        : 'No saved instruction is available. Use smart default AI proposal logic.';

  const structureGuidance = instruction
    ? 'Respect the instruction tone and structure. If the instruction is incomplete, still ensure a strong opening, solution section, value section, CTA, and ending.'
    : 'Use a polished format with a strong opening, clear solution, concise value proof, and direct CTA.';

  const userPrompt = `Write a freelance proposal for this project:

Project: ${projectTitle}
Description: ${projectDescription}
${strategy ? `Strategy: ${strategy}` : `Auto-select the best proposal style based on the project context, budget type (${analysis.biddingStrategy}), and winning angle.`}
Generation Mode: ${generationMode}
Mode Guidance: ${modeGuidance}
${instruction ? `Instruction Title: ${instruction.title}` : ''}
${instruction ? `Instruction Content: ${instruction.content}` : ''}
${instruction?.wordLimit ? `Target Word Limit: ${instruction.wordLimit} words` : ''}
${instruction?.appendEnding ? `Ending Text To Append: ${instruction.endingText || 'Best regards, {Your Name}'}` : ''}
Winning Angle: ${analysis.winningAngle}
Recommended Structure: ${analysis.recommendedStructure.join(' → ')}
Bidding Strategy: ${analysis.biddingStrategy}
${projectContext?.budget ? `Project Budget: ${projectContext.budget}` : ''}
${projectContext?.clientCountry ? `Client Country: ${projectContext.clientCountry}` : ''}
${projectContext?.projectUrl ? `Project URL: ${projectContext.projectUrl}` : ''}
${projectContext?.proposalsCount != null ? `Current Bid Count: ${projectContext.proposalsCount}` : ''}
${projectContext?.paymentVerified != null ? `Payment Verified: ${projectContext.paymentVerified ? 'Yes' : 'No'}` : ''}
${projectContext?.emailVerified != null ? `Email Verified: ${projectContext.emailVerified ? 'Yes' : 'No'}` : ''}
${projectContext?.phoneVerified != null ? `Phone Verified: ${projectContext.phoneVerified ? 'Yes' : 'No'}` : ''}

Freelancer Info:
Name: ${userName}
Bio: ${userBio}

Write a complete, professional proposal following the recommended structure.
Be specific to the project.
${structureGuidance}
${instruction?.wordLimit ? `Keep it around ${instruction.wordLimit} words (do not exceed by more than 10%).` : 'Keep it under 350 words.'}
${instruction?.appendEnding ? 'Ensure the final line uses the requested ending text exactly.' : 'End with a polished professional sign-off.'}
Return only the final proposal text.`;

  const completion = await groq.chat.completions.create({
    model: GROQ_MODELS.smart,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  });

  let proposal = completion.choices[0]?.message?.content || '';

  // Strip markdown artifacts: bold/italic, headers, bullet/numbered list markers
  proposal = proposal
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\*\-]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (instruction?.appendEnding && instruction.endingText?.trim()) {
    const endingText = instruction.endingText.trim();
    if (!proposal.includes(endingText)) {
      proposal = `${proposal.trim()}\n\n${endingText}`;
    }
  }

  proposal = trimToWordLimit(proposal, instruction?.wordLimit);

  return proposal;
}

// ── Profile Review ────────────────────────────────────────────────────────────
export interface ProfileReviewResult {
  overallScore: number;
  dimensionScores: {
    headline: number;
    bio: number;
    skills: number;
    portfolio: number;
    completeness: number;
  };
  improvements: {
    action: string;
    expectedImpact: 'high' | 'medium' | 'low';
    estimatedDays: number;
  }[];
}

export async function reviewProfile(
  profileDescription: string,
  platform: string,
): Promise<ProfileReviewResult> {
  const systemPrompt = `You are a freelance profile optimization expert. Evaluate freelancer profiles and provide actionable improvement recommendations. Always respond with valid JSON only.`;

  const userPrompt = `Review this freelancer profile on ${platform} and return JSON:

Profile Description:
${profileDescription}

Return this exact JSON structure:
{
  "overallScore": 0-100,
  "dimensionScores": {
    "headline": 0-20,
    "bio": 0-20,
    "skills": 0-20,
    "portfolio": 0-20,
    "completeness": 0-20
  },
  "improvements": [
    {
      "action": "specific action to take",
      "expectedImpact": "high" | "medium" | "low",
      "estimatedDays": number
    }
  ]
}
Provide exactly 3 improvements ordered by impact.`;

  const completion = await groq.chat.completions.create({
    model: GROQ_MODELS.smart,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 1024,
  });

  const text = completion.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(text) as ProfileReviewResult;
  } catch {
    return {
      overallScore: 60,
      dimensionScores: { headline: 12, bio: 12, skills: 12, portfolio: 12, completeness: 12 },
      improvements: [
        { action: 'Improve your headline to highlight your main skill', expectedImpact: 'high', estimatedDays: 1 },
        { action: 'Add more portfolio samples', expectedImpact: 'high', estimatedDays: 7 },
        { action: 'Expand your bio with specific achievements', expectedImpact: 'medium', estimatedDays: 2 },
      ],
    };
  }
}
