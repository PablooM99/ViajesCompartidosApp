import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import ImageUploader from "./ImageUploader";

export default function DriverProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehiclePhotoURL, setVehiclePhotoURL] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data();
        setDisplayName(d.displayName || "");
        setPhotoURL(d.photoURL || "");
        const p = d.driverProfile || {};
        setVehiclePlate(p.vehiclePlate || "");
        setVehicleModel(p.vehicleModel || "");
        setVehiclePhotoURL(p.vehiclePhotoURL || "");
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async (e) => {
    e.preventDefault();
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    await setDoc(ref, {
      uid: user.uid,
      displayName,
      photoURL,
      role: "both",
      driverProfile: {
        vehiclePlate: vehiclePlate.toUpperCase(),
        vehicleModel,
        vehiclePhotoURL: vehiclePhotoURL || null
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
    alert("Perfil actualizado");
  };

  if (!user) return <div className="bg-white p-3 rounded-2xl border">Ingresá con Google.</div>;
  if (loading) return <div className="bg-white p-3 rounded-2xl border">Cargando…</div>;

  return (
    <form onSubmit={save} className="bg-white rounded-2xl p-3 border space-y-3">
      <div className="font-medium">Perfil de Chofer</div>

      <label className="block">
        <span className="text-xs text-neutral-600">Nombre</span>
        <input className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
               value={displayName} onChange={e=>setDisplayName(e.target.value)} />
      </label>

      <div className="grid grid-cols-1 gap-3">
        <ImageUploader uid={user.uid} path="avatar" label="Foto de perfil"
          onDone={setPhotoURL}/>
        {photoURL && <img src={photoURL} className="h-20 w-20 rounded-full border object-cover" />}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-neutral-600">Patente</span>
          <input className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
                 value={vehiclePlate} onChange={e=>setVehiclePlate(e.target.value)} placeholder="ABC123 / AB123CD"/>
        </label>
        <label className="block">
          <span className="text-xs text-neutral-600">Modelo</span>
          <input className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
                 value={vehicleModel} onChange={e=>setVehicleModel(e.target.value)} placeholder="Fiesta 1.6 2013"/>
        </label>
      </div>

      <ImageUploader uid={user.uid} path="vehicle" label="Foto del vehículo"
        onDone={setVehiclePhotoURL}/>
      {vehiclePhotoURL && <img src={vehiclePhotoURL} className="h-28 w-full rounded-xl object-cover border" />}

      <button className="w-full rounded-2xl bg-vc_primary px-3 py-2 font-medium">Guardar</button>
    </form>
  );
}
