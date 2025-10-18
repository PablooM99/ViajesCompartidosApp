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
function threadIdFor(u1, u2) {
  const [a, b] = [String(u1), String(u2)].sort();
  return `${a}__${b}`;
}
function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function tsMillis(x) {
  if (!x) return 0;
  if (typeof x.toMillis === "function") return x.toMillis();
  if (x?.seconds) return x.seconds * 1000;
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
  const { error } = useToast();
  const { /* role, */ canPublish } = useRole(user?.uid); // lo seguimos leyendo por si lo usás en otras partes

  // selector de viaje
  const [myTrips, setMyTrips] = useState([]);     // unión: owned ∪ booked
  const [selectedTripId, setSelectedTripId] = useState("");

  // contactos de ese viaje
  const [contacts, setContacts] = useState([]);   // [{uid}]
  const [profiles, setProfiles] = useState({});   // { uid: {id, displayName, photoURL, email} }

  // meta (preview) por thread
  const [convMeta, setConvMeta] = useState({});   // { "<tripId>__<tid>": { lastMessage, lastMessageAt } }
  const convMetaUnsubsRef = useRef({});

  // chat
  const [activePeerUid, setActivePeerUid] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  // ---------- cargar owned ∪ booked ----------
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const all = {};
        // 1) Viajes que posee (owner)
        {
          const qOwn = query(
            collection(db, "trips"),
            where("ownerUid", "==", user.uid),
            orderBy("datetime", "desc")
          );
          const snap = await getDocs(qOwn);
          snap.docs.forEach(d => { all[d.id] = { id: d.id, ...d.data() }; });
        }

        // 2) Viajes que reservó (collectionGroup bookings)
        {
          const qBooked = query(
            collectionGroup(db, "bookings"),
            where("uid", "==", user.uid),
            orderBy("createdAt", "desc")
          );
          const bsnap = await getDocs(qBooked);
          const tripIds = Array.from(new Set(
            bsnap.docs
              .map(bd => bd.ref.path.split("/")[1]) // trips/{tripId}/bookings/{bookingId}
              .filter(Boolean)
          ));

          for (const tid of tripIds) {
            if (!all[tid]) {
              const tsnap = await getDoc(doc(db, "trips", tid));
              if (tsnap.exists()) all[tid] = { id: tid, ...tsnap.data() };
            }
          }
        }

        const unified = Object.values(all)
          .map(t => ({ ...t, _k: tsMillis(t?.datetime || t?.date) }))
          .sort((a, b) => b._k - a._k);
        setMyTrips(unified);
      } catch (e) {
        console.error(e);
        error("No se pudieron cargar tus viajes para mensajería");
      }
    })();
  }, [user?.uid, error]);

  // ---------- al elegir viaje: contactos y perfiles ----------
  useEffect(() => {
    // limpiar listeners meta
    Object.values(convMetaUnsubsRef.current).forEach(fn => fn?.());
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
        if (!tSnap.exists()) { setContacts([]); return; }
        const trip = { id: selectedTripId, ...tSnap.data() };

        const isOwner = trip.ownerUid === user.uid;

        if (isOwner) {
          // soy el chofer de este viaje → contactos = pasajeros
          const bs = await getDocs(collection(db, "trips", selectedTripId, "bookings"));
          const uids = Array.from(new Set(bs.docs.map(d => d.data()?.uid).filter(u => !!u && u !== user.uid)));
          setContacts(uids.map(uid => ({ uid })));
          await fetchProfiles(uids);
          wireConvMeta(selectedTripId, [user.uid, ...uids]);
        } else {
          // soy pasajero en este viaje (aunque mi rol sea driver/admin) → contacto = chofer
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
  }, [selectedTripId, user?.uid]);

  // carga perfiles faltantes (batch de 10)
  const fetchProfiles = async (uids) => {
    const toFetch = (uids || []).filter(u => u && !profiles[u]);
    if (toFetch.length === 0) return;
    try {
      for (const batch of chunk(toFetch, 10)) {
        const qy = query(collection(db, "users"), where(documentId(), "in", batch));
        const snap = await getDocs(qy);
        const updates = {};
        snap.docs.forEach(d => (updates[d.id] = { id: d.id, ...(d.data() || {}) }));
        for (const u of batch) if (!updates[u]) updates[u] = { id: u };
        setProfiles(prev => ({ ...prev, ...updates }));
      }
    } catch (e) {
      console.warn("No se pudieron cargar algunos perfiles:", e?.message || e);
    }
  };

  // escuchar meta (lastMessage / lastMessageAt) por contacto para el viaje
  const wireConvMeta = (tripId, uids) => {
    const me = user?.uid;
    (uids || []).filter(u => u && u !== me).forEach(peerUid => {
      const tid = threadIdFor(me, peerUid);
      const tref = doc(db, "tripConversations", tripId, "threads", tid);
      const key = `${tripId}__${tid}`;
      const unsub = onSnapshot(
        tref,
        (snap) => {
          if (!snap.exists()) {
            setConvMeta(m => {
              const copy = { ...m };
              delete copy[key];
              return copy;
            });
          } else {
            const data = snap.data() || {};
            setConvMeta(m => ({
              ...m,
              [key]: {
                lastMessage: data.lastMessage || "",
                lastMessageAt: data.lastMessageAt || null,
              },
            }));
          }
        },
        () => {}
      );
      convMetaUnsubsRef.current[key] = unsub;
    });
  };

  // abrir/crear conversación y escuchar mensajes (tripConversations)
  useEffect(() => {
    if (!selectedTripId || !user || !activePeerUid) return;

    const tid = threadIdFor(user.uid, activePeerUid);
    const threadRef = doc(db, "tripConversations", selectedTripId, "threads", tid);

    let unsubMsgs = null;
    (async () => {
      // Garantiza el thread (padre)
      await setDoc(
        threadRef,
        {
          participants: [user.uid, activePeerUid].sort(),
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
        },
        { merge: true }
      );

      const qy = query(
        collection(db, "tripConversations", selectedTripId, "threads", tid, "messages"),
        orderBy("createdAt", "asc")
      );
      unsubMsgs = onSnapshot(
        qy,
        (snap) => {
          setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
        },
        (e) => {
          console.error(e);
          error("No se pudieron cargar los mensajes (permisos)");
        }
      );
    })();

    return () => { unsubMsgs?.(); };
  }, [selectedTripId, user?.uid, activePeerUid, error]);

  const activePeer = activePeerUid ? profiles[activePeerUid] : null;

  const send = async () => {
    try {
      if (!user || !selectedTripId || !activePeerUid) return;
      const t = String(text || "").trim();
      if (!t) return;

      const tid = threadIdFor(user.uid, activePeerUid);
      const threadRef = doc(db, "tripConversations", selectedTripId, "threads", tid);

      await setDoc(
        threadRef,
        { participants: [user.uid, activePeerUid].sort(), createdAt: serverTimestamp() },
        { merge: true }
      );

      await addDoc(
        collection(db, "tripConversations", selectedTripId, "threads", tid, "messages"),
        { text: t, senderUid: user.uid, createdAt: serverTimestamp() }
      );

      await setDoc(
        threadRef,
        { lastMessage: t, lastMessageAt: serverTimestamp() },
        { merge: true }
      );

      setText("");
    } catch (e) {
      console.error(e);
      error(e?.code === "permission-denied"
        ? "No tenés permisos para enviar en esta conversación"
        : "No se pudo enviar el mensaje");
    }
  };

  // --------- memos para UI ---------
  const sortedTrips = useMemo(() => {
    const withKey = myTrips.map(t => ({ ...t, _k: tsMillis(t?.datetime || t?.date) }));
    return withKey.sort((a, b) => b._k - a._k);
  }, [myTrips]);

  const selectedTrip = useMemo(
    () => sortedTrips.find(t => t.id === selectedTripId) || null,
    [sortedTrips, selectedTripId]
  );

  const metaKeyFor = (peerUid) =>
    `${selectedTripId || "?"}__${threadIdFor(user?.uid || "?", peerUid || "?")}`;
  const lastMetaFor = (peerUid) => convMeta[metaKeyFor(peerUid)] || {};
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
                No hay contactos disponibles en este viaje.
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
        {selectedTripId && activePeerUid ? (
          <div className="p-3 border-b flex items-center gap-3">
            <img
              src={(profiles[activePeerUid]?.photoURL) || "/user.png"}
              alt=""
              className="h-9 w-9 rounded-full border object-cover"
            />
            <div className="flex-1">
              <div className="font-medium">
                {profiles[activePeerUid]?.displayName || profiles[activePeerUid]?.email || "Usuario"}
              </div>
              <div className="text-xs text-neutral-500">{activePeerUid}</div>
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
          {selectedTripId && activePeerUid && msgs.map((m) => (
            <div key={m.id} className="flex">
              <div
                className={[
                  "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                  m.senderUid === user?.uid ? "ml-auto bg-cyan-100" : "bg-neutral-100",
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
