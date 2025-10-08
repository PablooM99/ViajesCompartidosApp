import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export async function initMessaging(app) {
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  try {
    const messaging = getMessaging(app);
    return messaging;
  } catch {
    return null;
  }
}

export async function requestAndSaveFcmToken({ app, uid, userAgent = navigator.userAgent }) {
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  const messaging = getMessaging(app);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const swr = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swr });
  if (!token) return null;

  const ref = doc(db, "users", uid);
  await setDoc(ref, {
    fcmTokens: {
      [token]: { updatedAt: serverTimestamp(), ua: userAgent }
    }
  }, { merge: true });

  return token;
}

export function attachOnMessage(app, { onMessageReceived }) {
  isSupported().then((ok) => {
    if (!ok) return;
    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      onMessageReceived?.(payload);
    });
  });
}
