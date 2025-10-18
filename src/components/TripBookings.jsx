import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
  documentId,
} from "firebase/firestore";
import { functions } from "../firebase/functions";
import { httpsCallable } from "firebase/functions";
import { db } from "../firebase/config";
import Modal from "./Modal";
import dayjs from "dayjs";
import { Link } from "react-router-dom";

function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function TripBookings({ tripId }) {
  const [bookings, setBookings] = useState([]); // [{id, uid, seats, note, createdAt, pickedUp, ...}]
  const [profiles, setProfiles] = useState({}); // uid -> { displayName, photoURL, email }
  const [loading, setLoading] = useState(true);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [cancelingId, setCancelingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  // Carga reservas del viaje
  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!tripId) return;
      setLoading(true);
      try {
        const qy = query(
          collection(db, "trips", tripId, "bookings"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(qy);
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        if (ignore) return;
        setBookings(rows);

        // Cargar perfiles de usuarios involucrados
        const uids = Array.from(new Set(rows.map((r) => r.uid).filter(Boolean)));
        await fetchProfiles(uids);
      } catch (e) {
        console.error("TripBookings load error:", e);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const fetchProfiles = async (uids) => {
    const toFetch = (uids || []).filter((u) => u && !profiles[u]);
    if (toFetch.length === 0) return;

    try {
      for (const batch of chunk(toFetch, 10)) {
        const qy = query(
          collection(db, "users"),
          where(documentId(), "in", batch)
        );
        const snap = await getDocs(qy);
        const updates = {};
        snap.docs.forEach((d) => (updates[d.id] = { id: d.id, ...(d.data() || {}) }));
        // fallback si algún user no existe en /users
        for (const u of batch) if (!updates[u]) updates[u] = { id: u };
        setProfiles((prev) => ({ ...prev, ...updates }));
      }
    } catch (e) {
      console.warn("No se pudieron cargar algunos perfiles:", e?.message || e);
    }
  };

  const openDetails = (bk) => {
    setDetails(bk);
    setDetailsOpen(true);
  };

  const cancelBooking = async (bookingId) => {
    if (!confirm("¿Cancelar esta reserva?")) return;
    setCancelingId(bookingId);
    try {
      // Cloud Function esperada en tu backend
      const fn = httpsCallable(functions, "cancelBooking");
      await fn({ tripId, bookingId });
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo cancelar. (¿Función backend desplegada?)");
    } finally {
      setCancelingId(null);
      // refresco “manual” del listado
      try {
        const qy = query(
          collection(db, "trips", tripId, "bookings"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(qy);
        setBookings(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
      } catch {}
    }
  };

  const togglePickedUp = async (bk) => {
    const next = !bk?.pickedUp;
    setTogglingId(bk.id);
    try {
      // Guardamos SOLO pickedUp; las rules lo permiten si agregás la cláusula sugerida
      await setDoc(
        doc(db, "trips", tripId, "bookings", bk.id),
        { pickedUp: next },
        { merge: true }
      );
      setBookings((prev) =>
        prev.map((r) => (r.id === bk.id ? { ...r, pickedUp: next } : r))
      );
    } catch (e) {
      console.error(e);
      alert(
        e?.code === "permission-denied"
          ? "Permiso denegado. Agregá la regla específica para pickedUp."
          : "No se pudo actualizar."
      );
    } finally {
      setTogglingId(null);
    }
  };

  const rows = useMemo(() => bookings, [bookings]);

  if (loading) {
    return (
      <div className="text-sm text-neutral-500 px-2 py-1">Cargando reservas…</div>
    );
  }

  if (!rows.length) {
    return (
      <div className="text-sm text-neutral-500 px-2 py-1">
        No hay reservas para este viaje.
      </div>
    );
  }

  return (
    <>
      <ul className="mt-2 space-y-2">
        {rows.map((bk) => {
          const u = profiles[bk.uid] || { id: bk.uid };
          const when =
            bk?.createdAt?.seconds
              ? dayjs(bk.createdAt.seconds * 1000).format("DD/MM HH:mm")
              : "";
          return (
            <li
              key={bk.id}
              className="border rounded-xl p-2 flex items-center gap-3 flex-wrap"
            >
              <img
                src={u.photoURL || "/user.png"}
                alt=""
                className="h-9 w-9 rounded-full border object-cover"
              />
              <div className="flex-1 min-w-[220px]">
                <div className="font-medium">
                  {u.displayName || u.email || u.id || "Usuario"}
                </div>
                <div className="text-xs text-neutral-500">
                  {bk.seats ? `Asientos: ${bk.seats}` : ""} {when && `• ${when}`}
                </div>
              </div>

              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!bk.pickedUp}
                  onChange={() => togglePickedUp(bk)}
                  disabled={togglingId === bk.id}
                />
                Levantado
              </label>

              <Link
                to={`/mensajes?trip=${encodeURIComponent(tripId)}&to=${encodeURIComponent(
                  bk.uid
                )}`}
                className="rounded-xl border px-3 py-1 text-sm"
                title="Abrir chat con el pasajero"
              >
                Chatear
              </Link>

              <button
                onClick={() => openDetails(bk)}
                className="rounded-xl border px-3 py-1 text-sm"
              >
                Detalles
              </button>

              <button
                onClick={() => cancelBooking(bk.id)}
                className="rounded-xl border px-3 py-1 text-sm text-rose-700 border-rose-200"
                disabled={cancelingId === bk.id}
              >
                {cancelingId === bk.id ? "Cancelando…" : "Cancelar"}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Modal de detalles */}
      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Detalle de la reserva">
        {details ? (
          <div className="space-y-2 text-sm">
            <Row label="ID reserva" value={details.id} />
            <Row label="Pasajero" value={profiles[details.uid]?.displayName || profiles[details.uid]?.email || details.uid} />
            <Row label="Asientos" value={details.seats ?? "-"} />
            <Row
              label="Creada"
              value={
                details?.createdAt?.seconds
                  ? dayjs(details.createdAt.seconds * 1000).format("DD/MM/YYYY HH:mm")
                  : "-"
              }
            />
            <Row label="Comentario" value={details.note || details.comment || details.message || "—"} />
            {/* Si guardás otros campos (origen/destino del pasajero, teléfono, etc.) podes mostrarlos acá */}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">Sin datos.</div>
        )}
      </Modal>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2">
      <div className="w-28 text-neutral-500">{label}</div>
      <div className="flex-1">{String(value)}</div>
    </div>
  );
}
