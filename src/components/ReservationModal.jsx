import { useState, useMemo } from "react";
import Modal from "./Modal";
import dayjs from "dayjs";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function ReservationModal({ open, onClose, trip, onConfirmed }) {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [seats, setSeats] = useState(1);
  const [loading, setLoading] = useState(false);

  const limit = useMemo(() => {
    const avail = Number(trip?.seatsAvailable || 0);
    return Math.min(6, Math.max(0, avail));
  }, [trip]);

  const total = useMemo(
    () => Number(trip?.price || 0) * Number(seats || 0),
    [seats, trip]
  );

  const dts = trip?.datetime?.seconds
    ? dayjs(trip.datetime.seconds * 1000)
    : dayjs(trip?.datetime);

  const confirm = async () => {
    if (!user) return error("Ingresá con Google para reservar");
    if (!trip?.id) return;
    if (!Number.isInteger(seats) || seats < 1 || seats > limit)
      return error("Cantidad inválida");
    setLoading(true);
    try {
      const fn = httpsCallable(getFunctions(app), "reserveSeats");
      await fn({ tripId: trip.id, seats });
      success("Reserva confirmada ✨");
      onConfirmed?.();
      onClose?.();
      setSeats(1);
    } catch (e) {
      error(e.message || "No se pudo reservar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reservar lugares"
      actions={[
        <button key="cancel" onClick={onClose} className="rounded-2xl border px-3 py-2">
          Cancelar
        </button>,
        <button
          key="ok"
          onClick={confirm}
          disabled={loading || limit === 0}
          className="rounded-2xl bg-vc_accent px-3 py-2 font-medium disabled:opacity-60"
        >
          {loading ? "Reservando…" : "Confirmar"}
        </button>,
      ]}
    >
      {!trip ? (
        <div className="text-sm text-neutral-500">Cargando…</div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <img
              src={trip?.driver?.photoURL || "/user.png"}
              className="h-10 w-10 rounded-full object-cover border"
            />
            <div>
              <div className="font-medium">{trip?.driver?.displayName || "Chofer"}</div>
              <div className="text-neutral-500">
                {dts.isValid() ? dts.format("DD/MM HH:mm") : ""} • ${trip?.price}
              </div>
            </div>
            <div className="ml-auto text-xs bg-vc_primary/60 rounded-xl px-2 py-1">
              {trip?.seatsAvailable} disp.
            </div>
          </div>
          <div className="text-neutral-700">
            {trip?.origin?.label} → {trip?.destination?.label}
          </div>
          <label className="block">
            <span className="text-xs text-neutral-600">Cantidad de asientos</span>
            <select
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
            >
              {Array.from({ length: limit }).map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between border rounded-xl p-2">
            <span>Total</span>
            <span className="font-semibold">${total}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
