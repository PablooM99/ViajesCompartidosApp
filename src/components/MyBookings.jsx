import { useEffect, useState } from "react";
import { collectionGroup, getDocs, query, where, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import dayjs from "dayjs";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/config";
import { useToast } from "../context/ToastContext";
import { Link, useNavigate } from "react-router-dom";
import ReceiptUploadModal from "./ReceiptUploadModal";

function extractIds(path) {
  const parts = String(path).split("/");
  return { tripId: parts[1], bookingId: parts[3] };
}

export default function MyBookings({ uid, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const { success, error } = useToast();

  const [payOpen, setPayOpen] = useState(false);
  const [payInfo, setPayInfo] = useState({ tripId: null, bookingId: null });

  const load = async () => {
    if (!uid) return;
    setLoading(true);
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
          const trip = tSnap.exists() ? tSnap.data() : null;

          // fetch perfil del chofer para alias (opcional)
          let driver = null;
          if (trip?.ownerUid) {
            const uSnap = await getDoc(doc(db, "users", trip.ownerUid));
            driver = uSnap.exists() ? uSnap.data() : null;
          }

          return { ...r, _tripId: tripId, trip, driver };
        })
      );

      setRows(withTrip);
    } catch (e) {
      console.error("MyBookings query failed:", e);
      error("No se pudieron cargar tus reservas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const cancel = async (row) => {
    const { tripId, bookingId } = extractIds(row._path);
    if (!confirm("¿Cancelar esta reserva?")) return;
    setBusyId(row.id);
    try {
      const fn = httpsCallable(functions, "cancelBooking");
      await fn({ tripId, bookingId });
      await load();
      onChanged?.();
      success("Reserva cancelada");
    } catch (e) {
      error(e.message || "No se pudo cancelar");
    } finally {
      setBusyId(null);
    }
  };

  const openPayment = (row) => {
    const { tripId, bookingId } = extractIds(row._path);
    setPayInfo({ tripId, bookingId });
    setPayOpen(true);
  };

  const navigate = useNavigate();
  const startChat = (driverUid) => {
    if (!driverUid) return;
    navigate(`/mensajes?to=${driverUid}`);
  };

  return (
    <div className="bg-white rounded-2xl p-3 border">
      <div className="font-medium mb-2">Mis reservas</div>
      {loading && <div className="text-sm text-neutral-500">Cargando…</div>}
      <ul className="space-y-2 text-sm">
        {rows.map((r) => {
          const trip = r.trip;
          const when = trip?.datetime?.seconds
            ? dayjs(trip.datetime.seconds * 1000).format("DD/MM HH:mm")
            : trip?.datetime
            ? dayjs(trip.datetime).format("DD/MM HH:mm")
            : "";
          const total = (trip?.price || 0) * (r.seats || 0);
          const isPast = trip?.datetime?.seconds
            ? (trip.datetime.seconds * 1000) < Date.now()
            : (trip?.datetime ? (new Date(trip.datetime).getTime() < Date.now()) : false);

          return (
            <li key={r.id} className="border rounded-xl p-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium">
                    {trip?.originId} → {trip?.destinationId}
                  </div>
                  <div className="text-neutral-500">
                    {when} • ${trip?.price} x {r.seats} = <span className="font-medium">${total}</span>
                  </div>
                  {r.driver?.paymentAlias && (
                    <div className="text-xs text-neutral-600 mt-1">
                      Alias del chofer: <b>{r.driver.paymentAlias}</b>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startChat(trip?.ownerUid)}
                    className="rounded-xl border px-3 py-1"
                  >
                    Mensaje
                  </button>
                  <button
                    onClick={() => openPayment(r)}
                    className="rounded-xl border px-3 py-1"
                  >
                    Subir comprobante
                  </button>
                  <button
                    onClick={() => cancel(r)}
                    disabled={busyId === r.id}
                    className="rounded-xl border px-3 py-1"
                  >
                    {busyId === r.id ? "Cancelando…" : "Cancelar"}
                  </button>
                  <button
                    onClick={() => { /* tu flujo de calificar existente */ }}
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
        {!loading && rows.length === 0 && (
          <li className="text-neutral-500">Sin reservas aún.</li>
        )}
      </ul>

      <ReceiptUploadModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        tripId={payInfo.tripId}
        bookingId={payInfo.bookingId}
      />
    </div>
  );
}
