import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, where, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import dayjs from "dayjs";
import { useToast } from "../context/ToastContext";

// util consistente con RuleForm
function tripIdFor({ ownerUid, date, time, originId, destinationId }) {
  return [ownerUid, date, time, originId, destinationId].join("__");
}

export default function MyRules({ uid }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const { success, error } = useToast();

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    const qy = query(collection(db, "rules"), where("ownerUid", "==", uid), orderBy("updatedAt", "desc"));
    const snap = await getDocs(qy);
    setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [uid]);

  async function generateTripsFromRule(ruleDoc) {
    const { ownerUid, originId, destinationId, time, price, seats, vehiclePhotoURL } = ruleDoc;
  
    const start = dayjs(ruleDoc.startDate, "YYYY-MM-DD");
    const endFromRule = ruleDoc.endDate ? dayjs(ruleDoc.endDate, "YYYY-MM-DD") : start.add(30, "day");
    const hardLimit = start.add(30, "day");
    const until = endFromRule.isBefore(hardLimit) ? endFromRule : hardLimit;
  
    let created = 0;
    for (let d = start; d.isBefore(until.add(1, "day")); d = d.add(1, "day")) {
      if (!Array.isArray(ruleDoc.weekdays) || !ruleDoc.weekdays.includes(d.day())) continue;
  
      const dateStr = d.format("YYYY-MM-DD");
      const [hh, mm] = String(time).split(":").map(n => parseInt(n, 10));
      const dt = d.hour(hh || 0).minute(mm || 0).second(0).millisecond(0);
  
      const payload = {
        ownerUid,
        originId,
        destinationId,
        date: dateStr,
        datetime: dt.toDate(),
        price: Number(price),
        seatsAvailable: Number(seats),
        seats: Number(seats),
        vehiclePhotoURL: vehiclePhotoURL || "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
  
      const tid = tripIdFor({ ownerUid, date: dateStr, time, originId, destinationId });
      const tref = doc(db, "trips", tid);
  
      const snap = await getDoc(tref);
      if (!snap.exists()) {
        await setDoc(tref, payload);
        created++;
      }
    }
    return created;
  }
  

  const regen = async (ruleId) => {
    try {
      setBusy(ruleId);
      const rref = doc(db, "rules", ruleId);
      const rsnap = await getDoc(rref);
      if (!rsnap.exists()) return error("La regla ya no existe");
      const data = rsnap.data();

      const created = await generateTripsFromRule(data);
      success(`Viajes generados: ${created}`);
    } catch (e) {
      console.error(e);
      error(e?.message || "No se pudo generar");
    } finally {
      setBusy(null);
    }
  };

  const removeRule = async (ruleId) => {
    if (!confirm("¿Eliminar esta regla? Esto no borra viajes ya generados.")) return;
    try {
      setBusy(ruleId);
      await deleteDoc(doc(db, "rules", ruleId));
      success("Regla eliminada");
      await load();
    } catch (e) {
      console.error(e);
      error(e?.message || "No se pudo eliminar la regla");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-3 border">
      <div className="font-medium mb-2">Mis reglas</div>
      {loading && <div className="text-sm text-neutral-500">Cargando…</div>}
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.id} className="border rounded-xl p-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-medium">{r.originId} → {r.destinationId} • {r.time}</div>
                <div className="text-neutral-500 text-sm">
                  ${r.price} • {r.seats} lugares • días: {Array.isArray(r.weekdays) ? r.weekdays.join(",") : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => regen(r.id)}
                  disabled={busy === r.id}
                  className="rounded-2xl bg-vc_primary px-3 py-1 disabled:opacity-50"
                >
                  {busy === r.id ? "Generando…" : "Generar 30 días"}
                </button>
                <button
                  onClick={() => removeRule(r.id)}
                  disabled={busy === r.id}
                  className="rounded-2xl border px-3 py-1 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </li>
        ))}
        {!loading && rows.length === 0 && <li className="text-neutral-500">Sin reglas aún.</li>}
      </ul>
    </div>
  );
}
