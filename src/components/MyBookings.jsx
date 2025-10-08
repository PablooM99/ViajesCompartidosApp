import { useEffect, useState } from "react";
import { collectionGroup, getDocs, query, where, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import dayjs from "dayjs";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/functions"; // <- usa región correcta
import { useToast } from "../context/ToastContext";
import ReviewModal from "./ReviewModal";

function extractIds(path) {
  const parts = String(path).split("/");
  return { tripId: parts[1], bookingId: parts[3] };
}

export default function MyBookings({ uid, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const { success, error } = useToast();

  const [revOpen, setRevOpen] = useState(false);
  const [revTrip, setRevTrip] = useState(null);

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const q = query(
        collectionGroup(db, "bookings"),
        where("uid", "==", uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const base = snap.docs.map((d) => ({ id: d.id, ...d.data(), _path: d.ref.path }));
      const withTrip = await Promise.all(
        base.map(async (r) => {
          const { tripId } = extractIds(r._path);
          const tSnap = await getDoc(doc(db, "trips", tripId));
          return { ...r, _tripId: tripId, trip: tSnap.exists() ? tSnap.data() : null };
        })
      );
      setRows(withTrip);
    } catch (e) {
      console.error("MyBookings query failed:", e);
      setLoadErr(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [uid]);

  const cancel = async (row) => {
    const { tripId, bookingId } = extractIds(row._path);
    if (!confirm("¿Cancelar esta reserva?")) return;
    setBusyId(row.id);
    try {
      const fn = httpsCallable(functions, "cancelBooking"); // <- usa helper con región
      await fn({ tripId, bookingId });
      await load();
      onChanged?.();
      success("Reserva cancelada");
    } catch (e) {
      console.error(e);
      error(e.message || "No se pudo cancelar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-3 border">
      <div className="font-medium mb-2">Mis reservas</div>

      {loading && <div className="text-sm text-neutral-500">Cargando…</div>}
      {loadErr && <div className="text-sm text-red-600">No se pudieron cargar tus reservas.</div>}

      <ul className="space-y-2 text-sm">
        {rows.map((r) => {
          const trip = r.trip;
          const when = trip?.datetime?.seconds
            ? dayjs(trip.datetime.seconds * 1000).format("DD/MM HH:mm")
            : trip?.datetime ? dayjs(trip.datetime).format("DD/MM HH:mm") : "";
          const total = (trip?.price || 0) * (r.seats || 0);
          const isPast = trip?.datetime?.seconds
            ? trip.datetime.seconds * 1000 < Date.now()
            : trip?.datetime ? new Date(trip.datetime).getTime() < Date.now() : false;

          return (
            <li key={r.id} className="border rounded-xl p-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{trip?.originId} → {trip?.destinationId}</div>
                  <div className="text-neutral-500">
                    {when} • ${trip?.price} x {r.seats} = <span className="font-medium">${total}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => cancel(r)} disabled={busyId === r.id} className="rounded-xl border px-3 py-1">
                    {busyId === r.id ? "Cancelando…" : "Cancelar"}
                  </button>
                  <button
                    onClick={() => { setRevTrip({ ...trip, id: r._tripId, origin: {label: trip.originId}, destination: {label: trip.destinationId} }); setRevOpen(true); }}
                    className="rounded-xl border px-3 py-1"
                    disabled={!isPast}
                    title={!isPast ? "Calificable al finalizar el viaje" : ""}
                  >
                    Calificar
                  </button>
                </div>
              </div>
            </li>
          );
        })}
        {!loading && !loadErr && rows.length === 0 && (
          <li className="text-neutral-500">Sin reservas aún.</li>
        )}
      </ul>

      <ReviewModal open={revOpen} onClose={() => setRevOpen(false)} trip={revTrip}
        onDone={() => { load(); onChanged?.(); }} />
    </div>
  );
}
