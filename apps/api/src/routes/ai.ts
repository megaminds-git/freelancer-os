import { Router, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { analyzeProject, generateProposal, reviewProfile } from '../lib/groq';
import { AnalyzeProjectSchema } from '@freelancer-os/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createError } from '../middleware/errorHandler';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();
router.use(authenticate);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many AI requests, please slow down.' },
  keyGenerator: (req) => (req as AuthRequest).userId || req.ip || 'unknown',
});

// POST /api/v1/ai/analyze
router.post('/analyze', aiLimiter, validate(AnalyzeProjectSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);

    const { projectTitle, projectDescription, clientCountry, projectUrl, paymentVerified, emailVerified, phoneVerified, proposalsCount } = req.body;
    const safeProjectTitle = String(projectTitle ?? '').trim();
    const safeProjectDescription = String(projectDescription ?? '').trim();
    if (!safeProjectTitle || !safeProjectDescription) {
      throw createError('Project title and description are required', 400);
    }

    const profile = await prisma.userProfile.findUnique({ where: { userId: req.userId } });

    const analysis = await analyzeProject(
      safeProjectTitle,
      safeProjectDescription,
      profile?.skills || [],
      profile?.hourlyRate || 30,
      clientCountry || 'Unknown',
      { projectUrl, paymentVerified, emailVerified, phoneVerified, proposalsCount },
    );

    let savedId: string | null = null;
    try {
      const saved = await prisma.aiAnalysis.create({
        data: {
          userId: req.userId,
          projectTitle: safeProjectTitle,
          projectDescription: safeProjectDescription,
          recommendedStructure: analysis.recommendedStructure,
          biddingStrategy: analysis.biddingStrategy,
          effortLevel: analysis.effortLevel,
          hoursEstimate: analysis.hoursEstimate,
          techFitScore: analysis.techFitScore,
          matchedSkills: analysis.matchedSkills,
          bidRangeMin: analysis.bidRange.min,
          bidRangeMax: analysis.bidRange.max,
          currency: analysis.bidRange.currency,
          redFlags: analysis.redFlags,
          winningAngle: analysis.winningAngle,
        },
      });

      savedId = saved.id;
      await prisma.analyticsEvent.create({
        data: {
          userId: req.userId,
          eventType: 'ai_analysis',
          metadata: { analysisId: saved.id, techFitScore: analysis.techFitScore },
        },
      });
    } catch {
      // Keep analysis endpoint resilient if persistence fails.
      savedId = null;
    }

    res.json({ ...analysis, id: savedId });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/ai/analyses
router.get('/analyses', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);

    const analyses = await prisma.aiAnalysis.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Defend against partial/corrupt rows causing UI crashes.
    const safeAnalyses = analyses.filter((a) => !!a.projectTitle && !!a.projectDescription);
    res.json(safeAnalyses);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/ai/generate-proposal
const GenerateSchema = z.object({
  projectTitle: z.string().min(1),
  projectDescription: z.string().min(10),
  analysisId: z.string().optional(),
  generationMode: z.enum(['auto', 'instruction', 'ai']).default('auto'),
  strategy: z.string().optional(),
  instruction: z
    .object({
      id: z.string().optional(),
      title: z.string().min(1),
      content: z.string().min(1),
      wordLimit: z.number().int().positive().optional(),
      endingText: z.string().optional(),
      appendEnding: z.boolean().optional(),
    })
    .optional(),
  projectContext: z
    .object({
      budget: z.string().optional(),
      clientCountry: z.string().optional(),
      projectUrl: z.string().optional(),
      proposalsCount: z.number().int().nonnegative().optional(),
      paymentVerified: z.boolean().optional(),
      emailVerified: z.boolean().optional(),
      phoneVerified: z.boolean().optional(),
    })
    .optional(),
});

router.post('/generate-proposal', aiLimiter, validate(GenerateSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectTitle, projectDescription, analysisId, generationMode, strategy, instruction, projectContext } = req.body;

    const [profile, user] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId: req.userId } }),
      prisma.user.findUnique({ where: { id: req.userId } }),
    ]);

    let analysis;
    if (analysisId) {
      const saved = await prisma.aiAnalysis.findFirst({ where: { id: analysisId, userId: req.userId } });
      if (saved) {
        analysis = {
          recommendedStructure: saved.recommendedStructure,
          biddingStrategy: saved.biddingStrategy as 'fixed' | 'hourly' | 'milestone',
          effortLevel: saved.effortLevel as 'low' | 'medium' | 'high',
          hoursEstimate: saved.hoursEstimate,
          techFitScore: saved.techFitScore,
          matchedSkills: saved.matchedSkills,
          bidRange: { min: saved.bidRangeMin, max: saved.bidRangeMax, currency: saved.currency },
          redFlags: saved.redFlags,
          winningAngle: saved.winningAngle,
        };
      }
    }

    if (!analysis) {
      analysis = await analyzeProject(
        projectTitle,
        projectDescription,
        profile?.skills || [],
        profile?.hourlyRate || 30,
      );
    }

    const proposal = await generateProposal(
      projectTitle,
      projectDescription,
      analysis,
      user?.name || 'Freelancer',
      profile?.bio || '',
      strategy,
      instruction,
      generationMode,
      projectContext,
    );

    res.json({ proposal, analysis });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/ai/profile-review
const ProfileReviewSchema = z.object({
  profileDescription: z.string().min(20),
  platform: z.string().default('Upwork'),
});

router.post('/profile-review', aiLimiter, validate(ProfileReviewSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { profileDescription, platform } = req.body;

    const review = await reviewProfile(profileDescription, platform);

    const saved = await prisma.profileReview.create({
      data: {
        userId: req.userId!,
        overallScore: review.overallScore,
        headlineScore: review.dimensionScores.headline,
        bioScore: review.dimensionScores.bio,
        skillsScore: review.dimensionScores.skills,
        portfolioScore: review.dimensionScores.portfolio,
        completenessScore: review.dimensionScores.completeness,
        improvements: review.improvements,
      },
    });

    res.json({ ...review, id: saved.id });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/ai/profile-reviews
router.get('/profile-reviews', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const reviews = await prisma.profileReview.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    res.json(reviews);
  } catch (err) {
    next(err);
  }
});

export default router;
