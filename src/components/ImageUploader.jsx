import { useState } from "react";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app, auth } from "../firebase/config";

export default function ImageUploader({ path = "avatar.jpg", onUploaded }) {
  const [busy, setBusy] = useState(false);
  const storage = getStorage(app);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!auth.currentUser) {
      alert("Tenés que iniciar sesión");
      return;
    }
    // Sólo imágenes
    if (!file.type.startsWith("image/")) {
      alert("Formato inválido. Subí una imagen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen debe pesar menos de 5 MB.");
      return;
    }

    setBusy(true);
    try {
      const uid = auth.currentUser.uid;
      const r = ref(storage, `users/${uid}/${path}`);
      // 👇 mandamos el contentType explícito
      await uploadBytes(r, file, { contentType: file.type });
      const url = await getDownloadURL(r);
      onUploaded?.(url);
    } catch (err) {
      // Si ves “AppCheck token required” o 403, es App Check (paso 2)
      console.error("Upload failed:", err);
      alert(err?.message || "No se pudo subir la imagen");
    } finally {
      setBusy(false);
      e.target.value = ""; // limpia el input
    }
  };

  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="file"
        accept="image/*"
        onChange={onFile}
        disabled={busy}
        className="hidden"
      />
      <span className="rounded-xl border px-3 py-1.5 cursor-pointer">
        {busy ? "Subiendo…" : "Subir foto"}
      </span>
    </label>
  );
}
