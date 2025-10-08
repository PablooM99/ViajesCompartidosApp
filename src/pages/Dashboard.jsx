import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import DriverForm from "../components/DriverForm";
import { collection, getDocs, query, where, orderBy, doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import TripBookings from "../components/TripBookings";
import MyBookings from "../components/MyBookings";
import RuleForm from "../components/RuleForm";
import MyRules from "../components/MyRules";
import DriverProfile from "../components/DriverProfile";

export default function Dashboard() {
  const { user } = useAuth();
  const [myTrips, setMyTrips] = useState([]);
  const [openTripId, setOpenTripId] = useState(null);

  const fetchMine = async () => {
    if (!user) return;
    const q = query(
      collection(db, "trips"),
      where("ownerUid", "==", user.uid),
      orderBy("datetime", "desc")
    );
    const snap = await getDocs(q);
    setMyTrips(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    fetchMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const deleteTrip = async (id) => {
    if (!confirm("¿Eliminar este viaje? Si tiene reservas, se recomienda avisar a los pasajeros.")) return;
    try {
      await deleteDoc(doc(db, "trips", id));
      fetchMine();
    } catch (e) {
      alert(e.message || "No se pudo eliminar");
    }
  };

  return (
    <div className="space-y-4">
      {!user && (
        <div className="bg-white p-3 rounded-2xl border">Ingresá con Google para gestionar tus viajes.</div>
      )}
      {user && (
        <>
          <RuleForm onSaved={fetchMine} />
          <MyRules uid={user?.uid} />

          <DriverProfile />

          <DriverForm onCreated={fetchMine} />

          <div className="bg-white rounded-2xl p-3 border">
            <div className="font-medium mb-2">Mis viajes</div>
            <ul className="space-y-2 text-sm">
              {myTrips.map((t) => (
                <li key={t.id} className="border rounded-xl p-2">
                  <div className="flex items-center justify-between">
                    <span>{t.originId} → {t.destinationId} • ${t.price}</span>
                    <div className="flex items-center gap-2">
                      <span>{new Date(t.datetime.seconds ? t.datetime.seconds * 1000 : t.datetime).toLocaleString()}</span>
                      <button onClick={() => deleteTrip(t.id)} className="rounded-xl border px-3 py-1">Eliminar</button>
                      <button onClick={() => setOpenTripId(openTripId === t.id ? null : t.id)} className="rounded-xl border px-3 py-1">
                        {openTripId === t.id ? 'Ocultar reservas' : 'Ver reservas'}
                      </button>
                    </div>
                  </div>
                  {openTripId === t.id && <TripBookings tripId={t.id} />}
                </li>
              ))}
              {myTrips.length === 0 && <li className="text-neutral-500">Sin publicaciones aún.</li>}
            </ul>
          </div>

          <MyBookings uid={user?.uid} onChanged={fetchMine} />
        </>
      )}
    </div>
  );
}
