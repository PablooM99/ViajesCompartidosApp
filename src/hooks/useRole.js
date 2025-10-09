import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export function useRole(uid) {
  const [role, setRole] = useState("traveler");
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid)).then(s => {
      setRole(s.exists() ? (s.data().role || "traveler") : "traveler");
    });
  }, [uid]);
  const canPublish = role === "driver" || role === "admin";
  return { role, canPublish };
}
