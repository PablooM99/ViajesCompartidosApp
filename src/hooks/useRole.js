import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Hook de rol del usuario.
 * - role: "traveler" | "driver" | "admin" (default "traveler" si no hay dato)
 * - isAdmin: boolean
 * - isDriver: boolean
 * - canPublish: boolean (driver o admin)
 * - loading: indica si está resolviendo el rol
 */
export function useRole(uid) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Si no hay uid, resetea y no escucha nada
    if (!uid) {
      setRole(null);
      setLoading(false);
      return;
    }

    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const r = snap.exists() ? snap.data()?.role : null;
        setRole(r || "traveler");
        setLoading(false);
      },
      () => {
        // En error, bajamos a traveler por defecto
        setRole("traveler");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  const effectiveRole = role || "traveler";
  const isAdmin = effectiveRole === "admin";
  const isDriver = effectiveRole === "driver";
  const canPublish = isAdmin || isDriver;

  return { role: effectiveRole, isAdmin, isDriver, canPublish, loading };
}

export default useRole;
