import cron from 'node-cron';
import prisma from '../lib/prisma';

export function startExpiryJob() {
  // Run every day at 00:00 UTC
  cron.schedule('0 0 * * *', async () => {
    console.log('[Expiry Job] Running proposal expiry cleanup...');
    try {
      const now = new Date();

      const deleted = await prisma.proposal.deleteMany({
        where: {
          isReference: false,
          expiresAt: { lt: now },
        },
      });

      const deletedFiles = await prisma.file.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      console.log(`[Expiry Job] Deleted ${deleted.count} proposals, ${deletedFiles.count} files`);
    } catch (err) {
      console.error('[Expiry Job] Error:', err);
    }
  });

  console.log('[Expiry Job] Scheduled — runs daily at 00:00 UTC');
}
