import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, doc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useToast } from "../context/ToastContext";

const ROLES = ["traveler", "driver", "admin"];

export default function Admin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const { success, error } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const qy = query(collection(db, "users"), orderBy("createdAt", "desc"));
      const snap = await getDocs(qy);
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      error(e.message || "No se pudo cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveRole = async (uid, role) => {
    setSavingId(uid);
    try {
      await setDoc(doc(db, "users", uid), { role }, { merge: true });
      success("Rol actualizado");
      await load();
    } catch (e) {
      error(e.message || "No se pudo actualizar el rol");
    } finally {
      setSavingId(null);
    }
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
          {rows.map(u => (
            <li key={u.id} className="border rounded-xl p-2 flex items-center gap-3">
              <img src={u.photoURL || "/user.png"} className="h-9 w-9 rounded-full border object-cover" />
              <div className="flex-1">
                <div className="font-medium">{u.displayName || u.email || u.id}</div>
                <div className="text-xs text-neutral-500">{u.id}</div>
              </div>
              <select
                className="rounded-xl border px-2 py-1 text-sm"
                value={u.role || "traveler"}
                onChange={(e) => saveRole(u.id, e.target.value)}
                disabled={savingId === u.id}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
