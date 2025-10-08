import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function useDriverRating(driverUid) {
  const [avg, setAvg] = useState(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!driverUid) return;
    (async () => {
      const snap = await getDoc(doc(db, "users", driverUid));
      if (snap.exists()) {
        const d = snap.data();
        const sum = Number(d.ratingSum || 0);
        const cnt = Number(d.ratingCount || 0);
        setCount(cnt);
        setAvg(cnt > 0 ? (sum / cnt) : null);
      } else {
        setAvg(null); setCount(0);
      }
    })();
  }, [driverUid]);

  return { avg, count };
}
