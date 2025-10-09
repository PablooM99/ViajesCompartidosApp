import { createContext, useContext, useEffect, useState } from "react";
import { auth, db, googleProvider } from "../firebase/config";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// (Opcional) si no usas FCM, puedes quitar estas importaciones
// import { initMessaging, requestAndSaveFcmToken, attachOnMessage } from "../firebase/messaging";
import { useToast } from "./ToastContext";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const { success } = (() => {
    try {
      return useToast();
    } catch {
      return {};
    }
  })();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Persistencia local antes de cualquier intento de login
  useEffect(() => {
    (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (e) {
        console.warn("No se pudo setear browserLocalPersistence:", e?.message);
      }
    })();
  }, []);

  // Resultado del redirect (si lo hubo)
  useEffect(() => {
    getRedirectResult(auth).catch((e) => {
      if (e) console.warn("Redirect warn:", e.message);
    });
  }, []);

  // Suscripción principal
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          // Asegura documento del usuario
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
        if (u) setUser(u);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Login: intenta popup; si el navegador lo bloquea, cae a redirect
  const login = async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      await signInWithRedirect(auth, googleProvider);
    }
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
