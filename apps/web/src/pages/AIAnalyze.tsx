import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation } from 'react-router-dom';
import {
  Brain, Sparkles, AlertTriangle, TrendingUp, Clock,
  Target, DollarSign, ChevronDown, ChevronUp, RefreshCw,
  ExternalLink, Star, FileText, Copy, CheckCheck, Globe, Users,
  ShieldCheck, CreditCard, UserCheck, BadgeCheck,
} from 'lucide-react';
import { aiApi, proposalsApi, templatesApi } from '../lib/api';
import { AnalyzeProjectSchema, type AnalyzeProjectInput, POPULAR_COUNTRIES } from '@freelancer-os/shared';
import type { ScrapedProject } from '@freelancer-os/shared';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';

interface AnalysisResult {
  id?: string;
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

interface InstructionOption {
  id: string;
  title: string;
  content: string;
  wordLimit: number;
  endingText: string;
  appendEnding: boolean;
}

type GenerationMode = 'auto' | 'instruction' | 'ai';

interface GeneratedProposalMeta {
  mode: GenerationMode;
  usedInstruction: InstructionOption | null;
}

const EFFORT_CLASSES = {
  low:    'badge-success',
  medium: 'badge-warning',
  high:   'badge-danger',
};

const STRATEGY_CLASSES = {
  fixed:     'badge-blue',
  hourly:    'badge-blue',
  milestone: 'badge-blue',
};

export default function AIAnalyze() {
  const location = useLocation();
  const prefill  = (location.state as { project?: ScrapedProject } | null)?.project;

  const [result,           setResult]           = useState<AnalysisResult | null>(null);
  const [expandedId,       setExpandedId]       = useState<string | null>(null);
  const [proposal,         setProposal]         = useState<string | null>(null);
  const [copied,           setCopied]           = useState(false);
  const [toast,            setToast]            = useState<string | null>(null);
  const [savedToRecords,   setSavedToRecords]   = useState(false);
  const [generationMode,   setGenerationMode]   = useState<GenerationMode>('auto');
  const [selectedInstructionId, setSelectedInstructionId] = useState<string>('auto');
  const [lastGeneratedMeta, setLastGeneratedMeta] = useState<GeneratedProposalMeta | null>(null);

  const { data: pastAnalyses = [] } = useQuery({
    queryKey: ['ai-analyses'],
    queryFn:  aiApi.getAnalyses,
  });

  const { data: templateData = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  });

  const instructions: InstructionOption[] = (templateData as Array<Record<string, unknown>>)
    .filter((t) => t.category === 'instruction')
    .map((t) => {
      let parsed: { wordLimit?: number; endingText?: string; appendEnding?: boolean } = {};
      try {
        parsed = JSON.parse(String(t.strategy || '{}')) as { wordLimit?: number; endingText?: string; appendEnding?: boolean };
      } catch {
        parsed = {};
      }
      const components = (t.components as Record<string, unknown>) || {};
      return {
        id: String(t.id || ''),
        title: String(t.name || 'Instruction'),
        content: String(components.instructionContent || ''),
        wordLimit: typeof parsed.wordLimit === 'number' ? parsed.wordLimit : 170,
        endingText: typeof parsed.endingText === 'string' ? parsed.endingText : 'Best regards, {Your Name}',
        appendEnding: parsed.appendEnding !== false,
      };
    });

  function pickBestInstruction(): InstructionOption | null {
    if (instructions.length === 0) return null;

    const text = `${watchedTitle} ${watchedDescription}`.toLowerCase();
    const projectTokens = new Set(
      text
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 3),
    );

    let best: InstructionOption | null = null;
    let bestScore = -1;

    for (const instruction of instructions) {
      const instructionTokens = new Set(
        `${instruction.title} ${instruction.content}`
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((token) => token.length > 3),
      );

      let overlap = 0;
      for (const token of instructionTokens) {
        if (projectTokens.has(token)) overlap += 1;
      }

      const score = overlap + Math.min(3, instruction.wordLimit / 100);
      if (score > bestScore) {
        bestScore = score;
        best = instruction;
      }
    }

    return best || instructions[0] || null;
  }

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AnalyzeProjectInput>({
    resolver: zodResolver(AnalyzeProjectSchema),
  });

  const watchedTitle       = watch('projectTitle')       ?? '';
  const watchedDescription = watch('projectDescription') ?? '';

  // Pre-fill form when navigated from Project Search or Automation
  useEffect(() => {
    if (prefill) {
      setValue('projectTitle',       prefill.title);
      setValue('projectDescription', prefill.description);
      if (prefill.clientCountry) setValue('clientCountry', prefill.clientCountry);
      if (prefill.url)             setValue('projectUrl',      prefill.url);
      if (prefill.paymentVerified != null) setValue('paymentVerified', prefill.paymentVerified);
      if (prefill.identityVerified != null) setValue('emailVerified',  prefill.identityVerified);
      if (prefill.proposalsCount  != null) setValue('proposalsCount',  prefill.proposalsCount);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const analyzeMutation = useMutation({
    mutationFn: aiApi.analyze,
    onSuccess:  (data) => { setResult(data); setProposal(null); setLastGeneratedMeta(null); },
  });

  const proposalMutation = useMutation({
    mutationFn: aiApi.generateProposal,
    onSuccess:  (data) => {
      setProposal(data.proposal ?? data);
      setSavedToRecords(false);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => proposalsApi.create(payload),
    onSuccess: () => {
      setSavedToRecords(true);
      setToast('Saved to Records');
      setTimeout(() => setToast(null), 2000);
    },
  });

  function onSubmit(data: AnalyzeProjectInput) {
    setResult(null);
    setProposal(null);
    setSavedToRecords(false);
    setLastGeneratedMeta(null);
    analyzeMutation.mutate(data);
  }

  function handleGenerateProposal() {
    if (!result) return;

    const chosenInstruction = generationMode === 'instruction'
      ? (instructions.find((i) => i.id === selectedInstructionId) || null)
      : generationMode === 'auto'
        ? pickBestInstruction()
        : null;

    setLastGeneratedMeta({
      mode: generationMode,
      usedInstruction: chosenInstruction,
    });

    if (generationMode === 'instruction' && !chosenInstruction) {
      setToast('Select an instruction first');
      setTimeout(() => setToast(null), 2000);
      return;
    }

    proposalMutation.mutate({
      projectTitle:       watchedTitle,
      projectDescription: watchedDescription,
      analysisId:         result.id,
      generationMode,
      instruction: chosenInstruction
        ? {
            id: chosenInstruction.id,
            title: chosenInstruction.title,
            content: chosenInstruction.content,
            wordLimit: chosenInstruction.wordLimit,
            endingText: chosenInstruction.endingText,
            appendEnding: chosenInstruction.appendEnding,
          }
        : undefined,
      projectContext: {
        budget: prefill?.budget,
        clientCountry: String(watch('clientCountry') ?? prefill?.clientCountry ?? 'Unknown'),
        projectUrl: String(watch('projectUrl') ?? prefill?.url ?? ''),
        proposalsCount: Number.isFinite(watch('proposalsCount') as number) ? Number(watch('proposalsCount')) : prefill?.proposalsCount ?? undefined,
        paymentVerified: Boolean(watch('paymentVerified')),
        emailVerified: Boolean(watch('emailVerified')),
        phoneVerified: Boolean(watch('phoneVerified')),
      },
    });

    if (generationMode === 'auto' && chosenInstruction) {
      setToast(`Auto mode selected: ${chosenInstruction.title}`);
      setTimeout(() => setToast(null), 2000);
    }
  }

  function handleSaveToRecords() {
    if (!result || !proposal) return;

    const chosenInstruction = lastGeneratedMeta?.usedInstruction || null;

    const projectUrl = String(watch('projectUrl') ?? '').trim();
    const clientCountry = String(watch('clientCountry') ?? prefill?.clientCountry ?? 'Unknown').trim() || 'Unknown';
    const proposalsCount = Number.isFinite(watch('proposalsCount') as number) ? Number(watch('proposalsCount')) : undefined;

    const contextLine = JSON.stringify({
      projectUrl: projectUrl || prefill?.url || null,
      budget: prefill?.budget || null,
      bidCount: proposalsCount ?? prefill?.proposalsCount ?? null,
      generationMode: lastGeneratedMeta?.mode || generationMode,
      selectedInstruction: chosenInstruction
        ? { id: chosenInstruction.id, title: chosenInstruction.title }
        : {
            id: lastGeneratedMeta?.mode === 'ai' ? 'ai-generated' : 'auto',
            title: lastGeneratedMeta?.mode === 'ai' ? 'AI Generated' : 'Auto Select',
          },
      clientVerification: {
        paymentVerified: Boolean(watch('paymentVerified')),
        emailVerified: Boolean(watch('emailVerified')),
        phoneVerified: Boolean(watch('phoneVerified')),
      },
    });

    const metadataDescription = `${watchedDescription}\n\n[PROJECT_CONTEXT]${contextLine}`;
    const bidAmount = Math.max(1, Math.round((result.bidRange.min + result.bidRange.max) / 2));

    saveMutation.mutate({
      projectTitle: watchedTitle,
      projectDescription: metadataDescription,
      clientCountry,
      clientTimezone: 'UTC',
      techStack: result.matchedSkills,
      bidAmount,
      currency: result.bidRange.currency || 'USD',
      content: proposal,
      platform: prefill?.platform || 'upwork',
    });
  }

  async function copyProposal() {
    if (!proposal) return;
    await navigator.clipboard.writeText(proposal);
    setCopied(true);
    setToast('Copied to clipboard');
    setTimeout(() => setToast(null), 2000);
    setTimeout(() => setCopied(false), 2000);
  }

  // Verification flags available from prefill
  const hasVerificationData = prefill && (
    prefill.identityVerified != null ||
    prefill.paymentVerified  != null ||
    prefill.profileCompleted != null ||
    prefill.depositMade      != null
  );

  return (
    <div className="page-shell">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark flex items-center gap-2">
          <Brain size={24} className="text-primary" /> AI Project Analysis
        </h1>
        <p className="text-slate-500 mt-0.5">Paste any project listing and get an instant bid strategy + proposal</p>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-dark text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-none animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      {/* Project info strip — shown when navigated from Project Search / Automation */}
      {prefill && (
        <div className="mb-5 card p-4 bg-primary/3 border border-primary/15">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-primary font-semibold uppercase tracking-wide mb-1">
                Project from {prefill.platform === 'upwork' ? 'Upwork' : 'Freelancer.com'}
              </p>
              <p className="text-sm font-semibold text-dark mb-2">{prefill.title}</p>

              {/* Meta row */}
              <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500 mb-2">
                {prefill.budget && (
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <DollarSign size={11} className="text-success" />{prefill.budget}
                  </span>
                )}
                {prefill.clientCountry && (
                  <span className="flex items-center gap-1">
                    <Globe size={11} />{prefill.clientCountry}
                  </span>
                )}
                {prefill.clientRating != null && (
                  <span className="flex items-center gap-0.5 text-amber-500">
                    <Star size={10} className="fill-amber-400" />
                    {prefill.clientRating.toFixed(1)} rating
                  </span>
                )}
                {prefill.clientReviewCount != null && (
                  <span className="flex items-center gap-1 text-slate-500">
                    {prefill.clientReviewCount} client review{prefill.clientReviewCount !== 1 ? 's' : ''}
                  </span>
                )}
                {prefill.proposalsCount != null && (
                  <span className="flex items-center gap-1">
                    <Users size={11} />{prefill.proposalsCount} proposals
                  </span>
                )}
                {prefill.postedAt && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} />{prefill.postedAt}
                  </span>
                )}
              </div>

              {/* Verification badges */}
              {hasVerificationData && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {prefill.identityVerified === true && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                      <ShieldCheck size={9} /> Identity Verified
                    </span>
                  )}
                  {prefill.paymentVerified === true && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                      <CreditCard size={9} /> Payment Verified
                    </span>
                  )}
                  {prefill.profileCompleted === true && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                      <UserCheck size={9} /> Profile Complete
                    </span>
                  )}
                  {prefill.depositMade === true && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                      <BadgeCheck size={9} /> Deposit Made
                    </span>
                  )}
                  {prefill.identityVerified === false && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-400 font-medium">
                      Identity Not Verified
                    </span>
                  )}
                  {prefill.paymentVerified === false && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-400 font-medium">
                      Payment Not Verified
                    </span>
                  )}
                </div>
              )}

              {/* Skills */}
              {prefill.skills && prefill.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {prefill.skills.slice(0, 8).map(s => (
                    <span key={s} className="badge badge-gray text-[10px]">{s}</span>
                  ))}
                  {prefill.skills.length > 8 && (
                    <span className="badge badge-gray text-[10px]">+{prefill.skills.length - 8}</span>
                  )}
                </div>
              )}
            </div>

            {/* Project link */}
            {prefill.url && (
              <a
                href={prefill.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 flex-shrink-0"
              >
                <ExternalLink size={11} /> View Project
              </a>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Form ─────────────────────────────────────────────────────────── */}
        <div className="card p-5">
          <h2 className="font-semibold text-dark mb-4">Analyze Project</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Project Title</label>
              <input
                {...register('projectTitle')}
                className="input"
                placeholder="e.g. Build React Dashboard with Charts"
              />
              {errors.projectTitle && (
                <p className="mt-1 text-xs text-danger">{errors.projectTitle.message}</p>
              )}
            </div>

            <div>
              <label className="label">Project Description</label>
              <textarea
                {...register('projectDescription')}
                rows={8}
                className="input resize-none"
                placeholder="Paste the full project description from Upwork / Freelancer..."
              />
              {errors.projectDescription && (
                <p className="mt-1 text-xs text-danger">{errors.projectDescription.message}</p>
              )}
            </div>


            {/* Project URL */}
            <div>
              <label className="label">
                Project URL <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <input
                  {...register('projectUrl')}
                  type="url"
                  className="input pr-10"
                  placeholder="https://www.upwork.com/jobs/..."
                />
                {watch('projectUrl') && (
                  <a
                    href={watch('projectUrl')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                    title="Open project link"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>

            {/* ── Client Details ────────────────────────────────────────── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Globe size={11} /> Client Details
              </p>

              <div>
                <label className="label text-xs">
                  Client Country <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <select {...register('clientCountry')} className="input text-sm">
                  <option value="">— Unknown —</option>
                  {POPULAR_COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="label text-xs">
                  Total Proposals / Bids <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  {...register('proposalsCount', { valueAsNumber: true })}
                  type="number"
                  min={0}
                  className="input text-sm"
                  placeholder="e.g. 25"
                />
              </div>

              {/* Show budget from prefill if available */}
              {prefill?.budget && (
                <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">
                    Project Budget
                  </p>
                  <p className="text-sm font-semibold text-dark flex items-center gap-1">
                    <DollarSign size={13} className="text-success" /> {prefill.budget}
                  </p>
                </div>
              )}

              {/* Client Verification */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Client Verification
                </p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...register('paymentVerified')}
                      className="w-3.5 h-3.5 rounded accent-primary"
                    />
                    <CreditCard size={12} className="text-slate-400" />
                    <span className="text-xs text-slate-700">Payment Verified</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...register('emailVerified')}
                      className="w-3.5 h-3.5 rounded accent-primary"
                    />
                    <UserCheck size={12} className="text-slate-400" />
                    <span className="text-xs text-slate-700">Email / Identity Verified</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...register('phoneVerified')}
                      className="w-3.5 h-3.5 rounded accent-primary"
                    />
                    <ShieldCheck size={12} className="text-slate-400" />
                    <span className="text-xs text-slate-700">Phone Verified</span>
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={analyzeMutation.isPending}
              className="btn-primary w-full justify-center"
            >
              {analyzeMutation.isPending ? (
                <><RefreshCw size={14} className="animate-spin" /> Analyzing...</>
              ) : (
                <><Sparkles size={14} /> Analyze Project</>
              )}
            </button>

            {analyzeMutation.isError && (
              <p className="text-xs text-danger text-center">
                Analysis failed. Make sure your profile has skills set in Profile settings.
              </p>
            )}
          </form>
        </div>

        {/* ── Result ───────────────────────────────────────────────────────── */}
        <div>
          {analyzeMutation.isPending && (
            <div className="card p-8 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw size={28} className="animate-spin text-primary" />
              <p className="text-sm">AI is analyzing the project...</p>
            </div>
          )}

          {result && !analyzeMutation.isPending && (
            <div className="card p-5 space-y-5">
              <div className="flex items-start justify-between">
                <h2 className="font-semibold text-dark">Analysis Result</h2>
                <div className="flex gap-2">
                  <span className={clsx('badge', STRATEGY_CLASSES[result.biddingStrategy])}>
                    {result.biddingStrategy} price
                  </span>
                  <span className={clsx('badge', EFFORT_CLASSES[result.effortLevel])}>
                    {result.effortLevel} effort
                  </span>
                </div>
              </div>

              {/* Tech Fit Score */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-dark flex items-center gap-1.5">
                    <Target size={14} className="text-primary" /> Tech Fit Score
                  </span>
                  <span className={clsx(
                    'text-sm font-bold',
                    result.techFitScore >= 70 ? 'text-success'
                      : result.techFitScore >= 40 ? 'text-warning'
                      : 'text-danger',
                  )}>
                    {result.techFitScore}/100
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all',
                      result.techFitScore >= 70 ? 'bg-success'
                        : result.techFitScore >= 40 ? 'bg-warning'
                        : 'bg-danger',
                    )}
                    style={{ width: `${result.techFitScore}%` }}
                  />
                </div>
                {result.matchedSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {result.matchedSkills.map((s) => (
                      <span key={s} className="badge badge-success text-xs">{s}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Bid Range & Effort */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign size={13} className="text-primary" />
                    <span className="text-xs font-medium text-slate-600">Bid Range</span>
                  </div>
                  <p className="font-bold text-dark">
                    ${result.bidRange.min} – ${result.bidRange.max}
                  </p>
                  <p className="text-xs text-slate-400">{result.bidRange.currency}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock size={13} className="text-primary" />
                    <span className="text-xs font-medium text-slate-600">Estimated Hours</span>
                  </div>
                  <p className="font-bold text-dark">{result.hoursEstimate}h</p>
                  <p className="text-xs text-slate-400">{result.effortLevel} effort</p>
                </div>
              </div>

              {/* Winning Angle */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingUp size={13} className="text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Winning Angle
                  </span>
                </div>
                <p className="text-sm text-dark">{result.winningAngle}</p>
              </div>

              {/* Red Flags */}
              {result.redFlags.length > 0 && (
                <div className="bg-danger/5 border border-danger/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={13} className="text-danger" />
                    <span className="text-xs font-semibold text-danger uppercase tracking-wide">
                      Red Flags
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {result.redFlags.map((f, i) => (
                      <li key={i} className="text-sm text-dark flex items-start gap-2">
                        <span className="text-danger mt-0.5">•</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended Structure */}
              {result.recommendedStructure.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Recommended Structure
                  </p>
                  <ol className="space-y-1">
                    {result.recommendedStructure.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-dark">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold flex-shrink-0">
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* ── Generate Proposal (inline — no redirect) ───────────────── */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <FileText size={12} /> Generate Proposal
                </p>

                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'auto', label: 'Auto' },
                    { value: 'instruction', label: 'Instruction' },
                    { value: 'ai', label: 'AI Generated' },
                  ] as Array<{ value: GenerationMode; label: string }>).map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setGenerationMode(mode.value)}
                      className={clsx(
                        'rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                        generationMode === mode.value
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {generationMode === 'instruction' && (
                  <div>
                    <label className="label text-xs">Instruction</label>
                    <select
                      value={selectedInstructionId}
                      onChange={(e) => setSelectedInstructionId(e.target.value)}
                      className="input text-sm"
                    >
                      <option value="">Select instruction</option>
                      {instructions.map((instruction) => (
                        <option key={instruction.id} value={instruction.id}>
                          {instruction.title} ({instruction.wordLimit} words)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {generationMode !== 'ai' && instructions.length === 0 && (
                  <p className="text-xs text-slate-500">
                    No saved instructions yet. Auto mode will fall back to default AI logic.
                  </p>
                )}

                {lastGeneratedMeta?.usedInstruction && proposal && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      Applied Instruction
                    </p>
                    <p className="text-xs text-slate-700">
                      {lastGeneratedMeta.usedInstruction.title} · {lastGeneratedMeta.usedInstruction.wordLimit} words
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateProposal}
                    disabled={proposalMutation.isPending}
                    className="btn-primary text-xs px-4 flex items-center gap-1.5 flex-1 justify-center"
                  >
                    {proposalMutation.isPending
                      ? <><RefreshCw size={12} className="animate-spin" /> Generating...</>
                      : <><Sparkles size={12} /> Generate</>}
                  </button>
                  {proposal && (
                    <button
                      type="button"
                      onClick={handleGenerateProposal}
                      disabled={proposalMutation.isPending}
                      className="btn-secondary text-xs px-3 flex items-center gap-1.5 flex-shrink-0"
                    >
                      <RefreshCw size={12} /> Regenerate
                    </button>
                  )}
                  {proposal && (
                    <button
                      type="button"
                      onClick={copyProposal}
                      className="btn-secondary text-xs px-3 flex items-center gap-1.5 flex-shrink-0"
                    >
                      {copied
                        ? <><CheckCheck size={12} className="text-success" /> Copied!</>
                        : <><Copy size={12} /> Copy</>}
                    </button>
                  )}
                  {proposal && (
                    <button
                      type="button"
                      onClick={handleSaveToRecords}
                      disabled={saveMutation.isPending || savedToRecords}
                      className="btn-secondary text-xs px-3 flex items-center gap-1.5 flex-shrink-0"
                    >
                      {saveMutation.isPending
                        ? <><RefreshCw size={12} className="animate-spin" /> Saving...</>
                        : <><CheckCheck size={12} /> {savedToRecords ? 'Saved to Records' : 'Save to Records'}</>}
                    </button>
                  )}
                </div>

                {proposalMutation.isError && (
                  <p className="text-xs text-danger">Proposal generation failed. Try again.</p>
                )}

                {savedToRecords && (
                  <p className="text-xs text-success">Proposal and project context saved to Records.</p>
                )}

                {proposal && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {proposal.length.toLocaleString()} characters · {proposal.split(/\s+/).filter(Boolean).length} words
                      </span>
                    </div>
                    <pre className="text-xs text-dark whitespace-pre-wrap leading-relaxed pr-6">
                      {proposal}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {!result && !analyzeMutation.isPending && (
            <div className="card p-8 text-center text-slate-400">
              <Brain size={32} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm">Fill out the form and click Analyze to get AI insights</p>
              <p className="text-xs text-slate-400 mt-1">
                Proposal generation will appear here after analysis
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Past Analyses ─────────────────────────────────────────────────── */}
      {pastAnalyses.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-dark mb-4">Past Analyses</h2>
          <div className="space-y-2">
            {pastAnalyses.map((a: AnalysisResult & { id: string; projectTitle?: string; createdAt: string }) => (
              <div key={a.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={clsx('badge', EFFORT_CLASSES[a.effortLevel])}>{a.effortLevel}</span>
                    <div>
                      <p className="text-sm font-medium text-dark">
                        {a.projectTitle || 'Project Analysis'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Tech fit: {a.techFitScore}/100 · Bid: ${a.bidRange?.min}–${a.bidRange?.max} ·{' '}
                        {format(parseISO(a.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  {expandedId === a.id
                    ? <ChevronUp size={16} className="text-slate-400" />
                    : <ChevronDown size={16} className="text-slate-400" />}
                </button>

                {expandedId === a.id && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                    <p className="text-sm text-dark">
                      <span className="font-medium">Winning angle:</span> {a.winningAngle}
                    </p>
                    {a.redFlags.length > 0 && (
                      <p className="text-sm text-danger">
                        <span className="font-medium">Red flags:</span> {a.redFlags.join(', ')}
                      </p>
                    )}
                    {a.matchedSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {a.matchedSkills.map((s) => (
                          <span key={s} className="badge badge-success text-xs">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
