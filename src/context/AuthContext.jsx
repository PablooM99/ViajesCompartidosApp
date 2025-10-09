// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db, googleProvider } from "../firebase/config";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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

  // Suscripción principal al estado de auth
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

  // Login: intenta POPUP y solo cae a REDIRECT si el popup es bloqueado
  const login = async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, googleProvider);
      // si el popup funcionó, no hay redirect ni polling extra
    } catch (e) {
      // Fallback solo para bloqueos/restricciones de popup
      const code = e?.code || "";
      const popupIssues = [
        "auth/popup-blocked",
        "auth/popup-closed-by-user",
        "auth/cancelled-popup-request",
        "auth/internal-error", // algunos navegadores lo usan cuando bloquean
      ];
      if (popupIssues.includes(code)) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        console.warn("Popup login error:", code, e?.message);
        // si querés, mostrás un toast de error aquí
      }
    }
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
