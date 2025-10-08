import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db, app } from "../firebase/config";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useToast } from "../context/ToastContext";

export default function TripBookings({ tripId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const { success, error } = useToast();

  const load = async () => {
    setLoading(true);
    const q = query(collection(db, `trips/${tripId}/bookings`), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { if (tripId) load(); /* eslint-disable-next-line */ }, [tripId]);

  const cancelAsDriver = async (bookingId) => {
    if (!confirm("¿Cancelar esta reserva? Se notificará al pasajero.")) return;
    setBusy(bookingId);
    try {
      const fn = httpsCallable(getFunctions(app), "cancelBookingAsDriver");
      await fn({ tripId, bookingId });
      await load(); success("Reserva cancelada");
    } catch (e) {
      error(e.message || "No se pudo cancelar");
    } finally { setBusy(null); }
  };

  return (
    <div className="mt-2 border rounded-xl p-2 bg-white">
      {loading ? <div className="text-sm text-neutral-500">Cargando…</div> :
        (rows.length === 0 ? <div className="text-sm text-neutral-500">Sin reservas.</div> :
          <ul className="space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between border rounded-xl p-2">
                <span>{r.seats} lugar(es) • pasajero: {r.uid}</span>
                <button onClick={() => cancelAsDriver(r.id)} disabled={busy === r.id}
                        className="rounded-xl border px-3 py-1">
                  {busy === r.id ? 'Cancelando…' : 'Cancelar'}
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
