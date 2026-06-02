import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';

let firebaseApp: App | null = null;

function getFirebaseApp(): App | null {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.warn('[Firebase] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
    return null;
  }

  try {
    const parsed = JSON.parse(serviceAccount);
    firebaseApp = initializeApp({ credential: cert(parsed) });
    console.log('[Firebase] Admin SDK initialized');
    return firebaseApp;
  } catch (err) {
    console.error('[Firebase] Failed to initialize:', err);
    return null;
  }
}

export function isFirebaseEnabled(): boolean {
  return !!getFirebaseApp();
}

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export async function sendPushNotification(payload: PushPayload): Promise<boolean> {
  const app = getFirebaseApp();
  if (!app) return false;

  try {
    const message: Message = {
      token: payload.token,
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
      },
      data: payload.data,
      webpush: {
        notification: {
          title: payload.title,
          body: payload.body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          requireInteraction: false,
          data: payload.data,
        },
        fcmOptions: { link: '/' },
      },
    };

    const response = await getMessaging(app).send(message);
    console.log(`[Firebase] Notification sent: ${response}`);
    return true;
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    if (error?.code === 'messaging/registration-token-not-registered') {
      // Token is stale — caller should remove it from DB
      return false;
    }
    console.error('[Firebase] Send error:', error?.message ?? err);
    return false;
  }
}

export async function sendPushToMany(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ success: number; failed: string[] }> {
  const app = getFirebaseApp();
  if (!app || tokens.length === 0) return { success: 0, failed: [] };

  const results = await Promise.allSettled(
    tokens.map((token) => sendPushNotification({ token, title, body, data })),
  );

  const failed: string[] = [];
  let success = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      success++;
    } else {
      failed.push(tokens[i]);
    }
  });

  return { success, failed };
}
