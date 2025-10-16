import { useEffect, useState, useMemo } from "react";
import dayjs from "dayjs";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { LOCALIDADES } from "../constants/localidades";
import Select from "../components/Select";
import DriverCard from "../components/DriverCard";
import ReservationModal from "../components/ReservationModal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

// Mapa id → objeto localidad (para mostrar labels, etc.)
const LMAP = Object.fromEntries(LOCALIDADES.map((l) => [l.id, l]));

/**
 * ORDEN GEO DE TU CORREDOR
 * Si el label/id de tus localidades difiere (p. ej. “Mar del Plata” vs “Mar del plata”),
 * ajustá la lista ORDER_LABELS para que coincida EXACTO con tus labels o ids.
 */
const ORDER_LABELS = ["Piran", "Vidal", "Vivorata", "Mar del plata"];

/**
 * Construye un mapa id -> índice de posición en la traza, buscando por:
 * - id igual
 * - o label (insensible a mayúsculas/minúsculas)
 */
const POS = (() => {
  const map = {};
  let idx = 0;
  const norm = (s) => String(s || "").trim().toLowerCase();
  ORDER_LABELS.forEach((name) => {
    const want = norm(name);
    const item =
      LOCALIDADES.find(
        (l) => norm(l.id) === want || norm(l.label ?? l.name) === want
      ) || null;
    if (item) map[item.id] = idx++;
  });
  return map;
})();

const posOf = (locId) =>
  Number.isFinite(POS[locId]) ? POS[locId] : Number.NaN;

/**
 * Devuelve true si el segmento (wantO -> wantD) está contenido dentro del segmento
 * publicado (pubO -> pubD) siguiendo el orden geográfico definido por POS, en la
 * misma dirección.
 *
 * Ejemplos:
 * - Quiere Vivorata → Mar del plata y la publicación es Vidal → Mar del plata → ✅ (dentro del tramo)
 * - Quiere Mar del plata → Vivorata y la publicación es Mar del plata → Vidal → ✅ (dentro hacia atrás)
 * - Direcciones opuestas → ❌
 */
function segmentIncludes(wantO, wantD, pubO, pubD) {
  const wo = posOf(wantO);
  const wd = posOf(wantD);
  const po = posOf(pubO);
  const pd = posOf(pubD);

  // Si alguna localidad no está mapeada, caemos a “coincidencia exacta”
  if ([wo, wd, po, pd].some((v) => Number.isNaN(v))) {
    return wantO === pubO && wantD === pubD;
  }

  // No tiene sentido ir al mismo lugar
  if (wo === wd) return false;

  const wantForward = wo < wd;
  const pubForward = po < pd;

  // Deben ir en la MISMA dirección
  if (wantForward !== pubForward) return false;

  if (wantForward) {
    // Adelante: po <= wo <= wd <= pd
    return po <= wo && wd <= pd;
  } else {
    // Atrás: po >= wo >= wd >= pd
    return po >= wo && wd >= pd;
  }
}

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

  const limitText = useMemo(() => (flex7 ? " (próx. 7 días)" : ""), [flex7]);

  const swap = () => {
    const o = origin;
    const d = destination;
    setOrigin(d);
    setDestination(o);
  };

  const fetchTrips = async () => {
    if (!origin || !destination) {
      setTrips([]);
      return;
    }
    setLoading(true);
    try {
      // ✅ Cambiamos la consulta:
      //   ya NO filtramos por originId/destinationId en Firestore.
      //   Traemos por fecha (o rango) y filtramos por “segmento” en memoria.
      let qy;
      if (flex7) {
        const from = dayjs(date).startOf("day").toDate();
        const to = dayjs(date).add(7, "day").endOf("day").toDate();
        qy = query(
          collection(db, "trips"),
          where("datetime", ">=", from),
          where("datetime", "<=", to),
          orderBy("datetime", "asc")
        );
      } else {
        qy = query(
          collection(db, "trips"),
          where("date", "==", date),
          orderBy("datetime", "asc")
        );
      }

      const snap = await getDocs(qy);
      const list = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            ownerUid: data.ownerUid,
            origin: LMAP[data.originId],
            destination: LMAP[data.destinationId],
          };
        })
        .filter((t) =>
          // 👉 Filtro por “segmento contenido”
          segmentIncludes(origin, destination, t.originId, t.destinationId)
        );

      setTrips(list);
    } catch (e) {
      console.error("fetchTrips error:", e);
      error("No se pudieron cargar los viajes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, date, flex7]);

  const openReserve = (trip) => {
    setSelectedTrip(trip);
    setModalOpen(true);
  };

  const onReserved = () => {
    fetchTrips();
  };

  // Alerts (seguir ruta)
  const routeKey = origin && destination ? `${origin}_${destination}` : "";

  const followRoute = async () => {
    if (!user || !routeKey) return error("Ingresá con Google");
    try {
      await setDoc(
        doc(db, "users", user.uid, "alerts", routeKey),
        {
          originId: origin,
          destinationId: destination,
          active: true,
          createdAt: new Date(),
        },
        { merge: true }
      );
      success("Te avisamos cuando haya nuevos viajes en esta ruta");
    } catch (e) {
      error(e.message || "No se pudo guardar la alerta");
    }
  };

  const unfollowRoute = async () => {
    if (!user || !routeKey) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "alerts", routeKey));
      success("Dejaste de seguir esta ruta");
    } catch (e) {
      error(e.message || "No se pudo quitar la alerta");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-3 border shadow-sm">
        <div className="grid grid-cols-1 gap-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Select
                label="Salida"
                value={origin}
                onChange={setOrigin}
                options={LOCALIDADES}
              />
            </div>
            <button onClick={swap} className="rounded-xl border px-3 py-2">
              ⇄
            </button>
            <div className="flex-1">
              <Select
                label="Destino"
                value={destination}
                onChange={setDestination}
                options={LOCALIDADES}
              />
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-neutral-600">Fecha{limitText}</span>
            <input
              type="date"
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={flex7}
              onChange={(e) => setFlex7(e.target.checked)}
            />
            Incluir próximos 7 días
          </label>

          {origin && destination && (
            <div className="flex gap-2">
              <button
                onClick={followRoute}
                className="rounded-xl border px-3 py-2 text-sm"
              >
                🔔 Avisarme
              </button>
              <button
                onClick={unfollowRoute}
                className="rounded-xl border px-3 py-2 text-sm"
              >
                🔕 Dejar de avisar
              </button>
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
