import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TECH_SKILLS, PLATFORMS } from '@freelancer-os/shared';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Briefcase,
  Check,
  CheckCircle2,
  Camera,
  Clock3,
  ExternalLink,
  Key,
  Link2,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  TrendingUp,
  User,
  Unlink,
  X,
} from 'lucide-react';
import { aiApi, connectionsApi, getApiErrorMessage, type PlatformName, usersApi } from '../lib/api';
import { calculateProfileCompletion } from '../lib/profileCompletion';
import { useAuthStore } from '../store/authStore';

interface ProfileReview {
  id: string;
  overallScore: number;
  dimensionScores: { headline: number; bio: number; skills: number; portfolio: number; completeness: number };
  improvements: { action: string; expectedImpact: 'high' | 'medium' | 'low'; estimatedDays: number }[];
  createdAt: string;
}

type Notice = { type: 'success' | 'error'; message: string } | null;

const IMPACT_CLASSES = { high: 'badge-danger', medium: 'badge-warning', low: 'badge-success' };

const POPULAR_TZ = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London',
  'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore',
  'Asia/Tokyo', 'Australia/Sydney',
];

interface PlatformCardProps {
  platform: PlatformName;
  color: string;
  initial: string;
  label: string;
  connection: { connectedAt: string; expiresAt: string | null; email: string | null; externalId: string | null; expired: boolean } | null;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}

function PlatformCard({
  color,
  initial,
  label,
  connection,
  loading,
  onConnect,
  onDisconnect,
  onReconnect,
}: PlatformCardProps) {
  const isConnected = !!connection && !connection.expired;
  const isExpired = !!connection?.expired;
  const displayName = connection?.externalId ?? connection?.email ?? null;

  return (
    <div
      className={clsx(
        'rounded-xl border p-4 transition-colors',
        isConnected ? 'border-emerald-200 bg-emerald-50/40'
          : isExpired ? 'border-amber-200 bg-amber-50/40'
            : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-dark">{label}</p>
          {isConnected && displayName && (
            <p className="truncate text-xs text-slate-500">@{displayName}</p>
          )}
          {isConnected && !displayName && <p className="text-xs text-emerald-600">Connected</p>}
          {isExpired && (
            <p className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle size={10} /> Session expired
            </p>
          )}
          {!connection && <p className="text-xs text-slate-400">Not connected</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {isConnected && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle2 size={13} /> Connected
            </span>
          )}
          {loading ? (
            <Loader2 size={16} className="animate-spin text-slate-400" />
          ) : isConnected ? (
            <button
              onClick={onDisconnect}
              title="Disconnect"
              className="p-1 text-slate-400 transition-colors hover:text-danger"
            >
              <Unlink size={14} />
            </button>
          ) : isExpired ? (
            <button onClick={onReconnect} className="btn-primary px-3 py-1.5 text-xs">
              <RefreshCw size={12} /> Reconnect
            </button>
          ) : (
            <button onClick={onConnect} className="btn-primary px-3 py-1.5 text-xs">
              <ExternalLink size={12} /> Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof User;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
        <Icon size={16} />
      </div>
      <div>
        <h2 className="text-base font-semibold tracking-[-0.01em] text-dark">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <label className="label">{children}</label>;
}

export default function Profile() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuthStore();

  const [, setSavedAccount] = useState(false);
  const [, setSavedProfile] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformName | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [patModal, setPatModal] = useState<{
    platform: PlatformName;
    loginUrl: string;
    tokenUrl: string;
    instructions: string;
  } | null>(null);
  const [patToken, setPatToken] = useState('');
  const [patError, setPatError] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [bio, setBio] = useState('');
  const [experience, setExperience] = useState('');
  const [hourlyRate, setHourlyRate] = useState(30);
  const [skills, setSkills] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);

  const [profileDesc, setProfileDesc] = useState('');
  const [reviewPlatform, setReviewPlatform] = useState('Upwork');
  const [reviewResult, setReviewResult] = useState<ProfileReview | null>(null);

  const savedSnapshotRef = useRef({
    name: user?.name ?? '',
    timezone: user?.timezone ?? 'UTC',
    bio: '',
    experience: '',
    hourlyRate: 30,
    skills: [] as string[],
    platforms: [] as string[],
  });
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const { data: profileData } = useQuery({ queryKey: ['user-profile'], queryFn: usersApi.getProfile });
  const { data: pastReviews = [] } = useQuery({ queryKey: ['profile-reviews'], queryFn: aiApi.getProfileReviews });
  const { data: connectionStatus } = useQuery({
    queryKey: ['platform-connections-status'],
    queryFn: connectionsApi.status,
    refetchInterval: connectingPlatform ? 3000 : false,
  });

  const connectedPlatformsCount = Number(Boolean(connectionStatus?.upwork)) + Number(Boolean(connectionStatus?.freelancer));

  useEffect(() => {
    if (!profileData) return;

    const next = {
      name: profileData.name ?? '',
      timezone: profileData.timezone ?? 'UTC',
      bio: profileData.profile?.bio ?? '',
      experience: profileData.profile?.experience ?? '',
      hourlyRate: profileData.profile?.hourlyRate ?? 30,
      skills: profileData.profile?.skills ?? [],
      platforms: profileData.profile?.platforms ?? [],
    };

    setName(next.name);
    setTimezone(next.timezone);
    setBio(next.bio);
    setExperience(next.experience);
    setHourlyRate(next.hourlyRate);
    setSkills(next.skills);
    setPlatforms(next.platforms);
    savedSnapshotRef.current = next;
  }, [profileData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const connectError = params.get('connectError');

    if (connected) {
      setNotice({ type: 'success', message: `${connected} account connected successfully!` });
      qc.invalidateQueries({ queryKey: ['platform-connections-status'] });
    }
    if (connectError) {
      setNotice({ type: 'error', message: `Could not connect ${connectError}. Please try again.` });
    }
    if (connected || connectError) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [qc]);

  const accountMutation = useMutation({
    mutationFn: () => usersApi.updateProfile({ name, timezone }),
    onSuccess: (data) => {
      updateUser({ name: data.name, timezone: data.timezone });
      qc.invalidateQueries({ queryKey: ['user-profile'] });
      setSavedAccount(true);
      setTimeout(() => setSavedAccount(false), 2000);
    },
  });

  const profileMutation = useMutation({
    mutationFn: () => usersApi.updateProfile({ bio, experience, hourlyRate, skills, platforms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-profile'] });
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () => aiApi.profileReview({ profileDescription: profileDesc, platform: reviewPlatform }),
    onSuccess: (data) => {
      setReviewResult(data);
      qc.invalidateQueries({ queryKey: ['profile-reviews'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (platform: PlatformName) => connectionsApi.disconnect(platform),
    onSuccess: (_, platform) => {
      setNotice({ type: 'success', message: `${platform} disconnected.` });
      qc.invalidateQueries({ queryKey: ['platform-connections-status'] });
    },
    onSettled: () => setConnectingPlatform(null),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => usersApi.deleteAccount(),
    onSuccess: () => {
      setDeleteModalOpen(false);
      setDeleteConfirm('');
      logout();
      qc.clear();
      navigate('/login');
    },
    onError: (err) => {
      setNotice({ type: 'error', message: getApiErrorMessage(err, 'Failed to delete account') });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: (data) => {
      updateUser({ avatarUrl: data.avatarUrl });
      qc.invalidateQueries({ queryKey: ['user-profile'] });
      setNotice({ type: 'success', message: 'Profile photo updated successfully' });
    },
    onError: (err) => {
      setNotice({ type: 'error', message: getApiErrorMessage(err, 'Failed to upload profile photo') });
    },
  });

  async function startConnect(platform: PlatformName) {
    setConnectingPlatform(platform);
    setNotice(null);
    try {
      const result = await connectionsApi.browserConnect(platform);
      const label = result.username ? ` as @${result.username}` : '';
      setNotice({ type: 'success', message: `${platform} connected${label}!` });
      qc.invalidateQueries({ queryKey: ['platform-connections-status'] });
    } catch (err) {
      const msg = getApiErrorMessage(err, `Could not connect ${platform}. Make sure the scraper is running.`);
      setNotice({ type: 'error', message: msg });
    } finally {
      setConnectingPlatform(null);
    }
  }

  async function submitPAT() {
    if (!patModal || !patToken.trim()) return;
    setConnectingPlatform(patModal.platform);
    setPatError('');
    try {
      const result = await connectionsApi.submitToken(patModal.platform, patToken.trim());
      const label = result.username ? ` as @${result.username}` : '';
      setNotice({ type: 'success', message: `${patModal.platform} connected${label}!` });
      qc.invalidateQueries({ queryKey: ['platform-connections-status'] });
      setPatModal(null);
      setPatToken('');
    } catch (err) {
      setPatError(getApiErrorMessage(err, 'Invalid token. Please check and try again.'));
    } finally {
      setConnectingPlatform(null);
    }
  }

  function toggleSkill(skill: string) {
    setSkills((current) => (current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]));
  }

  function addCustomSkill() {
    const skill = skillInput.trim();
    if (skill && !skills.includes(skill)) setSkills((current) => [...current, skill]);
    setSkillInput('');
  }

  function togglePlatform(platform: string) {
    setPlatforms((current) => (current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]));
  }

  async function handleSaveAll() {
    setNotice(null);

    const [accountResult, profileResult] = await Promise.allSettled([
      accountMutation.mutateAsync(),
      profileMutation.mutateAsync(),
    ]);

    const failure = [accountResult, profileResult].find((result) => result.status === 'rejected');
    if (failure && failure.status === 'rejected') {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(failure.reason, 'Failed to save profile'),
      });
      return;
    }

    savedSnapshotRef.current = { name, timezone, bio, experience, hourlyRate, skills, platforms };
    setNotice({ type: 'success', message: 'Profile saved successfully' });
  }

  function handleDiscard() {
    const snapshot = savedSnapshotRef.current;
    setName(snapshot.name);
    setTimezone(snapshot.timezone);
    setBio(snapshot.bio);
    setExperience(snapshot.experience);
    setHourlyRate(snapshot.hourlyRate);
    setSkills(snapshot.skills);
    setPlatforms(snapshot.platforms);
    setNotice({ type: 'success', message: 'Changes discarded' });
  }

  function openDeleteModal() {
    setDeleteConfirm('');
    setDeleteModalOpen(true);
  }

  function triggerAvatarPicker() {
    avatarInputRef.current?.click();
  }

  async function handleAvatarSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setNotice({ type: 'error', message: 'Please choose a JPG or PNG image.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ type: 'error', message: 'Profile photo must be 5MB or smaller.' });
      return;
    }

    await uploadAvatarMutation.mutateAsync(file);
  }

  const completion = calculateProfileCompletion(
    { ...user, timezone, avatarUrl: user?.avatarUrl },
    {
      bio,
      experience,
      hourlyRate,
      skills,
      platforms,
    },
    connectedPlatformsCount,
  );

  const deleteConfirmReady = deleteConfirm.trim().toUpperCase() === 'DELETE';

  return (
    <div className="page-shell-tight">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">Profile</h1>
        <p className="mt-0.5 text-slate-500">Manage your account and professional profile</p>
      </div>

      {notice && (
        <div
          className={clsx(
            'mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700',
          )}
        >
          {notice.type === 'success'
            ? <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />
            : <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />}
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} className="ml-auto opacity-50 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <section className="px-6 py-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-5">
              <button
                type="button"
                onClick={triggerAvatarPicker}
                disabled={uploadAvatarMutation.isPending}
                className="group relative flex h-[108px] w-[108px] flex-shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed"
                title="Change photo"
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name ?? 'Profile avatar'}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  <span className="text-4xl font-bold text-primary">
                    {user?.name?.charAt(0).toUpperCase() ?? '?'}
                  </span>
                )}

                <span className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/10" />

                <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-slate-900/80 text-white shadow-lg">
                  {uploadAvatarMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Camera size={14} />
                  )}
                </span>

                <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Change photo
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-[-0.03em] text-dark">
                    {name || user?.name || 'Profile'}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Available for work
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {completion}% Profile Complete
                  </span>
                </div>

                <p className="mt-1 text-base text-slate-600">
                  {bio?.trim() ? bio.trim() : 'Add a bio to describe your expertise and what you are available for.'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-slate-400" />
                    {timezone}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock3 size={14} className="text-slate-400" />
                    Last synced with your workspace data
                  </span>
                </div>
              </div>
            </div>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarSelected}
          />
        </section>

        <div className="border-t border-slate-200" />

        <section className="px-6 py-6 lg:px-8">
          <SectionTitle
            icon={User}
            title="Account Information"
            description="Update your core account details. Save Changes applies everything at once."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <FieldLabel>Full Name</FieldLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="Your name"
              />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input
                value={user?.email ?? ''}
                disabled
                className="input cursor-not-allowed bg-slate-50 text-slate-400"
              />
            </div>
            <div>
              <FieldLabel>Timezone</FieldLabel>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input">
                {POPULAR_TZ.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
        </section>

        <div className="border-t border-slate-200" />

        <section className="px-6 py-6 lg:px-8">
          <SectionTitle
            icon={Link2}
            title="Connected Accounts"
            description="Connect your freelancer platforms to enable authenticated project discovery and proposal submission."
          />

          <div className="space-y-3">
            <PlatformCard
              platform="upwork"
              color="#14A800"
              initial="U"
              label="Upwork"
              connection={connectionStatus?.connections.upwork ?? null}
              loading={connectingPlatform === 'upwork' || (disconnectMutation.isPending && disconnectMutation.variables === 'upwork')}
              onConnect={() => startConnect('upwork')}
              onDisconnect={() => { setConnectingPlatform('upwork'); disconnectMutation.mutate('upwork'); }}
              onReconnect={() => startConnect('upwork')}
            />

            <PlatformCard
              platform="freelancer"
              color="#29B2FE"
              initial="F"
              label="Freelancer.com"
              connection={connectionStatus?.connections.freelancer ?? null}
              loading={connectingPlatform === 'freelancer' || (disconnectMutation.isPending && disconnectMutation.variables === 'freelancer')}
              onConnect={() => startConnect('freelancer')}
              onDisconnect={() => { setConnectingPlatform('freelancer'); disconnectMutation.mutate('freelancer'); }}
              onReconnect={() => startConnect('freelancer')}
            />
          </div>

          {connectingPlatform && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">
              <Loader2 size={11} className="animate-spin" />
              A browser window has opened on your machine. Please log in to {connectingPlatform}. This may take a few minutes.
            </p>
          )}

          <div className="mt-4 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="flex items-center gap-1.5 font-medium text-slate-600">
              <ExternalLink size={11} /> How it works
            </p>
            <p>Clicking Connect opens a browser window on your machine with the platform login page.</p>
            <p>Log in normally, including any CAPTCHA or 2FA. Once login is detected, your session is saved automatically.</p>
          </div>
        </section>

        <div className="border-t border-slate-200" />

        <section className="px-6 py-6 lg:px-8">
          <SectionTitle
            icon={Briefcase}
            title="Professional Profile"
            description="Keep your bio, experience, pricing, and target platforms in one place."
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <div>
                <FieldLabel>Bio / Summary</FieldLabel>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={5}
                  className="input resize-none"
                  placeholder="Write a short professional summary that highlights your expertise..."
                />
              </div>

              <div>
                <FieldLabel>Experience Summary</FieldLabel>
                <textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  rows={4}
                  className="input resize-none"
                  placeholder="e.g. 5 years in React, 3 years in Node.js, built 20+ client projects..."
                />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <FieldLabel>Hourly Rate (USD)</FieldLabel>
                <input
                  type="number"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  min={1}
                  className="input w-40"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-slate-200" />

        <section className="px-6 py-6 lg:px-8">
          <SectionTitle
            icon={ShieldAlert}
            title="Skills and Target Platforms"
            description="Use chips to keep your skills focused and your target marketplaces explicit."
          />

          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Your Skills</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className="badge badge-blue gap-1"
                  >
                    {skill} <X size={10} />
                  </button>
                ))}
              </div>
              <div className="mb-3 flex gap-2">
                <input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomSkill();
                    }
                  }}
                  className="input flex-1"
                  placeholder="Add custom skill..."
                />
                <button type="button" onClick={addCustomSkill} className="btn-secondary px-3 text-xs">
                  Add
                </button>
              </div>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {TECH_SKILLS.filter((skill) => !skills.includes(skill)).map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className="badge badge-gray cursor-pointer text-xs transition-colors hover:badge-blue"
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Suggested Skills</p>
              <div className="flex flex-wrap gap-2">
                {TECH_SKILLS.slice(0, 12).map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={clsx(
                      'rounded-lg border px-3 py-1.5 text-sm transition-all',
                      skills.includes(skill)
                        ? 'border-primary bg-primary text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50',
                    )}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Target Platforms</p>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => togglePlatform(platform)}
                    className={clsx(
                      'rounded-lg border px-3 py-1.5 text-sm transition-all',
                      platforms.includes(platform)
                        ? 'border-primary bg-primary text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50',
                    )}
                  >
                    {platform}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-slate-200" />

        <section className="px-6 py-6 lg:px-8">
          <SectionTitle
            icon={Brain}
            title="AI Profile Review"
            description="Paste a profile description to get a score and improvement tips."
          />

          <div className="space-y-4">
            <div>
              <FieldLabel>Platform</FieldLabel>
              <select
                value={reviewPlatform}
                onChange={(e) => setReviewPlatform(e.target.value)}
                className="input w-48"
              >
                {PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}
              </select>
            </div>

            <div>
              <FieldLabel>Profile Description</FieldLabel>
              <textarea
                value={profileDesc}
                onChange={(e) => setProfileDesc(e.target.value)}
                rows={6}
                className="input resize-none"
                placeholder="Paste your profile headline, bio, skills section, etc. from your freelancer profile..."
              />
            </div>

            <button
              onClick={() => reviewMutation.mutate()}
              disabled={!profileDesc || reviewMutation.isPending}
              className="btn-primary"
            >
              {reviewMutation.isPending
                ? <><RefreshCw size={14} className="animate-spin" /> Analyzing...</>
                : <><Brain size={14} /> Analyze Profile</>}
            </button>
          </div>

          {reviewResult && (
            <div className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4">
              <div className="py-2 text-center">
                <div
                  className={clsx(
                    'text-4xl font-bold',
                    reviewResult.overallScore >= 70 ? 'text-success' : reviewResult.overallScore >= 40 ? 'text-warning' : 'text-danger',
                  )}
                >
                  {reviewResult.overallScore}<span className="text-xl text-slate-400">/100</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">Profile Strength Score</p>
              </div>

              <div className="space-y-2">
                {Object.entries(reviewResult.dimensionScores).map(([dim, score]) => (
                  <div key={dim}>
                    <div className="mb-1 flex justify-between text-xs text-slate-600">
                      <span className="font-medium capitalize">{dim}</span>
                      <span className="font-semibold">{score}/20</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={clsx('h-full rounded-full', score >= 15 ? 'bg-success' : score >= 8 ? 'bg-warning' : 'bg-danger')}
                        style={{ width: `${(score / 20) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <TrendingUp size={12} /> Top Improvements
                </p>
                <div className="space-y-2">
                  {reviewResult.improvements.map((imp, index) => (
                    <div key={index} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                      <span className={clsx('badge flex-shrink-0 mt-0.5', IMPACT_CLASSES[imp.expectedImpact])}>
                        {imp.expectedImpact}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-dark">{imp.action}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          ~{imp.estimatedDays} day{imp.estimatedDays !== 1 ? 's' : ''} to implement
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {pastReviews.length > 0 && !reviewResult && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Previous Reviews</p>
              <div className="space-y-2">
                {(pastReviews as ProfileReview[]).slice(0, 3).map((review) => (
                  <div key={review.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                    <div>
                      <p
                        className={clsx(
                          'text-lg font-bold',
                          review.overallScore >= 70 ? 'text-success' : review.overallScore >= 40 ? 'text-warning' : 'text-danger',
                        )}
                      >
                        {review.overallScore}/100
                      </p>
                      <p className="text-xs text-slate-400">{new Date(review.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{review.improvements.length} improvements</p>
                      <p className="text-xs text-slate-400">suggested</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <button
            type="button"
            onClick={openDeleteModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            <Trash2 size={14} /> Delete Account
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              className="btn-secondary"
            >
              <RotateCcw size={14} /> Discard Changes
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAll()}
              disabled={accountMutation.isPending || profileMutation.isPending}
              className="btn-primary"
            >
              {(accountMutation.isPending || profileMutation.isPending)
                ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                : <><Save size={14} /> Save Changes</>}
            </button>
          </div>
        </section>
      </div>

      {patModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-dark">
                <Key size={16} className="text-primary" />
                Connect {patModal.platform === 'upwork' ? 'Upwork' : 'Freelancer.com'}
              </h3>
              <button onClick={() => setPatModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="mb-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-dark">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  1
                </span>
                Log in to {patModal.platform === 'upwork' ? 'Upwork' : 'Freelancer.com'}
              </p>
              <a
                href={patModal.loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <ExternalLink size={14} />
                Open {patModal.platform === 'upwork' ? 'Upwork' : 'Freelancer.com'} login page
                <ArrowRight size={14} className="ml-auto" />
              </a>
            </div>

            <div className="mb-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-dark">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  2
                </span>
                Get your API / Access Token
              </p>
              <a
                href={patModal.tokenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 transition-colors hover:border-primary/30 hover:text-primary"
              >
                <Key size={12} />
                {patModal.instructions}
                <ArrowRight size={12} className="ml-auto" />
              </a>
            </div>

            <div className="mb-5">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-dark">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  3
                </span>
                Paste your token below
              </p>
              <input
                value={patToken}
                onChange={(e) => setPatToken(e.target.value)}
                className="input font-mono text-sm"
                placeholder="Paste access token here..."
                autoComplete="off"
              />
              {patError && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-danger">
                  <AlertTriangle size={11} /> {patError}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPatModal(null)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submitPAT}
                disabled={!patToken.trim() || connectingPlatform === patModal.platform}
                className="btn-primary flex-1 justify-center disabled:opacity-50"
              >
                {connectingPlatform === patModal.platform
                  ? <><Loader2 size={14} className="animate-spin" /> Verifying...</>
                  : <><Check size={14} /> Connect</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600">
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-dark">Delete account</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Are you sure you want to delete your account? This action cannot be undone.
                </p>
              </div>
              <button onClick={() => setDeleteModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                Type <strong>DELETE</strong> to confirm permanent deletion.
              </p>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="input mt-3 border-red-200 focus:border-danger focus:ring-danger/30"
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAccountMutation.mutate()}
                disabled={!deleteConfirmReady || deleteAccountMutation.isPending}
                className="flex-1 rounded-lg border border-red-200 bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteAccountMutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Deleting...</>
                  : <><Trash2 size={14} /> Delete Permanently</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
