import { useState } from "react";
import Modal from "./Modal";
import StarRating from "./StarRating";
import { app } from "../firebase/config";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useToast } from "../context/ToastContext";

export default function ReviewModal({ open, onClose, trip, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const { success, error } = useToast();

  const submit = async () => {
    if (!trip?.id) return;
    setBusy(true);
    try {
      const fn = httpsCallable(getFunctions(app), "submitReview");
      await fn({ tripId: trip.id, rating, comment });
      success("¡Gracias por tu calificación!");
      onDone?.();
      onClose?.();
      setRating(5); setComment("");
    } catch (e) {
      error(e.message || "No se pudo calificar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Calificar chofer"
      actions={[
        <button key="c" onClick={onClose} className="rounded-2xl border px-3 py-2">Cerrar</button>,
        <button key="s" onClick={submit} disabled={busy} className="rounded-2xl bg-vc_accent px-3 py-2 font-medium">
          {busy ? "Enviando…" : "Enviar"}
        </button>
      ]}
    >
      {!trip ? <div className="text-sm text-neutral-500">Cargando…</div> : (
        <div className="space-y-3 text-sm">
          <div><span className="font-medium">{trip.origin?.label} → {trip.destination?.label}</span></div>
          <div>
            <span className="text-xs text-neutral-600">Puntaje</span>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <label className="block">
            <span className="text-xs text-neutral-600">Comentario (opcional)</span>
            <textarea rows={3} className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
                      value={comment} onChange={e=>setComment(e.target.value)} placeholder="Trato, puntualidad, limpieza… (máx 500)"/>
          </label>
        </div>
      )}
    </Modal>
  );
}
