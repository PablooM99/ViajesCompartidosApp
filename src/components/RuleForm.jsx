import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { LOCALIDADES } from "../constants/localidades";
import Select from "./Select";
import WeekdayToggle from "./WeekdayToggle";
import dayjs from "dayjs";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase/config";

export default function RuleForm({ onSaved }) {
  const { user } = useAuth();
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [weekdays, setWeekdays] = useState([1,3,5]); // Lu/Mi/Vi
  const [time, setTime] = useState("06:30");
  const [price, setPrice] = useState(2500);
  const [seats, setSeats] = useState(3);
  const [vehiclePhotoURL, setVehiclePhotoURL] = useState("");
  const [startDate, setStartDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return alert("Ingresá con Google");
    if (!originId || !destinationId || weekdays.length === 0) return alert("Completa origen, destino y días");
    setSaving(true);
    try {
      const fn = httpsCallable(getFunctions(app), "createOrUpdateRule");
      const { data } = await fn({ originId, destinationId, weekdays, time, price, seats, vehiclePhotoURL, startDate, endDate: endDate || null, active: true });
      alert(`Regla guardada. Viajes creados: ${data.created}`);
      onSaved?.();
    } catch (e) {
      alert(e.message || "No se pudo guardar la regla");
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3 bg-white rounded-2xl p-3 border">
      <div className="font-medium">Regla de viaje</div>
      <Select label="Salida" value={originId} onChange={setOriginId} options={LOCALIDADES} />
      <Select label="Destino" value={destinationId} onChange={setDestinationId} options={LOCALIDADES} />
      <div>
        <div className="text-xs text-neutral-600 mb-1">Días de la semana</div>
        <WeekdayToggle value={weekdays} onChange={setWeekdays} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-neutral-600">Hora</span>
          <input type="time" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={time} onChange={e => setTime(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-600">Precio ($)</span>
          <input type="number" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={price} onChange={e => setPrice(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-neutral-600">Lugares</span>
          <input type="number" min={1} max={6} className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={seats} onChange={e => setSeats(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-600">Foto vehículo (URL)</span>
          <input type="url" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={vehiclePhotoURL} onChange={e => setVehiclePhotoURL(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-neutral-600">Desde</span>
          <input type="date" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-600">Hasta (opcional)</span>
          <input type="date" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </label>
      </div>
      <button disabled={saving} className="w-full rounded-2xl bg-vc_primary px-3 py-2 font-medium">{saving ? 'Guardando…' : 'Guardar y generar 30 días'}</button>
    </form>
  );
}
