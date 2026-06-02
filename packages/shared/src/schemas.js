"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperQuerySchema = exports.AlertConfigSchema = exports.AnalyzeProjectSchema = exports.ProposalStatusSchema = exports.ProposalSchema = exports.ProposalTemplateSchema = exports.TemplateComponentSchema = exports.UserProfileSchema = exports.LoginSchema = exports.SignupSchema = void 0;
const zod_1 = require("zod");
// ── Auth ──────────────────────────────────────────────────────────────────────
exports.SignupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1, 'Password is required'),
});
// ── User Profile ──────────────────────────────────────────────────────────────
exports.UserProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    bio: zod_1.z.string().max(1000).optional(),
    skills: zod_1.z.array(zod_1.z.string()).optional(),
    experience: zod_1.z.string().optional(),
    hourlyRate: zod_1.z.number().positive().optional(),
    platforms: zod_1.z.array(zod_1.z.string()).optional(),
    timezone: zod_1.z.string().optional(),
});
// ── Template Component ────────────────────────────────────────────────────────
exports.TemplateComponentSchema = zod_1.z.object({
    type: zod_1.z.enum(['greeting', 'opening', 'strategy', 'closing', 'regards', 'ps']),
    content: zod_1.z.string().min(1, 'Content is required'),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
});
// ── Proposal Template ─────────────────────────────────────────────────────────
exports.ProposalTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    category: zod_1.z.string().min(1),
    strategy: zod_1.z.string().min(1),
    components: zod_1.z.record(zod_1.z.string()),
});
// ── Proposal ──────────────────────────────────────────────────────────────────
exports.ProposalSchema = zod_1.z.object({
    projectTitle: zod_1.z.string().min(1),
    projectDescription: zod_1.z.string().min(10),
    clientCountry: zod_1.z.string().default('Unknown'),
    clientTimezone: zod_1.z.string().default('UTC'),
    techStack: zod_1.z.array(zod_1.z.string()).default([]),
    bidAmount: zod_1.z.number().positive(),
    currency: zod_1.z.string().default('USD'),
    content: zod_1.z.string().min(1),
    platform: zod_1.z.string().default('upwork'),
});
exports.ProposalStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['pending', 'won', 'lost', 'no_response']),
});
// ── AI Analyze ────────────────────────────────────────────────────────────────
exports.AnalyzeProjectSchema = zod_1.z.object({
    projectTitle: zod_1.z.string().min(1),
    projectDescription: zod_1.z.string().min(20),
    projectUrl: zod_1.z.string().optional(),
    clientCountry: zod_1.z.string().optional(),
    clientTimezone: zod_1.z.string().optional(),
    paymentVerified: zod_1.z.boolean().optional(),
    emailVerified: zod_1.z.boolean().optional(),
    phoneVerified: zod_1.z.boolean().optional(),
    proposalsCount: zod_1.z.number().int().nonnegative().optional(),
});
// ── Alert Config ──────────────────────────────────────────────────────────────
exports.AlertConfigSchema = zod_1.z.object({
    countries: zod_1.z.array(zod_1.z.string()).min(1),
    timezones: zod_1.z.array(zod_1.z.string()).default([]),
    activeHoursStart: zod_1.z.number().min(0).max(23).default(8),
    activeHoursEnd: zod_1.z.number().min(0).max(23).default(20),
    notificationChannels: zod_1.z.array(zod_1.z.string()).default(['browser']),
    enabled: zod_1.z.boolean().default(true),
});
// ── Scraper ───────────────────────────────────────────────────────────────────
exports.ScraperQuerySchema = zod_1.z.object({
    query: zod_1.z.string().min(1),
    platform: zod_1.z.enum(['upwork', 'freelancer', 'both']).default('both'),
    limit: zod_1.z.number().min(1).max(1000).default(50),
});
