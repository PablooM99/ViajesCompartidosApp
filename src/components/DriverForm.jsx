import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { addDoc, collection, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { LOCALIDADES } from "../constants/localidades";
import Select from "./Select";

export default function DriverForm({ onCreated }) {
  const { user } = useAuth();
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [time, setTime] = useState("06:30");
  const [price, setPrice] = useState(2000);
  const [seats, setSeats] = useState(3);
  const [vehiclePhotoURL, setVehiclePhotoURL] = useState("");

  useEffect(() => {
    (async () => {
      if (!user) return;
      const snap = await getDoc(doc(db, "users", user.uid));
      const p = snap.exists() ? snap.data().driverProfile : null;
      if (p?.vehiclePhotoURL) setVehiclePhotoURL(p.vehiclePhotoURL);
    })();
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) return alert("Ingresá con Google");
    if (!originId || !destinationId) return alert("Elegí origen y destino");

    const [hh, mm] = time.split(":");
    const dt = dayjs(date).hour(Number(hh)).minute(Number(mm)).second(0).millisecond(0).toDate();

    await addDoc(collection(db, "trips"), {
      ownerUid: user.uid,
      originId,
      destinationId,
      date,
      datetime: dt,
      price: Number(price),
      seatsTotal: Number(seats),
      seatsAvailable: Number(seats),
      driver: { displayName: user.displayName, photoURL: user.photoURL },
      vehiclePhotoURL: vehiclePhotoURL || null,
      createdAt: serverTimestamp(),
    });

    onCreated?.();
  };

  return (
    <form onSubmit={submit} className="space-y-3 bg-white rounded-2xl p-3 border">
      <div className="font-medium">Publicar viaje</div>
      <Select label="Salida" value={originId} onChange={setOriginId} options={LOCALIDADES} />
      <Select label="Destino" value={destinationId} onChange={setDestinationId} options={LOCALIDADES} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-neutral-600">Fecha</span>
          <input type="date" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-600">Hora</span>
          <input type="time" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={time} onChange={e => setTime(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-neutral-600">Precio ($)</span>
          <input type="number" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={price} onChange={e => setPrice(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-600">Lugares</span>
          <input type="number" min={1} max={6} className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={seats} onChange={e => setSeats(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-neutral-600">URL foto vehículo (opcional)</span>
        <input type="url" className="mt-1 w-full rounded-2xl border bg-white px-3 py-2" value={vehiclePhotoURL} onChange={e => setVehiclePhotoURL(e.target.value)} />
      </label>
      <button className="w-full rounded-2xl bg-vc_primary px-3 py-2 font-medium">Publicar</button>
    </form>
  );
}
