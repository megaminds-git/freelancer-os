import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

// ── User Profile ──────────────────────────────────────────────────────────────
export const UserProfileSchema = z.object({
  name: z.string().min(2).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string()).optional(),
  experience: z.string().optional(),
  hourlyRate: z.number().positive().optional(),
  platforms: z.array(z.string()).optional(),
  timezone: z.string().optional(),
});

// ── Template Component ────────────────────────────────────────────────────────
export const TemplateComponentSchema = z.object({
  type: z.enum(['greeting', 'opening', 'strategy', 'closing', 'regards', 'ps']),
  content: z.string().min(1, 'Content is required'),
  tags: z.array(z.string()).default([]),
});

// ── Proposal Template ─────────────────────────────────────────────────────────
export const ProposalTemplateSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  strategy: z.string().min(1),
  components: z.record(z.string()),
});

// ── Proposal ──────────────────────────────────────────────────────────────────
export const ProposalSchema = z.object({
  projectTitle: z.string().min(1),
  projectDescription: z.string().min(10),
  clientCountry: z.string().default('Unknown'),
  clientTimezone: z.string().default('UTC'),
  techStack: z.array(z.string()).default([]),
  bidAmount: z.number().positive(),
  currency: z.string().default('USD'),
  content: z.string().min(1),
  platform: z.string().default('upwork'),
});

export const ProposalStatusSchema = z.object({
  status: z.enum(['pending', 'won', 'lost', 'no_response']),
});

// ── AI Analyze ────────────────────────────────────────────────────────────────
export const AnalyzeProjectSchema = z.object({
  projectTitle: z.string().min(1),
  projectDescription: z.string().min(20),
  projectUrl: z.string().optional(),
  clientCountry: z.string().optional(),
  clientTimezone: z.string().optional(),
  paymentVerified: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  proposalsCount: z.number().int().nonnegative().optional(),
});

// ── Alert Config ──────────────────────────────────────────────────────────────
export const AlertConfigSchema = z.object({
  countries: z.array(z.string()).min(1),
  timezones: z.array(z.string()).default([]),
  activeHoursStart: z.number().min(0).max(23).default(8),
  activeHoursEnd: z.number().min(0).max(23).default(20),
  notificationChannels: z.array(z.string()).default(['browser']),
  enabled: z.boolean().default(true),
});

// ── Scraper ───────────────────────────────────────────────────────────────────
export const ScraperQuerySchema = z.object({
  query: z.string().min(1),
  platform: z.enum(['upwork', 'freelancer', 'both']).default('both'),
  limit: z.number().min(1).max(1000).default(50),
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UserProfileInput = z.infer<typeof UserProfileSchema>;
export type TemplateComponentInput = z.infer<typeof TemplateComponentSchema>;
export type ProposalTemplateInput = z.infer<typeof ProposalTemplateSchema>;
export type ProposalInput = z.infer<typeof ProposalSchema>;
export type AnalyzeProjectInput = z.infer<typeof AnalyzeProjectSchema>;
export type AlertConfigInput = z.infer<typeof AlertConfigSchema>;
export type ScraperQueryInput = z.infer<typeof ScraperQuerySchema>;
