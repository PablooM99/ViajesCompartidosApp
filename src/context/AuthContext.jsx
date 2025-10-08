import { createContext, useContext, useEffect, useState } from "react";
import { auth, googleProvider, db, app } from "../firebase/config";
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  initMessaging,
  requestAndSaveFcmToken,
  attachOnMessage,
} from "../firebase/messaging";
import { useToast } from "./ToastContext";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  // Envolvemos el Toast por si no está montado aún
  const toast = (() => {
    try {
      return useToast();
    } catch {
      return null;
    }
  })();
  const success = toast?.success;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Capturar resultado del redirect (opcional, útil para loguear errores)
  useEffect(() => {
    getRedirectResult(auth).catch((e) => {
      if (e) console.warn("Redirect login warn:", e.message);
    });
  }, []);

  // Mantener sesión + asegurar doc de usuario
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          const ref = doc(db, "users", u.uid);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            await setDoc(
              ref,
              {
                uid: u.uid,
                displayName: u.displayName || "",
                photoURL: u.photoURL || "",
                role: "traveler",
                createdAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
          setUser(u);
        } else {
          setUser(null);
        }
      } catch (e) {
        console.error("Auth bootstrap failed:", e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Push (FCM): registrar SW, pedir token y escuchar mensajes en primer plano
  useEffect(() => {
    (async () => {
      if (!user) return;

      // 1) Inicializar soporte de Messaging (si el navegador lo permite)
      const messaging = await initMessaging(app).catch(() => null);
      if (!messaging) return;

      // 2) Registrar el Service Worker ANTES de pedir el token
      try {
        if ("serviceWorker" in navigator) {
          const existing = await navigator.serviceWorker.getRegistration("/");
          if (!existing) {
            await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
              scope: "/",
            });
          }
        } else {
          console.warn("ServiceWorker no soportado en este navegador.");
          return;
        }
      } catch (swErr) {
        console.error("SW register failed:", swErr);
        return;
      }

      // 3) Pedir permiso y guardar token en Firestore
      try {
        const token = await requestAndSaveFcmToken({ app, uid: user.uid });
        if (token && success) success("Notificaciones activadas");
      } catch (tokErr) {
        console.warn("Error obteniendo token FCM:", tokErr);
      }

      // 4) Mensajes en primer plano → mostrar toast
      attachOnMessage(app, {
        onMessageReceived: (payload) => {
          const title = payload?.notification?.title || "ViajesCompartidos";
          const body = payload?.notification?.body || "";
          success?.(`${title}: ${body}`);
        },
      });
    })();
  }, [user]);

  // Login por redirect (evita el warning de COOP del popup)
  const login = () => signInWithRedirect(auth, googleProvider);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
