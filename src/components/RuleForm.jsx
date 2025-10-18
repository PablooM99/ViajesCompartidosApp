// src/components/RuleForm.jsx
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useRole } from "../hooks/useRole";
import Select from "./Select";
import WeekdayToggle from "./WeekdayToggle";
import { LOCALIDADES } from "../constants/localidades";

// Mapa id → localidad
const LMAP = Object.fromEntries(LOCALIDADES.map((l) => [l.id, l]));

// util: normalizar hora "HH:mm" a Date con la fecha dada
function composeDateTime(dateStr, hhmm) {
  const [H, M] = String(hhmm || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  const d = dayjs(dateStr).hour(H).minute(M).second(0).millisecond(0);
  return d.toDate();
}

export default function RuleForm({ ruleId = null, onSaved = () => {} }) {
  const { user } = useAuth();
  const { canPublish } = useRole(user?.uid);
  const { success, error } = useToast();

  // ------- formulario -------
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [time, setTime] = useState("07:30");
  const [days, setDays] = useState([1, 2, 3, 4, 5]); // 0..6 (dom..sab)
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState(2000);

  const todayStr = dayjs().format("YYYY-MM-DD");
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(dayjs().add(14, "day").format("YYYY-MM-DD"));

  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => {
    if (!user || !canPublish) return false;
    if (!originId || !destinationId || originId === destinationId) return false;
    if (!fromDate || !toDate) return false;
    if (dayjs(fromDate).isAfter(dayjs(toDate))) return false;
    if (!Array.isArray(days) || days.length === 0) return false;
    return true;
  }, [user, canPublish, originId, destinationId, fromDate, toDate, days]);

  useEffect(() => {
    // si se usara para editar una regla existente, acá podrías cargarla
    // por ruleId y setear estados. Lo dejo listo por si más adelante lo querés.
  }, [ruleId]);

  // Lee perfil del chofer para embutir en cada trip (preferimos /users/{uid})
  const loadDriverProfile = async (uid, fallbackAuthUser) => {
    let profile = {};
    try {
      const usnap = await getDoc(doc(db, "users", uid));
      if (usnap.exists()) profile = usnap.data() || {};
    } catch (_e) {
      // si falla, ignoramos y usamos auth
    }

    // armamos el objeto driver consumido por DriverCard.jsx
    return {
      uid,
      displayName:
        profile.displayName ||
        fallbackAuthUser?.displayName ||
        fallbackAuthUser?.email ||
        "Usuario",
      photoURL: profile.photoURL || fallbackAuthUser?.photoURL || "",
      phone: profile.phone || "",
      // Si tu perfil guarda estos, los podremos usar también en la card:
      vehicle: profile.vehicle || null,
      vehiclePhotoURL: profile.vehiclePhotoURL || "",
      ratingAvg: profile.ratingAvg || null,
      ratingCount: profile.ratingCount || 0,
    };
  };

  // Genera todas las fechas entre fromDate..toDate que matcheen con "days"
  const enumerateTripDates = (fromStr, toStr, allowedDays /* [0..6] */) => {
    const start = dayjs(fromStr).startOf("day");
    const end = dayjs(toStr).endOf("day");
    const out = [];
    let d = start;
    // hard limit 120 días por seguridad
    const MAX_DAYS_SCAN = 200;
    let guard = 0;

    while (d.isBefore(end) || d.isSame(end, "day")) {
      if (allowedDays.includes(d.day())) out.push(d.format("YYYY-MM-DD"));
      d = d.add(1, "day");
      guard++;
      if (guard > MAX_DAYS_SCAN) break;
    }
    return out;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    try {
      // 1) asegurarnos que el chofer existe y preparar objeto driver
      const driver = await loadDriverProfile(user.uid, user);

      // 2) persistimos/actualizamos la regla (opcional usar ruleId fijo)
      const ruleRef = ruleId
        ? doc(db, "rules", ruleId)
        : doc(collection(db, "rules"));

      const rulePayload = {
        ownerUid: user.uid,
        originId,
        destinationId,
        time, // "HH:mm"
        days, // [0..6]
        seats,
        price,
        fromDate,
        toDate,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      await setDoc(ruleRef, rulePayload, { merge: true });

      // 3) generar viajes embebiendo driver
      const dates = enumerateTripDates(fromDate, toDate, days);

      if (dates.length === 0) {
        success("Regla guardada. No hay fechas que coincidan con los días seleccionados.");
        setSaving(false);
        onSaved();
        return;
      }

      // seguridad: limitar cantidad por envío
      const MAX_TRIPS_PER_SUBMIT = 60;
      const slice = dates.slice(0, MAX_TRIPS_PER_SUBMIT);

      const batch = writeBatch(db);

      slice.forEach((ds) => {
        const datetime = composeDateTime(ds, time);

        // ⬇️⬇️ CAMBIO MÍNIMO: calcular expiresAt = fin del día de ese viaje
        const expiresAt = dayjs(datetime).endOf("day").toDate();
        // ⬆️⬆️

        const tripRef = doc(collection(db, "trips"));
        batch.set(tripRef, {
          ownerUid: user.uid,
          driver, // embebido para que DriverCard lo muestre siempre
          originId,
          destinationId,
          origin: LMAP[originId] || { id: originId },
          destination: LMAP[destinationId] || { id: destinationId },
          date: ds, // "YYYY-MM-DD" (para filtros exactos)
          datetime, // Date (para ordenado y filtros por rango)
          price: Number(price) || 0,
          seatsAvailable: Number(seats) || 0,
          createdAt: serverTimestamp(),
          ruleId: ruleRef.id,
          expiresAt: dayjs(ds).add(1, "day").startOf("day").toDate(), // ⬅️⬅️ NUEVO (para TTL)
        });
      });

      await batch.commit();

      const skipped = dates.length - slice.length;
      success(
        skipped > 0
          ? `Regla guardada y ${slice.length} viajes creados. (${skipped} restantes — dividí en varios envíos si necesitás más).`
          : `Regla guardada y ${slice.length} viajes creados.`
      );

      setSaving(false);
      onSaved();
    } catch (e2) {
      console.error(e2);
      error(e2?.message || "No se pudo guardar la regla / crear los viajes");
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-3 border">
      <div className="font-medium mb-2">Regla de viaje (recurrente)</div>
      {!canPublish && (
        <div className="text-sm text-rose-600 mb-3">
          Tu cuenta no tiene permisos de chofer. Pedí rol de chofer para publicar.
        </div>
      )}

      <form onSubmit={onSubmit} className="grid gap-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Select
              label="Salida"
              value={originId}
              onChange={setOriginId}
              options={LOCALIDADES}
            />
          </div>
          <button
            type="button"
            className="rounded-xl border px-3 py-2"
            onClick={() => {
              const a = originId;
              setOriginId(destinationId);
              setDestinationId(a);
            }}
          >
            ⇄
          </button>
          <div className="flex-1">
            <Select
              label="Destino"
              value={destinationId}
              onChange={setDestinationId}
              options={LOCALIDADES}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-neutral-600">Desde</span>
            <input
              type="date"
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-xs text-neutral-600">Hasta</span>
            <input
              type="date"
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-xs text-neutral-600">Hora (salida)</span>
            <input
              type="time"
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>

        <WeekdayToggle value={days} onChange={setDays} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-neutral-600">Asientos</span>
            <input
              type="number"
              min={1}
              max={10}
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={seats}
              onChange={(e) => setSeats(parseInt(e.target.value || "0", 10))}
            />
          </label>

          <label className="block">
            <span className="text-xs text-neutral-600">Precio</span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={price}
              onChange={(e) => setPrice(parseInt(e.target.value || "0", 10))}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canSubmit || saving}
            className={[
              "rounded-xl border px-3 py-2 text-sm",
              !canSubmit || saving ? "opacity-60 pointer-events-none" : "",
            ].join(" ")}
          >
            {saving ? "Guardando..." : "Guardar regla y crear viajes"}
          </button>
          <span className="text-xs text-neutral-500">
            Se crearán hasta 60 viajes por envío.
          </span>
        </div>
      </form>
    </div>
  );
}
