// ── User ──────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  skills: string[];
  experience: string;
  bio: string;
  hourlyRate: number;
  platforms: string[];
}

// ── Templates ─────────────────────────────────────────────────────────────────
export type ComponentType = 'greeting' | 'opening' | 'strategy' | 'closing' | 'regards' | 'ps';

export interface TemplateComponent {
  id: string;
  userId: string;
  type: ComponentType;
  content: string;
  tags: string[];
  createdAt: string;
}

export interface ProposalTemplate {
  id: string;
  userId: string;
  name: string;
  category: string;
  strategy: string;
  components: Record<ComponentType, string>;
  createdAt: string;
}

// ── Proposals ─────────────────────────────────────────────────────────────────
export type ProposalStatus = 'pending' | 'won' | 'lost' | 'no_response';

export interface Proposal {
  id: string;
  userId: string;
  projectTitle: string;
  projectDescription: string;
  clientCountry: string;
  clientTimezone: string;
  techStack: string[];
  bidAmount: number;
  currency: string;
  content: string;
  status: ProposalStatus;
  platform: string;
  createdAt: string;
  expiresAt: string;
}

// ── AI Analysis ───────────────────────────────────────────────────────────────
export interface AIAnalysis {
  id: string;
  userId: string;
  projectDescription: string;
  recommendedStructure: string[];
  biddingStrategy: 'fixed' | 'hourly' | 'milestone';
  effortLevel: 'low' | 'medium' | 'high';
  hoursEstimate: number;
  techFitScore: number;
  matchedSkills: string[];
  bidRange: { min: number; max: number; currency: string };
  redFlags: string[];
  winningAngle: string;
  createdAt: string;
}

export interface ProfileReview {
  id: string;
  userId: string;
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
  createdAt: string;
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export interface AlertConfig {
  id: string;
  userId: string;
  countries: string[];
  timezones: string[];
  activeHoursStart: number;
  activeHoursEnd: number;
  notificationChannels: string[];
  enabled: boolean;
}

// ── Scraper ───────────────────────────────────────────────────────────────────
export interface ScrapedProject {
  id: string;
  title: string;
  description: string;
  budget: string;
  skills: string[];
  clientCountry: string;
  clientRating: number | null;
  clientReviewCount?: number | null;
  postedAt: string;
  url: string;
  platform: 'upwork' | 'freelancer';
  proposalsCount: number | null;
  identityVerified?: boolean;
  paymentVerified?: boolean;
  profileCompleted?: boolean;
  depositMade?: boolean;
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export interface DashboardStats {
  totalProposals: number;
  wonProposals: number;
  winRate: number;
  avgBidAmount: number;
  activeAlerts: number;
  proposalsThisWeek: number;
}
