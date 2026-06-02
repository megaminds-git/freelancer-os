/**
 * Firebase Web Push Notifications
 *
 * Set these env vars in apps/web/.env:
 *   VITE_FIREBASE_API_KEY=
 *   VITE_FIREBASE_AUTH_DOMAIN=
 *   VITE_FIREBASE_PROJECT_ID=
 *   VITE_FIREBASE_STORAGE_BUCKET=
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=
 *   VITE_FIREBASE_APP_ID=
 *   VITE_FIREBASE_VAPID_KEY=
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { api } from './api';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.apiKey && !!VAPID_KEY;
}

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

function getFirebaseMessaging(): Messaging | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!messaging) {
    messaging = getMessaging(app);
  }
  return messaging;
}

/**
 * Request push notification permission and register the FCM token with the backend.
 * Call this after the user logs in.
 */
export async function registerPushNotifications(): Promise<boolean> {
  const m = getFirebaseMessaging();
  if (!m) {
    console.info('[FCM] Firebase not configured — push notifications disabled');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.info('[FCM] Notification permission denied');
      return false;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

    if (!token) return false;

    await api.post('/notifications/token', { token, platform: 'web' });
    console.info('[FCM] Push token registered');
    return true;
  } catch (err) {
    console.warn('[FCM] Registration failed:', err);
    return false;
  }
}

/**
 * Listen for foreground messages (app is open).
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(
  callback: (title: string, body: string, data?: Record<string, string>) => void,
): () => void {
  const m = getFirebaseMessaging();
  if (!m) return () => {};

  return onMessage(m, (payload) => {
    const title = payload.notification?.title ?? 'Freelancer OS';
    const body = payload.notification?.body ?? '';
    const data = payload.data as Record<string, string> | undefined;
    callback(title, body, data);
  });
}
