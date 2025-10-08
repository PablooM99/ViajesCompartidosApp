import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db, app } from "../firebase/config";
import { getFunctions, httpsCallable } from "firebase/functions";

export default function MyRules({ uid }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    const q = query(collection(db, "rules"), where("ownerUid", "==", uid), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [uid]);

  const regen = async (ruleId) => {
    const fn = httpsCallable(getFunctions(app), "generateForRuleId");
    const { data } = await fn({ ruleId, horizonDays: 30 });
    alert(`Generados: ${data.created}`);
  };

  if (!uid) return null;

  return (
    <div className="bg-white rounded-2xl p-3 border">
      <div className="font-medium mb-2">Mis reglas</div>
      {loading && <div className="text-sm text-neutral-500">Cargando…</div>}
      <ul className="space-y-2 text-sm">
        {rows.map(r => (
          <li key={r.id} className="border rounded-xl p-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{r.originId} → {r.destinationId} • {r.time}</div>
                <div className="text-neutral-500">$ {r.price} • {r.seats} lugares • días: {r.weekdays.join(',')}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => regen(r.id)} className="rounded-2xl bg-vc_primary px-3 py-1">Generar 30 días</button>
              </div>
            </div>
          </li>
        ))}
        {!loading && rows.length === 0 && <li className="text-neutral-500">Sin reglas aún.</li>}
      </ul>
    </div>
  );
}
