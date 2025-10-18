// src/pages/Admins.jsx
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  setDoc,
  where,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useToast } from "../context/ToastContext";
import Select from "../components/Select";
import { LOCALIDADES } from "../constants/localidades";
import Modal from "../components/Modal"; // ⬅️ agregado para previsualización

const ROLES = ["traveler", "driver", "admin"];

// util: id -> localidad
const LMAP = Object.fromEntries(LOCALIDADES.map((l) => [l.id, l]));

// util: "YYYY-MM-DD" + "HH:mm" -> Date
function composeDateTime(dateStr, hhmm) {
  const [H, M] = String(hhmm || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  const d = dayjs(dateStr).hour(H).minute(M).second(0).millisecond(0);
  return d.toDate();
}

export default function Admin() {
  const [rows, setRows] = useState([]);                // usuarios
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);

  // trips por usuario (se cargan on-demand al expandir)
  const [userTrips, setUserTrips] = useState({});      // uid -> [{id,...}]
  const [tripsLoading, setTripsLoading] = useState({}); // uid -> bool
  const [editingTrip, setEditingTrip] = useState(null); // { uid, tripId }
  const [editForm, setEditForm] = useState({           // estado del formulario de edición
    originId: "",
    destinationId: "",
    date: "",
    time: "",
    price: 0,
  });

  // ⬇️ estado para previsualización de imagen (auto)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");

  const { success, error } = useToast();

  const loadUsers = async () => {
    setLoading(true);
    try {
      const qy = query(collection(db, "users"), orderBy("createdAt", "desc"));
      const snap = await getDocs(qy);
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      error(e.message || "No se pudo cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const saveRole = async (uid, role) => {
    setSavingId(uid);
    try {
      await setDoc(doc(db, "users", uid), { role }, { merge: true });
      success("Rol actualizado");
      await loadUsers();
    } catch (e) {
      error(e.message || "No se pudo actualizar el rol");
    } finally {
      setSavingId(null);
    }
  };

  // carga viajes de un usuario al expandir
  const loadTripsFor = async (uid) => {
    if (!uid) return;
    setTripsLoading((m) => ({ ...m, [uid]: true }));
    try {
      const qy = query(
        collection(db, "trips"),
        where("ownerUid", "==", uid),
        orderBy("datetime", "desc")
      );
      const snap = await getDocs(qy);
      const trips = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUserTrips((m) => ({ ...m, [uid]: trips }));
    } catch (e) {
      console.error(e);
      error("No se pudieron cargar los viajes del usuario");
    } finally {
      setTripsLoading((m) => ({ ...m, [uid]: false }));
    }
  };

  const onExpandUser = (uid) => {
    setExpandedUser(expandedUser === uid ? null : uid);
    if (expandedUser !== uid) {
      // cargar viajes si aún no los tenemos
      if (!userTrips[uid]) loadTripsFor(uid);
    }
  };

  // abrir edición de un viaje
  const openEditTrip = (uid, trip) => {
    const dt = trip?.datetime?.seconds
      ? new Date(trip.datetime.seconds * 1000)
      : new Date(trip?.datetime);

    setEditingTrip({ uid, tripId: trip.id });
    setEditForm({
      originId: trip.originId || "",
      destinationId: trip.destinationId || "",
      date: dt && !isNaN(dt) ? dayjs(dt).format("YYYY-MM-DD") : (trip.date || ""),
      time: dt && !isNaN(dt) ? dayjs(dt).format("HH:mm") : "07:30",
      price: trip.price || 0,
    });
  };

  // guardar edición
  const saveTripEdit = async () => {
    try {
      const { uid, tripId } = editingTrip || {};
      if (!uid || !tripId) return;
      const { originId, destinationId, date, time, price } = editForm;

      const datetime = composeDateTime(date, time);
      const payload = {
        originId,
        destinationId,
        origin: LMAP[originId] || { id: originId },
        destination: LMAP[destinationId] || { id: destinationId },
        date,
        datetime,
        price: Number(price) || 0,
        // seatsAvailable: (no lo tocamos por tus rules actuales)
        updatedAt: new Date(),
      };

      await setDoc(doc(db, "trips", tripId), payload, { merge: true });
      success("Viaje actualizado");

      // refrescar lista del usuario
      await loadTripsFor(uid);
      setEditingTrip(null);
    } catch (e) {
      console.error(e);
      error(
        e?.code === "permission-denied"
          ? "Permiso denegado por reglas (¿falta habilitar update para admin en /trips?)."
          : "No se pudo actualizar el viaje"
      );
    }
  };

  const cancelEdit = () => setEditingTrip(null);

  const deleteTrip = async (uid, tripId) => {
    if (!confirm("¿Eliminar este viaje? También se eliminarán sus mensajes/reservas por TTL o limpieza posterior.")) return;
    try {
      await deleteDoc(doc(db, "trips", tripId));
      success("Viaje eliminado");
      await loadTripsFor(uid);
    } catch (e) {
      console.error(e);
      error(
        e?.code === "permission-denied"
          ? "Permiso denegado (agregá permiso de delete para admin en /trips)."
          : "No se pudo eliminar"
      );
    }
  };

  const openVehiclePreview = (src) => {
    if (!src) return;
    setPreviewSrc(src);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-3 border">
        <div className="font-medium mb-2">Usuarios</div>
        {loading && <div className="text-sm text-neutral-500">Cargando…</div>}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-neutral-500">No hay usuarios aún.</div>
        )}
        <ul className="space-y-2">
          {rows.map((u) => {
            const isOpen = expandedUser === u.id;
            const trips = userTrips[u.id] || [];
            const tLoading = !!tripsLoading[u.id];

            const driver = u.driverProfile || {};

            return (
              <li key={u.id} className="border rounded-xl p-2">
                <div className="flex items-center gap-3">
                  <img
                    src={u.photoURL || "/user.png"}
                    className="h-9 w-9 rounded-full border object-cover"
                    alt=""
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {u.displayName || u.email || u.id}
                    </div>
                    <div className="text-xs text-neutral-500 break-all">{u.id}</div>
                  </div>

                  <select
                    className="rounded-xl border px-2 py-1 text-sm"
                    value={u.role || "traveler"}
                    onChange={(e) => saveRole(u.id, e.target.value)}
                    disabled={savingId === u.id}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => onExpandUser(u.id)}
                    className="rounded-xl border px-3 py-1 text-sm"
                  >
                    {isOpen ? "Ocultar" : "Ver detalles"}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    {/* Datos del usuario */}
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="bg-neutral-50 rounded-xl p-3">
                        <div className="font-medium mb-1">Datos del usuario</div>
                        <div className="text-sm">
                          <div><b>Nombre:</b> {u.displayName || "—"}</div>
                          <div className="break-all"><b>Email:</b> {u.email || "—"}</div>
                        </div>
                        {u.photoURL && (
                          <img
                            src={u.photoURL}
                            className="mt-2 h-20 w-20 rounded-full border object-cover"
                            alt=""
                          />
                        )}
                      </div>

                      <div className="bg-neutral-50 rounded-xl p-3">
                        <div className="font-medium mb-1">Perfil de chofer</div>
                        <div className="text-sm">
                          <div><b>Patente:</b> {driver.vehiclePlate || "—"}</div>
                          <div><b>Modelo:</b> {driver.vehicleModel || "—"}</div>
                        </div>
                        {driver.vehiclePhotoURL ? (
                          <button
                            type="button"
                            title="Ver foto del vehículo"
                            onClick={() => openVehiclePreview(driver.vehiclePhotoURL)}
                            className="mt-2 inline-block rounded-xl border overflow-hidden"
                          >
                            {/* Miniatura tamaño chico/medio */}
                            <img
                              src={driver.vehiclePhotoURL}
                              className="h-20 w-32 object-cover"
                              alt="Vehículo"
                            />
                          </button>
                        ) : (
                          <div className="mt-2 text-xs text-neutral-400">Sin foto de vehículo</div>
                        )}
                      </div>
                    </div>

                    {/* Viajes publicados */}
                    <div className="bg-white rounded-xl">
                      <div className="font-medium mb-2">Viajes publicados</div>
                      {tLoading && (
                        <div className="text-sm text-neutral-500">Cargando viajes…</div>
                      )}
                      {!tLoading && trips.length === 0 && (
                        <div className="text-sm text-neutral-500">Sin viajes.</div>
                      )}

                      <ul className="space-y-2">
                        {trips.map((t) => {
                          const dt = t?.datetime?.seconds
                            ? new Date(t.datetime.seconds * 1000)
                            : new Date(t?.datetime);

                          const isEditing =
                            editingTrip &&
                            editingTrip.uid === u.id &&
                            editingTrip.tripId === t.id;

                          return (
                            <li key={t.id} className="border rounded-xl p-2">
                              {!isEditing ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex-1 min-w-[220px] text-sm">
                                    <div className="font-medium">
                                      {t.originId} → {t.destinationId} • ${t.price}
                                    </div>
                                    <div className="text-xs text-neutral-500">
                                      {dt && !isNaN(dt)
                                        ? dt.toLocaleString(undefined, {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                          })
                                        : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => openEditTrip(u.id, t)}
                                      className="rounded-xl border px-3 py-1 text-sm"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => deleteTrip(u.id, t.id)}
                                      className="rounded-xl border px-3 py-1 text-sm text-rose-700 border-rose-200"
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="grid md:grid-cols-2 gap-2">
                                    <Select
                                      label="Salida"
                                      value={editForm.originId}
                                      onChange={(v) =>
                                        setEditForm((f) => ({ ...f, originId: v }))
                                      }
                                      options={LOCALIDADES}
                                    />
                                    <Select
                                      label="Destino"
                                      value={editForm.destinationId}
                                      onChange={(v) =>
                                        setEditForm((f) => ({ ...f, destinationId: v }))
                                      }
                                      options={LOCALIDADES}
                                    />
                                  </div>
                                  <div className="grid md:grid-cols-3 gap-2">
                                    <label className="block">
                                      <span className="text-xs text-neutral-600">Fecha</span>
                                      <input
                                        type="date"
                                        className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm"
                                        value={editForm.date}
                                        onChange={(e) =>
                                          setEditForm((f) => ({ ...f, date: e.target.value }))
                                        }
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-xs text-neutral-600">Hora</span>
                                      <input
                                        type="time"
                                        className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm"
                                        value={editForm.time}
                                        onChange={(e) =>
                                          setEditForm((f) => ({ ...f, time: e.target.value }))
                                        }
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-xs text-neutral-600">Precio</span>
                                      <input
                                        type="number"
                                        className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm"
                                        value={editForm.price}
                                        onChange={(e) =>
                                          setEditForm((f) => ({
                                            ...f,
                                            price: parseInt(e.target.value || "0", 10),
                                          }))
                                        }
                                      />
                                    </label>
                                  </div>

                                  <div className="flex gap-2">
                                    <button
                                      onClick={saveTripEdit}
                                      className="rounded-xl border px-3 py-1 text-sm"
                                    >
                                      Guardar
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="rounded-xl border px-3 py-1 text-sm"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Modal para ver la imagen del vehículo en grande */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Foto del vehículo"
      >
        {previewSrc ? (
          <img
            src={previewSrc}
            alt="Vehículo"
            className="w-full rounded-xl object-contain"
          />
        ) : (
          <div className="text-sm text-neutral-500">Sin imagen.</div>
        )}
      </Modal>
    </div>
  );
}
