import { useState } from "react";
import Modal from "./Modal";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage, db } from "../firebase/config";
import { addDoc, collection, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function ReceiptUploadModal({ open, onClose, tripId, bookingId }) {
  const { user } = useAuth();
  const { success, error } = useToast();

  const [file, setFile] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!user) return error("Ingresá con Google");
    if (!tripId || !bookingId) return error("Reserva inválida");
    if (!file) return error("Subí un archivo de comprobante");

    setLoading(true);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const path = `receipts/${user.uid}/${bookingId}/${Date.now()}.${ext}`;
      const sref = ref(storage, path);

      await uploadBytesResumable(sref, file);
      const url = await getDownloadURL(sref);

      await addDoc(collection(db, "trips", tripId, "bookings", bookingId, "payments"), {
        uid: user.uid,
        method: "transfer",
        amount: amount ? Number(amount) : null,
        note: String(note || "").trim(),
        receiptUrl: url,
        createdAt: serverTimestamp(),
      });

      success("Comprobante enviado");
      onClose?.();
      setFile(null);
      setAmount("");
      setNote("");
    } catch (e) {
      error(e.message || "No se pudo subir el comprobante");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subir comprobante"
      actions={[
        <button key="cancel" onClick={onClose} className="rounded-2xl border px-3 py-2">Cancelar</button>,
        <button key="ok" onClick={submit} disabled={loading} className="rounded-2xl bg-vc_accent px-3 py-2">
          {loading ? "Enviando…" : "Enviar"}
        </button>,
      ]}
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-neutral-600 mb-1">Monto (opcional)</div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-2xl border px-3 py-2"
            placeholder="Ej: 4000"
            min="0"
          />
        </div>
        <div>
          <div className="text-xs text-neutral-600 mb-1">Nota (opcional)</div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-2xl border px-3 py-2"
            placeholder="Alias usado, referencia, etc."
            maxLength={120}
          />
        </div>
        <div>
          <div className="text-xs text-neutral-600 mb-1">Comprobante (imagen o PDF)</div>
          <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <p className="text-xs text-neutral-500">
          Tu comprobante se compartirá con el chofer para verificar el pago.
        </p>
      </div>
    </Modal>
  );
}
