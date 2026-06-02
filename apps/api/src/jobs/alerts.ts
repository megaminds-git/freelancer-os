import cron from 'node-cron';
import prisma from '../lib/prisma';
import { COUNTRIES_TIMEZONES } from '@freelancer-os/shared';
import { sendPushToMany, isFirebaseEnabled } from '../lib/firebase';

// Convert country timezone to UTC cron expression for 08:45 local time
function getUTCCronForCountry(country: string): string {
  const tz = COUNTRIES_TIMEZONES[country];
  if (!tz) return '45 8 * * 1-5';

  const testDate = new Date();
  testDate.setUTCHours(0, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  for (let utcHour = 0; utcHour < 24; utcHour++) {
    testDate.setUTCHours(utcHour, 45, 0, 0);
    const parts = formatter.formatToParts(testDate);
    const localHour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    if (localHour === 8) return `45 ${utcHour} * * 1-5`;
  }

  return '45 8 * * 1-5';
}

const scheduledJobs = new Map<string, ReturnType<typeof cron.schedule>>();

async function scheduleCountryAlerts() {
  scheduledJobs.forEach((job) => job.destroy());
  scheduledJobs.clear();

  const countries = Object.keys(COUNTRIES_TIMEZONES);

  for (const country of countries) {
    const cronExp = getUTCCronForCountry(country);

    const job = cron.schedule(cronExp, async () => {
      const configs = await prisma.alertConfig.findMany({
        where: { enabled: true, countries: { has: country } },
        include: { user: true },
      });

      if (configs.length === 0) return;

      const now = new Date();
      const hour = now.getUTCHours();

      for (const config of configs) {
        if (hour < config.activeHoursStart || hour > config.activeHoursEnd) continue;

        console.log(`[Alert] Notifying user ${config.user.email} → ${country}`);

        // Log event
        await prisma.analyticsEvent.create({
          data: {
            userId: config.userId,
            eventType: 'alert_sent',
            metadata: { country, timezone: COUNTRIES_TIMEZONES[country] },
          },
        });

        // Send FCM push if Firebase is configured
        if (isFirebaseEnabled()) {
          const fcmTokens = await prisma.fcmToken.findMany({
            where: { userId: config.userId },
            select: { token: true },
          }).catch(() => [] as { token: string }[]); // table may not exist yet

          if (fcmTokens.length > 0) {
            const tokens = fcmTokens.map((t) => t.token);
            const { failed } = await sendPushToMany(
              tokens,
              `${country} Projects Active`,
              `It's peak bidding time for ${country} clients. Check new projects now!`,
              { country, type: 'timezone_alert' },
            );

            // Remove stale tokens
            if (failed.length > 0) {
              await prisma.fcmToken.deleteMany({
                where: { userId: config.userId, token: { in: failed } },
              }).catch(() => null);
            }
          }
        }
      }
    });

    scheduledJobs.set(country, job);
  }

  console.log(`[Alert Jobs] Scheduled ${countries.length} timezone-based alert jobs`);
}

export function startAlertJobs() {
  scheduleCountryAlerts();
  // Refresh every hour to pick up new configs
  cron.schedule('0 * * * *', scheduleCountryAlerts);
}
