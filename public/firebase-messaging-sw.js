/* public/firebase-messaging-sw.js */
/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

/**
 * IMPORTANTÍSIMO:
 * - Usá tu config REAL (al menos estos 4 campos).
 * - No uses ESM (no "import {...} from ..."), en SW clásico es con importScripts.
 */
firebase.initializeApp({
  apiKey: "AIzaSyAn7zRJ1i5kKPLyZ1jemiy0Jvzr1-nygiE",
  projectId: "viajes-compartidos-9ec7a",
  appId: "1:900322524151:web:ebc9aaabb2d42c3f2f8cf2",
  messagingSenderId: "900322524151"
});

const messaging = firebase.messaging();

// Notificaciones cuando la web está en background
messaging.onBackgroundMessage(({ notification } = {}) => {
  const title = notification?.title || "ViajesCompartidos";
  const body = notification?.body || "";
  const icon = notification?.icon || "/icon-192.png";
  const click_action = notification?.click_action || "/";
  self.registration.showNotification(title, { body, icon, data: { click_action } });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.click_action || "/";
  event.waitUntil(self.clients.openWindow(url));
});
