// Firebase Cloud Messaging Service Worker
// This file must be served from the root of your domain

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config is injected at runtime via the web app
// These values are non-secret (public Firebase config)
const firebaseConfig = self.__FIREBASE_CONFIG__ || {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Handle background messages
  messaging.onBackgroundMessage((payload) => {
    const { title, body, icon } = payload.notification || {};
    const data = payload.data || {};

    self.registration.showNotification(title || 'Freelancer OS', {
      body: body || 'New notification',
      icon: icon || '/icon-192.png',
      badge: '/badge-72.png',
      data,
      requireInteraction: false,
    });
  });
}

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
