import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";
import { LOCALIDADES } from "../constants/localidades";
import Select from "../components/Select";
import DriverCard from "../components/DriverCard";
import ReservationModal from "../components/ReservationModal";
import { useAuth } from "../context/AuthContext";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { useToast } from "../context/ToastContext";

const LMAP = Object.fromEntries(LOCALIDADES.map((l) => [l.id, l]));

export default function Home() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [flex7, setFlex7] = useState(false);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);

  const { user } = useAuth();
  const { success, error } = useToast();

  const swap = () => {
    const o = origin; const d = destination;
    setOrigin(d); setDestination(o);
  };

  const fetchTrips = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    try {
      let qBase = [
        where("originId", "==", origin),
        where("destinationId", "==", destination),
      ];

      let qy;
      if (flex7) {
        const from = dayjs(date).startOf("day").toDate();
        const to = dayjs(date).add(7, "day").endOf("day").toDate();
        qy = query(collection(db, "trips"), ...qBase, where("datetime", ">=", from), where("datetime", "<=", to), orderBy("datetime", "asc"));
      } else {
        qy = query(collection(db, "trips"), ...qBase, where("date", "==", date), orderBy("datetime", "asc"));
      }

      const snap = await getDocs(qy);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        ownerUid: d.data().ownerUid,
        origin: LMAP[d.data().originId],
        destination: LMAP[d.data().destinationId],
      }));
      setTrips(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (origin && destination) fetchTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, date, flex7]);

  const openReserve = (trip) => {
    setSelectedTrip(trip);
    setModalOpen(true);
  };

  const onReserved = () => {
    fetchTrips();
  };

  const routeKey = origin && destination ? `${origin}_${destination}` : "";

  const followRoute = async () => {
    if (!user || !routeKey) return alert("Ingresá con Google");
    try {
      await setDoc(doc(db, "users", user.uid, "alerts", routeKey), {
        originId: origin,
        destinationId: destination,
        active: true,
        createdAt: new Date()
      }, { merge: true });
      success("Te avisamos cuando haya nuevos viajes en esta ruta");
    } catch (e) { error(e.message); }
  };

  const unfollowRoute = async () => {
    if (!user || !routeKey) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "alerts", routeKey));
      success("Dejaste de seguir esta ruta");
    } catch (e) { error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-3 border shadow-sm">
        <div className="grid grid-cols-1 gap-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Select label="Salida" value={origin} onChange={setOrigin} options={LOCALIDADES} />
            </div>
            <button onClick={swap} className="rounded-xl border px-3 py-2">⇄</button>
            <div className="flex-1">
              <Select label="Destino" value={destination} onChange={setDestination} options={LOCALIDADES} />
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-neutral-600">Fecha</span>
            <input
              type="date"
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={flex7} onChange={(e)=>setFlex7(e.target.checked)} />
            Incluir próximos 7 días
          </label>

          {origin && destination && (
            <div className="flex gap-2">
              <button onClick={followRoute} className="rounded-xl border px-3 py-2 text-sm">🔔 Avisarme</button>
              <button onClick={unfollowRoute} className="rounded-xl border px-3 py-2 text-sm">🔕 Dejar de avisar</button>
            </div>
          )}
        </div>
      </div>

      {loading && <div className="text-center text-sm">Buscando viajes…</div>}

      <div className="grid gap-3">
        {trips.map((trip) => (
          <DriverCard key={trip.id} trip={trip} onReserve={() => openReserve(trip)} />
        ))}
        {!loading && trips.length === 0 && origin && destination && (
          <div className="text-center text-sm text-neutral-500">
            No hay viajes para ese filtro.
          </div>
        )}
      </div>

      <ReservationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        trip={selectedTrip}
        onConfirmed={onReserved}
      />
    </div>
  );
}
