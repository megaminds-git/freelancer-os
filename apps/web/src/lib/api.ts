import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.error;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Token refresh helpers ─────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// Singleton in-flight refresh promise — prevents parallel 401s each calling /refresh
let pendingRefresh: Promise<{ accessToken: string; refreshToken: string }> | null = null;

async function doTokenRefresh(): Promise<{ accessToken: string; refreshToken: string }> {
  const { refreshToken, setTokens } = useAuthStore.getState();

  if (!refreshToken) {
    useAuthStore.getState().logout();
    redirectToLogin();
    throw new Error('No refresh token');
  }

  const attempt = async () => {
    const res = await axios.post('/api/v1/auth/refresh', { refreshToken });
    setTokens(res.data.accessToken, res.data.refreshToken);
    return res.data as { accessToken: string; refreshToken: string };
  };

  try {
    return await attempt();
  } catch (err) {
    // If the refresh endpoint itself is rate-limited, wait and retry once
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      const retryAfter = parseInt(err.response.headers['retry-after'] || '3', 10);
      await sleep(Math.max(retryAfter, 2) * 1000);
      try { return await attempt(); } catch { /* fall through to logout */ }
    }
    useAuthStore.getState().logout();
    redirectToLogin();
    throw err;
  } finally {
    pendingRefresh = null;
  }
}

// ── Response interceptor ──────────────────────────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status   = error.response?.status;
    const url: string = original?.url ?? '';

    // 429 Too Many Requests: replay once only for non-auth idempotent requests.
    const method = String(original?.method || 'get').toLowerCase();
    const isAuthCall = url.includes('/auth/');
    const canRetry429 = method === 'get' && !isAuthCall;
    if (status === 429 && !original._retry429 && canRetry429) {
      original._retry429 = true;
      const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '3', 10);
      await sleep(Math.max(retryAfter, 2) * 1000);
      return api(original);
    }

    // 401 Unauthorized: attempt one token refresh, then replay the original request.
    // Skip if this request IS the refresh / login / signup (prevents infinite loop).
    if (status === 401 && !original._retry) {
      original._retry = true;

      const isPublicAuthCall =
        url.includes('/auth/refresh') ||
        url.includes('/auth/login')   ||
        url.includes('/auth/signup')  ||
        url.includes('/auth/verify-email') ||
        url.includes('/auth/resend-otp') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/verify-reset-otp') ||
        url.includes('/auth/reset-password');

      if (isPublicAuthCall) {
        useAuthStore.getState().logout();
        redirectToLogin(url);
        return Promise.reject(error);
      }

      try {
        // Reuse any in-flight refresh so N parallel 401s only call /refresh once
        if (!pendingRefresh) pendingRefresh = doTokenRefresh();
        const { accessToken } = await pendingRefresh;
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        // doTokenRefresh already called logout + redirect
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

function redirectToLogin(requestUrl?: string): void {
  const isAuthRequest = typeof requestUrl === 'string' && requestUrl.includes('/auth/');
  if (!isAuthRequest && window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  signup: (data: { email: string; password: string; name: string }) =>
    api.post('/auth/signup', data).then(r => r.data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me:     () => api.get('/auth/me').then(r => r.data),
  verifyEmail: (data: { email: string; otp: string }) =>
    api.post('/auth/verify-email', data).then(r => r.data),
  resendOtp: (data: { email: string; purpose: 'verify' | 'reset' }) =>
    api.post('/auth/resend-otp', data).then(r => r.data),
  forgotPassword: (data: { email: string }) =>
    api.post('/auth/forgot-password', data).then(r => r.data),
  verifyResetOtp: (data: { email: string; otp: string }) =>
    api.post('/auth/verify-reset-otp', data).then(r => r.data),
  resetPassword: (data: { resetToken: string; newPassword: string }) =>
    api.post('/auth/reset-password', data).then(r => r.data),
  /** Generate a 30-day token for use in the Freelancer OS Chrome Extension. */
  extensionToken: () =>
    api.post<{ extensionToken: string; expiresIn: string }>('/auth/extension-token').then(r => r.data),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  getProfile: () => api.get('/users/profile').then(r => r.data),
  updateProfile: (data: Record<string, unknown>) => api.put('/users/profile', data).then(r => r.data),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  getStats: () => api.get('/users/stats').then(r => r.data),
  deleteAccount: () => api.delete('/users/me').then(r => r.data),
};

// ── Proposals ─────────────────────────────────────────────────────────────────
export const proposalsApi = {
  list: (params?: Record<string, unknown>) => api.get('/proposals', { params }).then(r => r.data),
  create: (data: Record<string, unknown>) => api.post('/proposals', data).then(r => r.data),
  get: (id: string) => api.get(`/proposals/${id}`).then(r => r.data),
  updateStatus: (id: string, status: string) => api.put(`/proposals/${id}/status`, { status }).then(r => r.data),
  saveReference: (id: string) => api.post(`/proposals/${id}/save-reference`).then(r => r.data),
  delete: (id: string) => api.delete(`/proposals/${id}`).then(r => r.data),
  references: () => api.get('/proposals/references').then(r => r.data),
  exportCsv: () => api.get('/proposals/export/csv', { responseType: 'blob' }),
};

// ── Templates ─────────────────────────────────────────────────────────────────
export const templatesApi = {
  listComponents: (type?: string) => api.get('/templates/components', { params: type ? { type } : {} }).then(r => r.data),
  createComponent: (data: Record<string, unknown>) => api.post('/templates/components', data).then(r => r.data),
  updateComponent: (id: string, data: Record<string, unknown>) => api.put(`/templates/components/${id}`, data).then(r => r.data),
  deleteComponent: (id: string) => api.delete(`/templates/components/${id}`).then(r => r.data),
  list: () => api.get('/templates').then(r => r.data),
  create: (data: Record<string, unknown>) => api.post('/templates', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/templates/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/templates/${id}`).then(r => r.data),
};

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiApi = {
  analyze: (data: Record<string, unknown>) => api.post('/ai/analyze', data).then(r => r.data),
  generateProposal: (data: Record<string, unknown>) => api.post('/ai/generate-proposal', data).then(r => r.data),
  profileReview: (data: Record<string, unknown>) => api.post('/ai/profile-review', data).then(r => r.data),
  getAnalyses: () => api.get('/ai/analyses').then(r => r.data),
  getProfileReviews: () => api.get('/ai/profile-reviews').then(r => r.data),
};

// ── Alerts ────────────────────────────────────────────────────────────────────
export const alertsApi = {
  getConfig: () => api.get('/alerts/config').then(r => r.data),
  saveConfig: (data: Record<string, unknown>) => api.put('/alerts/config', data).then(r => r.data),
  getTimezones: () => api.get('/alerts/timezones').then(r => r.data),
  getSchedule: () => api.get('/alerts/schedule').then(r => r.data),
};

// ── Records ───────────────────────────────────────────────────────────────────
export const recordsApi = {
  list: (params?: Record<string, unknown>) => api.get('/records', { params }).then(r => r.data),
  getStats: () => api.get('/records/stats').then(r => r.data),
  exportCsv: () => api.get('/records/export/csv', { responseType: 'blob' }),
};

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsApi = {
  getDashboard: () => api.get('/analytics/dashboard').then(r => r.data),
  getTimeline: (days?: number) => api.get('/analytics/timeline', { params: { days } }).then(r => r.data),
  getHeatmap: () => api.get('/analytics/heatmap').then(r => r.data),
  getActivityCalendar: (month?: string) => api.get('/analytics/activity-calendar', { params: { month } }).then(r => r.data),
  getLiveFeed: () => api.get('/analytics/live-feed').then(r => r.data),
};

// ── Scraper ───────────────────────────────────────────────────────────────────
export const scraperApi = {
  search:               (data: Record<string, unknown>, noCache = false) =>
    api.post(`/scraper/search${noCache ? '?noCache=1' : ''}`, data).then(r => r.data),
  status:               () => api.get('/scraper/status').then(r => r.data),
  saveProject:          (data: Record<string, unknown>) => api.post('/scraper/save', data).then(r => r.data),
  getSaved:             () => api.get('/scraper/saved').then(r => r.data),
  deleteSaved:          (id: string) => api.delete(`/scraper/saved/${id}`).then(r => r.data),
  /** Poll for projects scraped by the Chrome extension (cached in Redis). */
  getExtensionResults: (query: string, platform: string) =>
    api.get('/scraper/extension-results', { params: { query, platform } }).then(r => r.data),
  /** Bust cached extension + scraper results for a query (called on Refresh). */
  deleteExtensionResults: (query: string, platform: string) =>
    api.delete('/scraper/extension-results', { params: { query, platform } }).then(r => r.data),
  /** Get extension auto-scrape run log + projects for Automation page. */
  getAutoResults: () =>
    api.get('/scraper/auto-results').then(r => r.data),
  /** Clear Redis auto-results cache for the current user (called by Clear All). */
  clearResults: () =>
    api.delete('/scraper/clear-results').then(r => r.data),
};

// ── Platform Connections (OAuth) ──────────────────────────────────────────────
export type PlatformName = 'upwork' | 'freelancer';

export interface PlatformConnectionInfo {
  platform: PlatformName;
  connectedAt: string;
  expiresAt: string | null;
  email: string | null;
  externalId: string | null;
  expired: boolean;
}

export interface ConnectionStatusResponse {
  upwork: boolean;
  freelancer: boolean;
  connections: {
    upwork:     PlatformConnectionInfo | null;
    freelancer: PlatformConnectionInfo | null;
  };
}

export const connectionsApi = {
  /** Returns connected status + metadata for all platforms. */
  status: () =>
    api.get<ConnectionStatusResponse>('/connections/status').then(r => r.data),

  /**
   * Starts OAuth flow for the given platform.
   * Returns the authorizeUrl the user should be redirected / popup-opened to.
   */
  start: (platform: PlatformName) =>
    api
      .post<{ platform: PlatformName; authorizeUrl: string }>(`/connections/${platform}/start`)
      .then(r => r.data),

  /** Refreshes an expired access token using the stored refresh token. */
  refresh: (platform: PlatformName) =>
    api.post<{ success: boolean; platform: PlatformName }>(`/connections/${platform}/refresh`).then(r => r.data),

  /** Removes the stored connection for a platform. */
  disconnect: (platform: PlatformName) =>
    api.delete<{ success: boolean; platform: PlatformName }>(`/connections/${platform}`).then(r => r.data),

  /** Submits a Personal Access Token for a platform (no OAuth app needed). */
  submitToken: (platform: PlatformName, token: string) =>
    api.post<{ success: boolean; platform: PlatformName; username: string | null; email: string | null }>(
      `/connections/${platform}/token`,
      { token },
    ).then(r => r.data),

  /** Returns whether OAuth is configured + PAT info URLs for a platform. */
  getOAuthConfig: (platform: PlatformName) =>
    api.get<{ platform: PlatformName; configured: boolean; patInfo: { loginUrl: string; tokenUrl: string; instructions: string } }>(
      `/connections/oauth-config/${platform}`,
    ).then(r => r.data),

  /**
   * Opens a real Chromium browser window on the server (via scraper service).
   * Kept for backwards-compat; not used in the primary UI flow.
   */
  browserConnect: (platform: PlatformName) =>
    api.post<{ success: boolean; platform: PlatformName; username: string | null; email: string | null }>(
      `/connections/${platform}/browser-connect`,
      {},
      { timeout: 360_000 },
    ).then(r => r.data),
};
