import { z } from 'zod';
export declare const SignupSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
}, {
    email: string;
    password: string;
    name: string;
}>;
export declare const LoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const UserProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    experience: z.ZodOptional<z.ZodString>;
    hourlyRate: z.ZodOptional<z.ZodNumber>;
    platforms: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timezone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    bio?: string | undefined;
    skills?: string[] | undefined;
    experience?: string | undefined;
    hourlyRate?: number | undefined;
    platforms?: string[] | undefined;
    timezone?: string | undefined;
}, {
    name?: string | undefined;
    bio?: string | undefined;
    skills?: string[] | undefined;
    experience?: string | undefined;
    hourlyRate?: number | undefined;
    platforms?: string[] | undefined;
    timezone?: string | undefined;
}>;
export declare const TemplateComponentSchema: z.ZodObject<{
    type: z.ZodEnum<["greeting", "opening", "strategy", "closing", "regards", "ps"]>;
    content: z.ZodString;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "greeting" | "opening" | "strategy" | "closing" | "regards" | "ps";
    content: string;
    tags: string[];
}, {
    type: "greeting" | "opening" | "strategy" | "closing" | "regards" | "ps";
    content: string;
    tags?: string[] | undefined;
}>;
export declare const ProposalTemplateSchema: z.ZodObject<{
    name: z.ZodString;
    category: z.ZodString;
    strategy: z.ZodString;
    components: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    strategy: string;
    name: string;
    category: string;
    components: Record<string, string>;
}, {
    strategy: string;
    name: string;
    category: string;
    components: Record<string, string>;
}>;
export declare const ProposalSchema: z.ZodObject<{
    projectTitle: z.ZodString;
    projectDescription: z.ZodString;
    clientCountry: z.ZodDefault<z.ZodString>;
    clientTimezone: z.ZodDefault<z.ZodString>;
    techStack: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    bidAmount: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    content: z.ZodString;
    platform: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    content: string;
    projectTitle: string;
    projectDescription: string;
    clientCountry: string;
    clientTimezone: string;
    techStack: string[];
    bidAmount: number;
    currency: string;
    platform: string;
}, {
    content: string;
    projectTitle: string;
    projectDescription: string;
    bidAmount: number;
    clientCountry?: string | undefined;
    clientTimezone?: string | undefined;
    techStack?: string[] | undefined;
    currency?: string | undefined;
    platform?: string | undefined;
}>;
export declare const ProposalStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["pending", "won", "lost", "no_response"]>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "won" | "lost" | "no_response";
}, {
    status: "pending" | "won" | "lost" | "no_response";
}>;
export declare const AnalyzeProjectSchema: z.ZodObject<{
    projectTitle: z.ZodString;
    projectDescription: z.ZodString;
    projectUrl: z.ZodOptional<z.ZodString>;
    clientCountry: z.ZodOptional<z.ZodString>;
    clientTimezone: z.ZodOptional<z.ZodString>;
    paymentVerified: z.ZodOptional<z.ZodBoolean>;
    emailVerified: z.ZodOptional<z.ZodBoolean>;
    phoneVerified: z.ZodOptional<z.ZodBoolean>;
    proposalsCount: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    projectTitle: string;
    projectDescription: string;
    clientCountry?: string | undefined;
    clientTimezone?: string | undefined;
    projectUrl?: string | undefined;
    paymentVerified?: boolean | undefined;
    emailVerified?: boolean | undefined;
    phoneVerified?: boolean | undefined;
    proposalsCount?: number | undefined;
}, {
    projectTitle: string;
    projectDescription: string;
    clientCountry?: string | undefined;
    clientTimezone?: string | undefined;
    projectUrl?: string | undefined;
    paymentVerified?: boolean | undefined;
    emailVerified?: boolean | undefined;
    phoneVerified?: boolean | undefined;
    proposalsCount?: number | undefined;
}>;
export declare const AlertConfigSchema: z.ZodObject<{
    countries: z.ZodArray<z.ZodString, "many">;
    timezones: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    activeHoursStart: z.ZodDefault<z.ZodNumber>;
    activeHoursEnd: z.ZodDefault<z.ZodNumber>;
    notificationChannels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    countries: string[];
    timezones: string[];
    activeHoursStart: number;
    activeHoursEnd: number;
    notificationChannels: string[];
    enabled: boolean;
}, {
    countries: string[];
    timezones?: string[] | undefined;
    activeHoursStart?: number | undefined;
    activeHoursEnd?: number | undefined;
    notificationChannels?: string[] | undefined;
    enabled?: boolean | undefined;
}>;
export declare const ScraperQuerySchema: z.ZodObject<{
    query: z.ZodString;
    platform: z.ZodDefault<z.ZodEnum<["upwork", "freelancer", "both"]>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    query: string;
    platform: "upwork" | "freelancer" | "both";
    limit: number;
}, {
    query: string;
    platform?: "upwork" | "freelancer" | "both" | undefined;
    limit?: number | undefined;
}>;
export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UserProfileInput = z.infer<typeof UserProfileSchema>;
export type TemplateComponentInput = z.infer<typeof TemplateComponentSchema>;
export type ProposalTemplateInput = z.infer<typeof ProposalTemplateSchema>;
export type ProposalInput = z.infer<typeof ProposalSchema>;
export type AnalyzeProjectInput = z.infer<typeof AnalyzeProjectSchema>;
export type AlertConfigInput = z.infer<typeof AlertConfigSchema>;
export type ScraperQueryInput = z.infer<typeof ScraperQuerySchema>;
