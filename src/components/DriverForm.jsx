import { useEffect, useMemo, useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { LOCALIDADES } from "../constants/localidades";
import Select from "./Select";
import dayjs from "dayjs";

// Utilidad simple para id → label
const LMAP = Object.fromEntries(LOCALIDADES.map(l => [l.id, l]));

export default function DriverForm({ onCreated }) {
  const { user } = useAuth();
  const { success, error } = useToast();

  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [time, setTime] = useState("08:00");
  const [price, setPrice] = useState("");
  const [seatsAvailable, setSeatsAvailable] = useState(3);
  const [saving, setSaving] = useState(false);

  const dtISO = useMemo(() => {
    if (!date || !time) return null;
    return dayjs(`${date}T${time}`).toDate();
  }, [date, time]);

  const swap = () => {
    const o = originId;
    const d = destinationId;
    setOriginId(d);
    setDestinationId(o);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!user) return error("Ingresá con Google");
    if (!originId || !destinationId) return error("Elegí salida y destino");
    if (!dtISO) return error("Fecha/hora inválidas");

    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const expiresAt = dayjs(dtISO).endOf("day").toDate(); // ⬅️ TTL del viaje

      await setDoc(
        doc(db, "trips", id),
        {
          id,
          ownerUid: user.uid,
          originId,
          destinationId,
          origin: LMAP[originId] || null,          // (si ya guardabas objetos)
          destination: LMAP[destinationId] || null,
          date: dayjs(dtISO).format("YYYY-MM-DD"),
          time,
          datetime: dtISO,
          price: Number(price || 0),
          seatsAvailable: Number(seatsAvailable || 0),
          createdAt: serverTimestamp(),
          expiresAt,                                // ⬅️ NUEVO
          // opcional para mostrar chofer en cards (si tu UI lo usa):
          driver: {
            uid: user.uid,
            displayName: user.displayName || "",
            photoURL: user.photoURL || "",
          },
        },
        { merge: false }
      );

      success("Viaje publicado");
      setPrice("");
      setSeatsAvailable(3);
      onCreated?.();
    } catch (e) {
      console.error(e);
      error(e.message || "No se pudo crear el viaje");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-3 border">
      <div className="font-medium mb-2">Publicar viaje</div>
      <form onSubmit={onSubmit} className="grid gap-2">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Select
              label="Salida"
              value={originId}
              onChange={setOriginId}
              options={LOCALIDADES}
            />
          </div>
          <button type="button" onClick={swap} className="rounded-xl border px-3 py-2">
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

        <label className="block">
          <span className="text-xs text-neutral-600">Fecha</span>
          <input
            type="date"
            className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-xs text-neutral-600">Hora</span>
          <input
            type="time"
            className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-neutral-600">Precio</span>
            <input
              type="number"
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="0"
              step="1"
            />
          </label>

          <label className="block">
            <span className="text-xs text-neutral-600">Asientos</span>
            <input
              type="number"
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
              value={seatsAvailable}
              onChange={(e) => setSeatsAvailable(e.target.value)}
              min="1"
              max="8"
            />
          </label>
        </div>

        <div>
          <button
            disabled={saving}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            {saving ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </form>
    </div>
  );
}
