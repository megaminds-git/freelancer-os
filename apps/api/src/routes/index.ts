import authRouter from './auth';
import usersRouter from './users';
import templatesRouter from './templates';
import proposalsRouter from './proposals';
import aiRouter from './ai';
import alertsRouter from './alerts';
import recordsRouter from './records';
import analyticsRouter from './analytics';
import scraperRouter from './scraper';
import notificationsRouter from './notifications';
import connectionsRouter from './connections';

export default {
  auth: authRouter,
  users: usersRouter,
  templates: templatesRouter,
  proposals: proposalsRouter,
  ai: aiRouter,
  alerts: alertsRouter,
  records: recordsRouter,
  analytics: analyticsRouter,
  scraper: scraperRouter,
  notifications: notificationsRouter,
  connections: connectionsRouter,
};
