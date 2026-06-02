/**
 * Unified Filtering System
 * 
 * Provides strict, consistent filtering logic used by both:
 * - Extension (background.js) — filters during scraping
 * - Automation page (Automation.tsx) — filters during display
 * - Scraper page (Scraper.tsx) — filters during search
 * 
 * All filters use AND logic: a project must match ALL selected criteria to pass.
 * Keyword matching is exact substring match (case-insensitive).
 * No partial or loose matching.
 */

import type { ScrapedProject } from './types';

export interface StrictFilterConfig {
  // Keyword filtering (from extension or Automation page)
  keywords?: string[];           // Keywords from search query (OR logic: at least one must match)
  
  // Verification filters (AND logic: all selected must be true)
  paymentVerified?: boolean;
  identityVerified?: boolean;
  depositMade?: boolean;
  profileCompleted?: boolean;
  
  // Numeric filters (AND logic: all must pass)
  minClientRating?: number;
  minClientReviews?: number;
  minBudget?: number;
  maxBudget?: number;
  maxProposals?: number;
  
  // Keyword inclusion/exclusion (AND logic)
  includeKeywords?: string[];    // ALL must appear in title/description
  excludeKeywords?: string[];    // NONE must appear in title/description
  
  // Tech stack (AND logic: ALL selected techs must be present)
  techStack?: string[];
}

/**
 * Parse budget string to minimum value
 * Examples: "$100", "$100-500", "100", "100-500" → 100
 */
function parseBudgetMin(budget: string): number {
  if (!budget) return 0;
  const match = budget.match(/\$?([\d,]+)/);
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
}

/**
 * Parse budget string to maximum value
 * Examples: "$100", "$100-500", "100", "100-500" → 500 or 100
 */
function parseBudgetMax(budget: string): number {
  if (!budget) return Infinity;
  const parts = budget.split('-');
  if (parts.length > 1) {
    const match = parts[1].match(/\$?([\d,]+)/);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : Infinity;
  }
  const match = budget.match(/\$?([\d,]+)/);
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : Infinity;
}

/**
 * Normalize tech stack names for comparison
 * Strips dots, spaces, and converts to lowercase
 * Examples: "node.js" → "nodejs", "Node JS" → "nodejs"
 */
function normalizeTech(tech: string): string {
  return tech.toLowerCase().replace(/[.\s]/g, '');
}

/**
 * Check if a project matches a single keyword (substring match, case-insensitive)
 */
function matchesKeyword(project: ScrapedProject, keyword: string): boolean {
  const text = `${project.title || ''} ${project.description || ''}`.toLowerCase();
  return text.includes(keyword.toLowerCase());
}

/**
 * Check if a project matches any keyword in the list (OR logic)
 * Used for the main search query keywords
 */
function matchesAnyKeyword(project: ScrapedProject, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  return keywords.some(kw => matchesKeyword(project, kw));
}

/**
 * Check if a project matches all include keywords (AND logic)
 * All keywords must appear in title or description
 */
function matchesAllIncludeKeywords(project: ScrapedProject, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  return keywords.every(kw => matchesKeyword(project, kw));
}

/**
 * Check if a project matches any exclude keywords (should NOT match)
 * If any exclude keyword appears, project is rejected
 */
function matchesAnyExcludeKeyword(project: ScrapedProject, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  return keywords.some(kw => matchesKeyword(project, kw));
}

/**
 * Check if a project has all required tech skills
 * Normalizes tech names to handle variations (node.js, nodejs, Node JS, etc.)
 */
function hasAllTechStack(project: ScrapedProject, techStack: string[]): boolean {
  if (!techStack || techStack.length === 0) return true;
  
  const projectSkills = (project.skills ?? []).map(s => normalizeTech(s));
  const projectText = `${project.title || ''} ${project.description || ''}`.toLowerCase();
  
  return techStack.every(tech => {
    const normalized = normalizeTech(tech);
    // Check if tech appears in skills list or in project text
    return projectSkills.some(s => s.includes(normalized)) || 
           projectText.includes(normalized);
  });
}

/**
 * Main filtering function - STRICT AND logic
 * A project passes only if it matches ALL selected criteria
 */
export function filterProject(project: ScrapedProject, config: StrictFilterConfig): boolean {
  // 1. KEYWORD FILTERING (OR logic: at least one keyword must match)
  // This is the primary search filter
  if (!matchesAnyKeyword(project, config.keywords)) {
    return false;
  }

  // 2. INCLUDE KEYWORDS (AND logic: ALL must appear)
  if (!matchesAllIncludeKeywords(project, config.includeKeywords)) {
    return false;
  }

  // 3. EXCLUDE KEYWORDS (AND logic: NONE must appear)
  if (matchesAnyExcludeKeyword(project, config.excludeKeywords)) {
    return false;
  }

  // 4. TECH STACK (AND logic: ALL selected techs must be present)
  if (!hasAllTechStack(project, config.techStack)) {
    return false;
  }

  // 5. VERIFICATION FLAGS (AND logic: all selected must be true)
  if (config.paymentVerified && project.paymentVerified === false) {
    return false;
  }
  if (config.identityVerified && project.identityVerified === false) {
    return false;
  }
  if (config.depositMade && project.depositMade === false) {
    return false;
  }
  if (config.profileCompleted && project.profileCompleted === false) {
    return false;
  }

  // 6. NUMERIC FILTERS (AND logic: all must pass)
  if (config.minClientRating !== undefined && config.minClientRating > 0) {
    if (project.clientRating == null || project.clientRating < config.minClientRating) {
      return false;
    }
  }

  if (config.minClientReviews !== undefined && config.minClientReviews > 0) {
    if (project.clientReviewCount == null || project.clientReviewCount < config.minClientReviews) {
      return false;
    }
  }

  if (config.minBudget !== undefined && config.minBudget > 0) {
    if (parseBudgetMin(project.budget) < config.minBudget) {
      return false;
    }
  }

  if (config.maxBudget !== undefined && config.maxBudget > 0) {
    if (parseBudgetMax(project.budget) > config.maxBudget) {
      return false;
    }
  }

  if (config.maxProposals !== undefined && config.maxProposals > 0) {
    if ((project.proposalsCount ?? 999) > config.maxProposals) {
      return false;
    }
  }

  // All filters passed
  return true;
}

/**
 * Filter an array of projects using strict AND logic
 */
export function filterProjects(
  projects: ScrapedProject[],
  config: StrictFilterConfig,
): ScrapedProject[] {
  return projects.filter(p => filterProject(p, config));
}

/**
 * Convert Automation page config to strict filter config
 */
export function automationConfigToFilterConfig(cfg: any): StrictFilterConfig {
  return {
    keywords: cfg.query
      ? cfg.query.split(',').map((k: string) => k.trim()).filter(Boolean)
      : [],
    includeKeywords: cfg.includeKeywords
      ? cfg.includeKeywords.split(',').map((k: string) => k.trim()).filter(Boolean)
      : [],
    excludeKeywords: cfg.excludeKeywords
      ? cfg.excludeKeywords.split(',').map((k: string) => k.trim()).filter(Boolean)
      : [],
    techStack: cfg.techStack ?? [],
    paymentVerified: cfg.paymentVerified ?? false,
    identityVerified: cfg.identityVerified ?? false,
    depositMade: cfg.depositMade ?? false,
    profileCompleted: cfg.profileCompleted ?? false,
    minClientRating: cfg.minClientRating ? parseFloat(cfg.minClientRating) : undefined,
    minClientReviews: cfg.minClientReviews ? parseInt(cfg.minClientReviews, 10) : undefined,
    minBudget: cfg.minBudget ? parseFloat(cfg.minBudget) : undefined,
    maxBudget: cfg.maxBudget ? parseFloat(cfg.maxBudget) : undefined,
    maxProposals: cfg.maxProposals && cfg.maxProposals !== 'any' ? parseInt(cfg.maxProposals, 10) : undefined,
  };
}

/**
 * Convert extension filter config to strict filter config
 */
export function extensionFiltersToFilterConfig(
  keywords: string[],
  filters: any,
): StrictFilterConfig {
  return {
    keywords: keywords ?? [],
    paymentVerified: filters?.paymentVerified ?? false,
    identityVerified: filters?.profileVerified ?? false,
    depositMade: filters?.depositMade ?? false,
    minClientRating: filters?.minRating ?? undefined,
    minClientReviews: filters?.minReviews ?? undefined,
  };
}
