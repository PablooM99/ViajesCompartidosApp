import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/config";

export default function ImageUploader({ uid, path, label, onDone }) {
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const r = ref(storage, `users/${uid}/${path}.${ext}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      onDone?.(url);
    } catch (err) {
      alert(err.message || "No se pudo subir la imagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="block">
      <span className="text-xs text-neutral-600">{label}</span>
      <input type="file" accept="image/*" onChange={onFile}
             className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"/>
      {busy && <div className="text-xs text-neutral-500 mt-1">Subiendo…</div>}
    </label>
  );
}
