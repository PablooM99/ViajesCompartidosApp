// src/pages/Messages.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  documentId,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import useRole from "../hooks/useRole";
import { useToast } from "../context/ToastContext";

// ---------- utils ----------
function convIdForTrip(tripId, u1, u2) {
  const [a, b] = [String(u1), String(u2)].sort();
  return `${tripId}__${a}__${b}`;
}
function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function tsMillis(x) {
  if (!x) return 0;
  if (typeof x.toMillis === "function") return x.toMillis();
  if (x.seconds) return x.seconds * 1000;
  const d = dayjs(x);
  return d.isValid() ? d.valueOf() : 0;
}
function tripLabel(t) {
  const ms = tsMillis(t?.datetime || t?.date);
  const hh = ms ? dayjs(ms).format("DD/MM HH:mm") : "";
  const route = `${t?.origin?.label || t?.originId || "—"} → ${t?.destination?.label || t?.destinationId || "—"}`;
  return `${hh} • ${route}`;
}

export default function Messages() {
  const { user } = useAuth();
  const { isDriver } = useRole(user?.uid);
  const { error } = useToast();

  // selector de viaje
  const [myTrips, setMyTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState("");

  // contactos de ese viaje
  const [contacts, setContacts] = useState([]); // [{uid}]
  const [profiles, setProfiles] = useState({}); // { uid: {id, displayName, photoURL, email} }
  const [convMeta, setConvMeta] = useState({}); // { cid: { lastMessage, lastMessageAt } }
  const convMetaUnsubsRef = useRef({}); // para limpiar listeners

  // chat
  const [activePeerUid, setActivePeerUid] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  // ---------- cargar viajes del usuario según rol ----------
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        if (isDriver) {
          // Chofer: viajes donde es owner
          const qy = query(
            collection(db, "trips"),
            where("ownerUid", "==", user.uid),
            orderBy("datetime", "desc")
          );
          const snap = await getDocs(qy);
          setMyTrips(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } else {
          // Viajero: viajes que reservó (collectionGroup bookings)
          const qy = query(
            collectionGroup(db, "bookings"),
            where("uid", "==", user.uid),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(qy);
          const uniqTripIds = Array.from(
            new Set(
              snap.docs
                .map((bd) => bd.ref.path.split("/")[1]) // trips/{tripId}/bookings/{bookingId}
                .filter(Boolean)
            )
          );

          const trips = [];
          for (const tid of uniqTripIds) {
            const tsnap = await getDoc(doc(db, "trips", tid));
            if (tsnap.exists()) trips.push({ id: tid, ...tsnap.data() });
          }
          trips.sort((a, b) => tsMillis(b?.datetime || b?.date) - tsMillis(a?.datetime || a?.date));
          setMyTrips(trips);
        }
      } catch (e) {
        console.error(e);
        error("No se pudieron cargar tus viajes para mensajería");
      }
    })();
  }, [user?.uid, isDriver, error]);

  // ---------- al elegir viaje: cargar contactos y perfiles ----------
  useEffect(() => {
    // limpiar listeners de meta cuando se cambia de viaje
    Object.values(convMetaUnsubsRef.current).forEach((fn) => fn?.());
    convMetaUnsubsRef.current = {};
    setConvMeta({});
    setActivePeerUid("");
    setMsgs([]);

    if (!selectedTripId || !user) {
      setContacts([]);
      return;
    }

    (async () => {
      try {
        const tSnap = await getDoc(doc(db, "trips", selectedTripId));
        if (!tSnap.exists()) {
          setContacts([]);
          return;
        }
        const trip = { id: selectedTripId, ...tSnap.data() };

        if (isDriver) {
          // todos los pasajeros de ese viaje
          const bsnap = await getDocs(collection(db, "trips", selectedTripId, "bookings"));
          const uids = Array.from(
            new Set(bsnap.docs.map((d) => d.data()?.uid).filter((u) => !!u && u !== user.uid))
          );
          setContacts(uids.map((uid) => ({ uid })));
          await fetchProfiles(uids);
          // suscribimos meta de conversaciones (ultimo mensaje/hora)
          wireConvMeta(selectedTripId, [user.uid, ...uids]);
        } else {
          // viajero: solo el chofer del viaje
          const owner = trip.ownerUid;
          if (owner && owner !== user.uid) {
            setContacts([{ uid: owner }]);
            await fetchProfiles([owner]);
            wireConvMeta(selectedTripId, [user.uid, owner]);
          } else {
            setContacts([]);
          }
        }
      } catch (e) {
        console.error(e);
        error("No se pudieron cargar los contactos del viaje");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTripId, isDriver, user?.uid]);

  // carga perfiles faltantes (batch de 10)
  const fetchProfiles = async (uids) => {
    const toFetch = (uids || []).filter((u) => u && !profiles[u]);
    if (toFetch.length === 0) return;
    try {
      for (const batch of chunk(toFetch, 10)) {
        const qy = query(collection(db, "users"), where(documentId(), "in", batch));
        const snap = await getDocs(qy);
        const updates = {};
        snap.docs.forEach((d) => (updates[d.id] = { id: d.id, ...(d.data() || {}) }));
        for (const u of batch) if (!updates[u]) updates[u] = { id: u }; // fallback
        setProfiles((prev) => ({ ...prev, ...updates }));
      }
    } catch (e) {
      console.warn("No se pudieron cargar algunos perfiles:", e?.message || e);
    }
  };

  // escuchar meta (lastMessage / lastMessageAt) por contacto para el viaje
  const wireConvMeta = (tripId, uids) => {
    // generamos todos los pares user <-> peer (pero solo necesitamos cuando sea distinto)
    const peers = uids.filter((u) => u !== user?.uid);
    peers.forEach((peerUid) => {
      const cid = convIdForTrip(tripId, user.uid, peerUid);
      const cref = doc(db, "conversations", cid);
      const unsub = onSnapshot(
        cref,
        (snap) => {
          if (!snap.exists()) {
            setConvMeta((m) => {
              const copy = { ...m };
              delete copy[cid];
              return copy;
            });
          } else {
            const data = snap.data() || {};
            setConvMeta((m) => ({
              ...m,
              [cid]: {
                lastMessage: data.lastMessage || "",
                lastMessageAt: data.lastMessageAt || data.lastMessageAt,
              },
            }));
          }
        },
        () => {
          // ignoramos errores de meta
        }
      );
      convMetaUnsubsRef.current[cid] = unsub;
    });
  };

  // abrir/crear conversación y escuchar mensajes
  useEffect(() => {
    if (!selectedTripId || !user || !activePeerUid) return;

    const cid = convIdForTrip(selectedTripId, user.uid, activePeerUid);
    const cref = doc(db, "conversations", cid);

    let unsubMsgs = null;
    (async () => {
      // **garantizamos** que la conversación exista antes de escuchar/escribir
      await setDoc(
        cref,
        {
          tripId: selectedTripId,
          participants: [user.uid, activePeerUid].sort(),
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
        },
        { merge: true }
      );

      const qy = query(
        collection(db, "conversations", cid, "messages"),
        orderBy("createdAt", "asc")
      );
      unsubMsgs = onSnapshot(
        qy,
        (snap) => {
          setMsgs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
        },
        (e) => {
          console.error(e);
          error("No se pudieron cargar los mensajes (permisos)");
        }
      );
    })();

    return () => {
      unsubMsgs?.();
    };
  }, [selectedTripId, user?.uid, activePeerUid, error]);

  const activePeer = activePeerUid ? profiles[activePeerUid] : null;

  const send = async () => {
    try {
      if (!user || !selectedTripId || !activePeerUid) return;
      const t = String(text || "").trim();
      if (!t) return;

      const cid = convIdForTrip(selectedTripId, user.uid, activePeerUid);
      const cref = doc(db, "conversations", cid);

      // asegurar doc padre (evita permission-denied en rules)
      await setDoc(
        cref,
        {
          tripId: selectedTripId,
          participants: [user.uid, activePeerUid].sort(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "conversations", cid, "messages"), {
        text: t,
        senderUid: user.uid,
        createdAt: serverTimestamp(),
      });

      // meta para el preview
      await setDoc(
        cref,
        { lastMessage: t, lastMessageAt: serverTimestamp() },
        { merge: true }
      );

      setText("");
    } catch (e) {
      console.error(e);
      error(
        e?.code === "permission-denied"
          ? "No tenés permisos para enviar en esta conversación"
          : "No se pudo enviar el mensaje"
      );
    }
  };

  // --------- memos para UI ---------
  const sortedTrips = useMemo(() => {
    const withKey = myTrips.map((t) => ({
      ...t,
      _k: tsMillis(t?.datetime || t?.date),
    }));
    return withKey.sort((a, b) => b._k - a._k);
  }, [myTrips]);

  const selectedTrip = useMemo(
    () => sortedTrips.find((t) => t.id === selectedTripId) || null,
    [sortedTrips, selectedTripId]
  );

  // helpers UI
  const convKeyFor = (peerUid) =>
    convIdForTrip(selectedTripId || "?", user?.uid || "?", peerUid || "?");
  const lastMetaFor = (peerUid) => convMeta[convKeyFor(peerUid)] || {};
  const lastLineFor = (peerUid) => {
    const meta = lastMetaFor(peerUid);
    const hh = meta?.lastMessageAt ? dayjs(tsMillis(meta.lastMessageAt)).format("HH:mm") : "";
    const txt = meta?.lastMessage || "";
    return { hh, txt };
  };

  return (
    <section className="max-w-5xl mx-auto px-3 py-6 grid md:grid-cols-[320px,1fr] gap-3">
      {/* Columna izquierda */}
      <div className="bg-white rounded-2xl p-3 border h-[70vh] flex flex-col">
        <div className="font-medium mb-2">Mensajes por viaje</div>

        {/* selector de viaje */}
        <label className="block mb-2">
          <span className="text-xs text-neutral-600">Elegí un viaje</span>
          <select
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
            className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm"
          >
            <option value="">— Seleccionar —</option>
            {sortedTrips.map((t) => (
              <option key={t.id} value={t.id}>
                {tripLabel(t)}
              </option>
            ))}
          </select>
        </label>

        {/* contactos */}
        <div className="mt-2 font-medium text-sm">Contactos</div>
        <div className="mt-1 flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {selectedTripId && contacts.length === 0 && (
              <li className="text-xs text-neutral-500 px-1 py-1">
                {isDriver ? "Este viaje no tiene pasajeros aún." : "No hay contacto disponible."}
              </li>
            )}
            {contacts.map(({ uid }) => {
              const p = profiles[uid] || { id: uid };
              const isActive = activePeerUid === uid;
              const { hh, txt } = lastLineFor(uid);
              return (
                <li key={uid}>
                  <button
                    onClick={() => setActivePeerUid(uid)}
                    className={[
                      "w-full text-left rounded-xl border px-3 py-2 text-sm flex items-center gap-3",
                      isActive ? "bg-cyan-50 border-cyan-200" : "",
                    ].join(" ")}
                  >
                    <img
                      src={p?.photoURL || "/user.png"}
                      alt=""
                      className="h-8 w-8 rounded-full border object-cover"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        {p?.displayName || p?.email || p?.id || "Usuario"}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">
                        {txt || "Sin mensajes"}
                      </div>
                    </div>
                    <div className="text-[10px] text-neutral-400">{hh}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Columna derecha: chat */}
      <div className="bg-white rounded-2xl border h-[70vh] flex flex-col">
        {/* header */}
        {selectedTripId && activePeer ? (
          <div className="p-3 border-b flex items-center gap-3">
            <img
              src={activePeer?.photoURL || "/user.png"}
              alt=""
              className="h-9 w-9 rounded-full border object-cover"
            />
            <div className="flex-1">
              <div className="font-medium">
                {activePeer?.displayName || activePeer?.email || "Usuario"}
              </div>
              <div className="text-xs text-neutral-500">{activePeer?.id || ""}</div>
            </div>
            {selectedTrip && (
              <div className="text-xs text-neutral-500">{tripLabel(selectedTrip)}</div>
            )}
          </div>
        ) : (
          <div className="p-3 border-b text-sm text-neutral-500">
            Elegí un viaje y luego un contacto.
          </div>
        )}

        {/* mensajes */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {selectedTripId &&
            activePeerUid &&
            msgs.map((m) => (
              <div key={m.id} className="flex">
                <div
                  className={[
                    "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                    m.senderUid === user?.uid
                      ? "ml-auto bg-cyan-100"
                      : "bg-neutral-100",
                  ].join(" ")}
                >
                  {m.text}
                </div>
              </div>
            ))}
          <div ref={bottomRef} />
        </div>

        {/* input */}
        <div className="p-3 border-t flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 rounded-2xl border px-3 py-2"
            placeholder="Escribí un mensaje…"
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={!selectedTripId || !activePeerUid}
          />
          <button
            onClick={send}
            className="rounded-2xl border px-3 py-2"
            disabled={!selectedTripId || !activePeerUid || !text.trim()}
          >
            Enviar
          </button>
        </div>
      </div>
    </section>
  );
}
