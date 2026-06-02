export interface ProfileCompletionUser {
  name?: string | null;
  email?: string | null;
  timezone?: string | null;
  avatarUrl?: string | null;
}

export interface ProfileCompletionProfile {
  bio?: string | null;
  experience?: string | null;
  hourlyRate?: number | null;
  skills?: string[] | null;
  platforms?: string[] | null;
}

export function calculateProfileCompletion(
  user: ProfileCompletionUser | null | undefined,
  profile: ProfileCompletionProfile | null | undefined,
  connectedPlatforms = 0,
): number {
  const score = [
    user?.name?.trim() ? 10 : 0,
    user?.email?.trim() ? 5 : 0,
    user?.timezone && user.timezone !== 'UTC' ? 5 : 0,
    user?.avatarUrl ? 15 : 0,
    (profile?.bio?.trim().length ?? 0) >= 20 ? 15 : 0,
    (profile?.experience?.trim().length ?? 0) >= 20 ? 10 : 0,
    (profile?.hourlyRate ?? 0) > 0 ? 5 : 0,
    (profile?.skills?.length ?? 0) >= 3 ? 15 : 0,
    (profile?.platforms?.length ?? 0) >= 1 ? 10 : 0,
    connectedPlatforms >= 1 ? 10 : 0,
  ].reduce((total, part) => total + part, 0);

  return Math.max(0, Math.min(100, score));
}
