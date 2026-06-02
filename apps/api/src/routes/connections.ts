/**
 * Platform connection routes — DB-only OAuth config, no .env secrets.
 *
 * OAuth app settings are loaded entirely from the `OAuthAppConfig` DB table.
 * Each authenticated user's platform credentials are stored in `PlatformConnection`.
 */

import { Router, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { encrypt, decrypt, encryptIfNeeded } from '../lib/encryption';

type Platform = 'upwork' | 'freelancer';

interface OAuthConfig {
  platformName: Platform;
  clientId: string;
  clientSecret: string;
  oauthBaseUrl: string;
  tokenUrl: string;
  redirectBaseUrl: string;
  scopes: string[];
  isActive: boolean;
  userInfoUrl?: string;
}

interface OAuthStatePayload {
  userId: string;
  platform: Platform;
  type: 'platform_connect';
  webBase: string;
}

// Platform-specific help URLs shown in the UI
export const PAT_URLS: Record<Platform, { loginUrl: string; tokenUrl: string; instructions: string }> = {
  freelancer: {
    loginUrl:     'https://www.freelancer.com/login',
    tokenUrl:     'https://accounts.freelancer.com/settings/create-app',
    instructions: 'Create an app → copy the OAuth Token',
  },
  upwork: {
    loginUrl:     'https://www.upwork.com/ab/account-security/login',
    tokenUrl:     'https://www.upwork.com/developer/keys',
    instructions: 'Register an app → copy the Access Token',
  },
};

const router: Router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePlatform(v: string | string[] | undefined): Platform {
  const raw = Array.isArray(v) ? v[0] : v;
  const p = String(raw || '').toLowerCase();
  if (p !== 'upwork' && p !== 'freelancer') throw createError('Unsupported platform', 400);
  return p;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function getApiBase(req: AuthRequest): string {
  const host = req.get('host');
  if (host) return `${req.protocol}://${host}`;
  return 'http://localhost:3001';
}

function getCallbackUrl(cfg: OAuthConfig, platform: Platform, apiBase: string): string {
  const base = normalizeBaseUrl(cfg.redirectBaseUrl || apiBase);
  return `${base}/api/v1/connections/${platform}/callback`;
}

function resolveWebBase(req: AuthRequest, cfg: OAuthConfig): string {
  const origin = req.get('origin');
  if (origin) return normalizeBaseUrl(origin);
  const referer = req.get('referer');
  if (referer) {
    try { return normalizeBaseUrl(new URL(referer).origin); } catch { /* ignore */ }
  }
  return normalizeBaseUrl(cfg.redirectBaseUrl);
}

/** Load OAuth config from DB only. Throws 400 if not configured. */
async function getOAuthConfig(platform: Platform): Promise<OAuthConfig> {
  const config = await prisma.oAuthAppConfig.findFirst({
    where: { platformName: platform, isActive: true },
  });

  if (!config) {
    console.error(`[OAuth] No active config found in DB for platform: ${platform}`);
    throw createError(`OAuth is not configured for ${platform}. Add credentials to oauth_app_configs.`, 400);
  }

  const missing = (['clientId', 'clientSecret', 'oauthBaseUrl', 'tokenUrl', 'redirectBaseUrl'] as const)
    .filter(f => !config[f]?.trim());

  if (missing.length > 0) {
    console.error(`[OAuth] Config incomplete for ${platform}. Missing fields:`, missing);
    throw createError(`OAuth config for ${platform} is missing: ${missing.join(', ')}`, 400);
  }

  console.log(`[OAuth] Config loaded for ${platform}: oauthBaseUrl=${config.oauthBaseUrl}, scopes=[${config.scopes.join(',')}]`);

  return {
    platformName:    config.platformName as Platform,
    clientId:        config.clientId,
    clientSecret:    config.clientSecret,
    oauthBaseUrl:    config.oauthBaseUrl,
    tokenUrl:        config.tokenUrl,
    redirectBaseUrl: config.redirectBaseUrl,
    scopes:          config.scopes,
    isActive:        config.isActive,
    userInfoUrl:     config.userInfoUrl ?? undefined,
  };
}

/** Build the full authorization URL with all required OAuth params properly encoded. */
function buildAuthorizeUrl(cfg: OAuthConfig, platform: Platform, state: string, apiBase: string): string {
  const callbackUrl = getCallbackUrl(cfg, platform, apiBase);

  const params = new URLSearchParams();
  params.set('response_type', 'code');
  params.set('client_id', cfg.clientId);
  params.set('redirect_uri', callbackUrl);
  params.set('state', state);
  if (cfg.scopes.length > 0) {
    params.set('scope', cfg.scopes.join(' '));
  }

  const sep  = cfg.oauthBaseUrl.includes('?') ? '&' : '?';
  const full = `${cfg.oauthBaseUrl}${sep}${params.toString()}`;

  console.log(`[OAuth] Built authorize URL for ${platform}:`);
  console.log(`  base:         ${cfg.oauthBaseUrl}`);
  console.log(`  client_id:    ${cfg.clientId}`);
  console.log(`  redirect_uri: ${callbackUrl}`);
  console.log(`  scope:        ${cfg.scopes.join(' ')}`);
  console.log(`  full URL:     ${full}`);

  return full;
}

function extractUserInfo(
  data: Record<string, unknown>,
): { externalId: string | null; email: string | null; username: string | null } {
  const inner = (data.result as Record<string, unknown> | undefined) ?? data;
  return {
    externalId: String(inner.id ?? data.id ?? '').trim() || null,
    email:      String((inner.email ?? data.email ?? data.primary_email) ?? '').trim() || null,
    username:   String((inner.username ?? inner.display_name ?? inner.name ?? data.name) ?? '').trim() || null,
  };
}

/** Upsert a platform connection with encrypted tokens. */
async function upsertConnection(params: {
  userId: string;
  platform: Platform;
  accessToken: string;
  refreshToken?: string | null;
  sessionToken?: string | null;
  cookies?: string | null;
  platformUserId?: string | null;
  externalId?: string | null;
  email?: string | null;
  username?: string | null;
  scopes?: string[];
  connectedAccountStatus?: string;
  expiresAt?: Date | null;
  expiryTime?: Date | null;
}) {
  const encAccess   = encryptIfNeeded(params.accessToken);
  const encRefresh  = params.refreshToken  ? encryptIfNeeded(params.refreshToken)  : null;
  const encSession  = params.sessionToken  ? encryptIfNeeded(params.sessionToken)  : null;
  const encCookies  = params.cookies       ? encryptIfNeeded(params.cookies)       : null;
  const resolvedId  = params.platformUserId ?? params.externalId ?? params.username ?? null;
  const expiresAt   = params.expiresAt  ?? null;
  const expiryTime  = params.expiryTime ?? expiresAt;

  const connection = await prisma.platformConnection.upsert({
    where:  { userId_platform: { userId: params.userId, platform: params.platform } },
    create: {
      userId:                 params.userId,
      platform:               params.platform,
      accessToken:            encAccess,
      refreshToken:           encRefresh,
      sessionToken:           encSession,
      cookies:                encCookies,
      platformUserId:         resolvedId,
      externalId:             resolvedId,
      email:                  params.email ?? null,
      scopes:                 params.scopes ?? [],
      connectedAccountStatus: params.connectedAccountStatus ?? 'connected',
      expiresAt,
      expiryTime,
    },
    update: {
      accessToken:            encAccess,
      refreshToken:           encRefresh,
      sessionToken:           encSession,
      cookies:                encCookies,
      platformUserId:         resolvedId,
      externalId:             resolvedId,
      email:                  params.email ?? null,
      scopes:                 params.scopes ?? [],
      connectedAccountStatus: params.connectedAccountStatus ?? 'connected',
      expiresAt,
      expiryTime,
      connectedAt:            new Date(),
    },
  });

  console.log(`[DB] Upserted ${params.platform} connection for user ${params.userId}:`, {
    id:             connection.id,
    platform:       connection.platform,
    platformUserId: resolvedId,
    email:          params.email,
    status:         params.connectedAccountStatus ?? 'connected',
  });

  return connection;
}

/** Decrypt the stored access token (returns null if unavailable). */
function decryptToken(conn: { accessToken: string | null }): string | null {
  if (!conn.accessToken) return null;
  return decrypt(conn.accessToken) ?? conn.accessToken;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/v1/connections/status
router.get('/status', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);

    const connections = await prisma.platformConnection.findMany({
      where:  { userId: req.userId },
      select: {
        platform:               true,
        connectedAt:            true,
        expiresAt:              true,
        expiryTime:             true,
        email:                  true,
        externalId:             true,
        platformUserId:         true,
        connectedAccountStatus: true,
      },
    });

    const byPlatform = {
      upwork:     connections.find(c => c.platform === 'upwork')     ?? null,
      freelancer: connections.find(c => c.platform === 'freelancer') ?? null,
    };

    const now = new Date();
    const enrich = (c: typeof byPlatform.upwork) => {
      if (!c) return null;
      const expiry = c.expiryTime ?? c.expiresAt;
      return {
        platform:    c.platform,
        connectedAt: c.connectedAt,
        expiresAt:   expiry,
        email:       c.email,
        externalId:  c.platformUserId ?? c.externalId,
        status:      c.connectedAccountStatus,
        expired:     !!(expiry && expiry < now),
      };
    };

    res.json({
      upwork:     !!byPlatform.upwork && byPlatform.upwork.connectedAccountStatus === 'connected',
      freelancer: !!byPlatform.freelancer && byPlatform.freelancer.connectedAccountStatus === 'connected',
      connections: {
        upwork:     enrich(byPlatform.upwork),
        freelancer: enrich(byPlatform.freelancer),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/connections/oauth-config/:platform
router.get('/oauth-config/:platform', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const platform = parsePlatform(req.params.platform);
    let configured = false;
    try {
      await getOAuthConfig(platform);
      configured = true;
    } catch { /* not configured */ }
    res.json({ platform, configured, patInfo: PAT_URLS[platform] });
  } catch (err) { next(err); }
});

// POST /api/v1/connections/:platform/start
router.post('/:platform/start', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);
    const platform = parsePlatform(req.params.platform);
    const cfg      = await getOAuthConfig(platform);
    const apiBase  = getApiBase(req);

    const secret = process.env.JWT_SECRET;
    if (!secret) throw createError('JWT_SECRET is not configured on the server', 500);

    const webBase = resolveWebBase(req, cfg);
    const state = jwt.sign(
      { userId: req.userId, platform, type: 'platform_connect', webBase } satisfies OAuthStatePayload,
      secret,
      { expiresIn: '15m' },
    );

    const authorizeUrl = buildAuthorizeUrl(cfg, platform, state, apiBase);
    console.log(`[OAuth] /start → user=${req.userId}, platform=${platform}, callback=${getCallbackUrl(cfg, platform, apiBase)}`);

    res.json({ platform, authorizeUrl });
  } catch (err) { next(err); }
});

// GET /api/v1/connections/:platform/callback
router.get('/:platform/callback', async (req: AuthRequest, res: Response) => {
  const rawPlatform = String(req.params.platform ?? '').toLowerCase();
  const safe = (rawPlatform === 'upwork' || rawPlatform === 'freelancer') ? rawPlatform : 'unknown';
  let webBase = '';

  try {
    const platform = parsePlatform(req.params.platform);
    const apiBase  = getApiBase(req);
    const code     = String(req.query.code  ?? '');
    const state    = String(req.query.state ?? '');
    const errParam = String(req.query.error ?? '');

    const cfg = await getOAuthConfig(platform);
    const fallbackWebBase = resolveWebBase(req, cfg);
    webBase = fallbackWebBase;

    if (errParam) {
      console.warn(`[OAuth] Callback error from ${platform}: ${errParam}`);
      return res.redirect(`${fallbackWebBase}/oauth-callback?connectError=${platform}&reason=${encodeURIComponent(errParam)}`);
    }
    if (!code || !state) {
      console.warn(`[OAuth] Missing code/state for ${platform}`, { code: !!code, state: !!state });
      return res.redirect(`${fallbackWebBase}/oauth-callback?connectError=${platform}&reason=missing_code`);
    }

    const secret  = process.env.JWT_SECRET!;
    const decoded = jwt.verify(state, secret) as OAuthStatePayload;
    webBase = normalizeBaseUrl(decoded.webBase || fallbackWebBase);

    if (decoded.type !== 'platform_connect' || decoded.platform !== platform) {
      console.warn(`[OAuth] Invalid state payload for ${platform}`, decoded);
      return res.redirect(`${webBase}/oauth-callback?connectError=${platform}&reason=invalid_state`);
    }

    const callbackUrl = getCallbackUrl(cfg, platform, apiBase);
    console.log(`[OAuth] Exchanging code for ${platform} token, redirect_uri=${callbackUrl}`);

    const tokenBody = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri:  callbackUrl,
    });

    const tokenResp = await axios.post(cfg.tokenUrl, tokenBody.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20_000,
    });

    console.log(`[OAuth] Token exchange response [${platform}]:`, {
      status:     tokenResp.status,
      hasAccess:  !!tokenResp.data?.access_token,
      hasRefresh: !!tokenResp.data?.refresh_token,
      expiresIn:  tokenResp.data?.expires_in,
    });

    const accessToken  = tokenResp.data?.access_token  as string | undefined;
    const refreshToken = tokenResp.data?.refresh_token as string | undefined;
    const expiresIn    = Number(tokenResp.data?.expires_in ?? 0);

    if (!accessToken) {
      console.error(`[OAuth] No access_token in response for ${platform}:`, tokenResp.data);
      return res.redirect(`${webBase}/oauth-callback?connectError=${platform}&reason=token_exchange_failed`);
    }

    let externalId: string | null = null;
    let email:      string | null = null;
    let username:   string | null = null;

    if (cfg.userInfoUrl) {
      try {
        const userResp = await axios.get(cfg.userInfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15_000,
        });
        const info = extractUserInfo(userResp.data ?? {});
        externalId = info.externalId;
        email      = info.email;
        username   = info.username;
        console.log(`[OAuth] User info for ${platform}:`, { externalId, email, username });
      } catch (infoErr) {
        console.warn(`[OAuth] Could not fetch user info for ${platform} (non-fatal):`, infoErr);
      }
    }

    await upsertConnection({
      userId:                 decoded.userId,
      platform,
      accessToken,
      refreshToken:           refreshToken ?? null,
      platformUserId:         externalId,
      externalId,
      email,
      username,
      scopes:                 cfg.scopes,
      connectedAccountStatus: 'connected',
      expiresAt:              expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    });

    console.log(`[OAuth] ✓ ${platform} connected for user=${decoded.userId}. Redirecting to UI.`);
    return res.redirect(`${webBase}/oauth-callback?connected=${platform}`);

  } catch (err) {
    console.error(`[OAuth] Callback failed for ${safe}:`, err);
    const dest = webBase || (req.protocol && req.get('host') ? `${req.protocol}://${req.get('host')}` : '');
    return res.redirect(`${dest}/oauth-callback?connectError=${safe}&reason=server_error`);
  }
});

// POST /api/v1/connections/:platform/token — Personal Access Token
router.post('/:platform/token', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);
    const platform = parsePlatform(req.params.platform);
    const { token } = req.body as { token?: string };

    if (!token || typeof token !== 'string' || token.trim().length < 10) {
      throw createError('A valid token is required (minimum 10 characters)', 400);
    }

    const raw = token.trim();
    let username:   string | null = null;
    let email:      string | null = null;
    let externalId: string | null = null;

    if (platform === 'freelancer') {
      try {
        const resp = await axios.get(
          'https://www.freelancer.com/api/users/0.1/self/?compact=true',
          { headers: { Authorization: `Bearer ${raw}` }, timeout: 12_000 },
        );
        if (resp.data?.status !== 'success') {
          throw createError('Freelancer token is invalid or has insufficient permissions', 400);
        }
        const info = extractUserInfo(resp.data);
        username   = info.username;
        email      = info.email;
        externalId = info.externalId;
      } catch (axErr) {
        if (axios.isAxiosError(axErr) && axErr.response?.status === 401) {
          throw createError('Freelancer token is invalid. Please generate a new token.', 400);
        }
        if (axios.isAxiosError(axErr)) {
          throw createError('Could not verify token with Freelancer. Check your internet connection.', 400);
        }
        throw axErr;
      }
    } else {
      if (raw.length < 20) throw createError('Upwork token appears too short. Please paste the full token.', 400);
    }

    await upsertConnection({
      userId: req.userId, platform,
      accessToken:            raw,
      refreshToken:           null,
      platformUserId:         externalId,
      externalId,
      email,
      username,
      scopes:                 [],
      connectedAccountStatus: 'connected',
      expiresAt:              null,
    });

    res.json({ success: true, platform, username, email });
  } catch (err) { next(err); }
});

// POST /api/v1/connections/:platform/browser-connect
// Accepts cookies either from the Chrome extension (req.body.cookies array) or by
// opening a real Chromium browser on the scraper machine for manual login.
router.post('/:platform/browser-connect', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);
    const platform = parsePlatform(req.params.platform);

    // ── Extension fast-path: cookies sent directly from the Chrome extension ──
    if (Array.isArray(req.body.cookies) && req.body.cookies.length > 0) {
      const cookiesStr = JSON.stringify(req.body.cookies);
      await upsertConnection({
        userId:                 req.userId,
        platform,
        accessToken:            `ext-session-${Date.now()}`,
        refreshToken:           null,
        sessionToken:           null,
        cookies:                cookiesStr,
        platformUserId:         null,
        externalId:             null,
        email:                  null,
        username:               null,
        scopes:                 [],
        connectedAccountStatus: 'connected',
        expiresAt:              null,
        expiryTime:             null,
      });
      console.log(`[browser-connect] ✓ ${platform} connected via extension cookies — user=${req.userId} cookies=${req.body.cookies.length}`);
      return res.json({ success: true, platform, username: null, email: null, source: 'extension' });
    }

    // ── Scraper-service path: open a Chromium window on the scraper machine ──
    const scraperUrl = (process.env.SCRAPER_URL || 'http://localhost:8001').replace(/\/+$/, '');

    console.log(`[browser-connect] starting ${platform} for user ${req.userId}`);

    let scraperData: {
      success: boolean;
      username?: string | null;
      email?: string | null;
      cookies?: unknown;
    };

    try {
      const scraperResp = await axios.post(
        `${scraperUrl}/auth/browser-connect/${platform}`,
        {},
        { timeout: 360_000 },
      );
      scraperData = scraperResp.data;
    } catch (axErr) {
      if (axios.isAxiosError(axErr)) {
        if (axErr.code === 'ECONNABORTED') throw createError('Browser login timed out. Please try again.', 504);
        if (axErr.code === 'ECONNREFUSED' || axErr.code === 'ENOTFOUND') {
          throw createError('Scraper service is not reachable. Make sure it is running on port 8001.', 503);
        }
        const detail = (axErr.response?.data as { detail?: string } | undefined)?.detail;
        throw createError(detail || `Browser connect failed for ${platform}`, axErr.response?.status ?? 502);
      }
      throw axErr;
    }

    if (!scraperData.success) throw createError(`Browser login was not completed for ${platform}`, 400);

    const cookiesStr = scraperData.cookies
      ? (typeof scraperData.cookies === 'string' ? scraperData.cookies : JSON.stringify(scraperData.cookies))
      : null;

    await upsertConnection({
      userId:                 req.userId,
      platform,
      accessToken:            cookiesStr || `browser-session-${Date.now()}`,
      refreshToken:           null,
      sessionToken:           null,
      cookies:                cookiesStr,
      platformUserId:         scraperData.username ?? null,
      externalId:             scraperData.username ?? null,
      email:                  scraperData.email ?? null,
      username:               scraperData.username ?? null,
      scopes:                 [],
      connectedAccountStatus: 'connected',
      expiresAt:              null,
      expiryTime:             null,
    });

    console.log(`[browser-connect] ✓ ${platform} connected — user=${req.userId} username=${scraperData.username ?? '(unknown)'}`);

    res.json({ success: true, platform, username: scraperData.username ?? null, email: scraperData.email ?? null });
  } catch (err) { next(err); }
});

// POST /api/v1/connections/:platform/refresh
router.post('/:platform/refresh', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);
    const platform = parsePlatform(req.params.platform);

    const conn = await prisma.platformConnection.findUnique({
      where: { userId_platform: { userId: req.userId, platform } },
    });
    if (!conn) throw createError(`${platform} is not connected`, 404);

    const storedRefresh = conn.refreshToken ? (decrypt(conn.refreshToken) ?? conn.refreshToken) : null;
    if (!storedRefresh) throw createError(`No refresh token stored for ${platform}. Please reconnect.`, 400);

    const cfg = await getOAuthConfig(platform);
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: storedRefresh,
      client_id:     cfg.clientId,
      client_secret: cfg.clientSecret,
    });

    const tokenResp = await axios.post(cfg.tokenUrl, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20_000,
    });

    const accessToken  = tokenResp.data?.access_token  as string | undefined;
    const refreshToken = tokenResp.data?.refresh_token as string | undefined;
    const expiresIn    = Number(tokenResp.data?.expires_in ?? 0);
    if (!accessToken) throw createError('Token refresh failed', 400);

    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;

    await prisma.platformConnection.update({
      where: { userId_platform: { userId: req.userId, platform } },
      data: {
        accessToken:            encrypt(accessToken),
        refreshToken:           refreshToken ? encrypt(refreshToken) : conn.refreshToken,
        expiresAt,
        expiryTime:             expiresAt,
        scopes:                 cfg.scopes,
        connectedAccountStatus: 'connected',
      },
    });

    console.log(`[OAuth] Refreshed ${platform} token for user ${req.userId}`);
    res.json({ success: true, platform });
  } catch (err) { next(err); }
});

// GET /api/v1/connections/:platform/token — returns decrypted token for scraper
router.get('/:platform/token', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);
    const platform = parsePlatform(req.params.platform);

    const conn = await prisma.platformConnection.findUnique({
      where: { userId_platform: { userId: req.userId, platform } },
    });
    if (!conn) throw createError('Not connected', 404);

    const token = decryptToken(conn);
    if (!token) throw createError('Could not decrypt stored token', 500);

    res.json({ token, platform });
  } catch (err) { next(err); }
});

// GET /api/v1/connections/:platform/cookies-internal — internal use by scraper service only
// Requires X-Internal-Key header matching INTERNAL_SERVICE_KEY env var.
// Returns decrypted cookies array so the scraper can make authenticated requests.
router.get('/:platform/cookies-internal', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const internalKey = process.env.INTERNAL_SERVICE_KEY;
    const provided = req.headers['x-internal-key'];
    if (!internalKey || provided !== internalKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const platform = parsePlatform(req.params.platform);
    const { userId } = req.query as { userId?: string };
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    const conn = await prisma.platformConnection.findUnique({
      where: { userId_platform: { userId, platform } },
      select: { cookies: true },
    });
    if (!conn?.cookies) {
      res.json({ cookies: [] });
      return;
    }
    const decrypted = decrypt(conn.cookies) ?? conn.cookies;
    let cookies: unknown[] = [];
    try { cookies = JSON.parse(decrypted); } catch { cookies = []; }
    res.json({ cookies: Array.isArray(cookies) ? cookies : [] });
  } catch (err) { next(err); }
});

// DELETE /api/v1/connections/:platform
router.delete('/:platform', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw createError('Unauthorized', 401);
    const platform = parsePlatform(req.params.platform);
    await prisma.platformConnection.deleteMany({ where: { userId: req.userId, platform } });
    console.log(`[OAuth] Disconnected ${platform} for user ${req.userId}`);
    res.json({ success: true, platform });
  } catch (err) { next(err); }
});

export default router;
