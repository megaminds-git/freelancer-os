import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { errorHandler, notFound } from './middleware/errorHandler';
import router from './routes';

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting — general (only failed requests count toward the limit)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Strict limiter for security-sensitive endpoints: login, signup, refresh
// skipSuccessfulRequests ensures normal logins don't eat into the quota
const strictAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many auth requests, please try again later.' },
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes — strict rate limit on security-sensitive auth endpoints only.
// /auth/me, /auth/logout, /auth/extension-token only hit the general limiter above.
app.use('/api/v1/auth/login',   strictAuthLimiter);
app.use('/api/v1/auth/signup',  strictAuthLimiter);
app.use('/api/v1/auth/refresh', strictAuthLimiter);
app.use('/api/v1/auth', router.auth);
app.use('/api/v1/users', router.users);
app.use('/api/v1/templates', router.templates);
app.use('/api/v1/proposals', router.proposals);
app.use('/api/v1/ai', router.ai);
app.use('/api/v1/alerts', router.alerts);
app.use('/api/v1/records', router.records);
app.use('/api/v1/analytics', router.analytics);
app.use('/api/v1/scraper', router.scraper);
app.use('/api/v1/notifications', router.notifications);
app.use('/api/v1/connections', router.connections);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
