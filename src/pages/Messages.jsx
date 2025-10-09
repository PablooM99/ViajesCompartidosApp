import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { addDoc, arrayUnion, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { useSearchParams } from "react-router-dom";

function convIdFor(u1, u2) {
  const [a, b] = [String(u1), String(u2)].sort();
  return `${a}__${b}`;
}

export default function Messages() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const toUid = params.get("to") || "";
  const [activeId, setActiveId] = useState(null);
  const [list, setList] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  // Carga conversaciones del usuario
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "conversations"),
      where("participants", "array-contains", user.uid),
      orderBy("lastMessageAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user?.uid]);

  // Autocrear/abrir conversación si viene ?to=uid
  useEffect(() => {
    (async () => {
      if (!user || !toUid) return;
      const cid = convIdFor(user.uid, toUid);
      const cref = doc(db, "conversations", cid);
      const csnap = await getDoc(cref);
      if (!csnap.exists()) {
        await setDoc(cref, {
          participants: [user.uid, toUid].sort(),
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
        }, { merge: true });
      }
      setActiveId(cid);
    })();
  }, [toUid, user?.uid]);

  // Escucha mensajes de la activa
  useEffect(() => {
    if (!activeId) { setMsgs([]); return; }
    const q = query(collection(db, "conversations", activeId, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    });
    return () => unsub();
  }, [activeId]);

  const send = async () => {
    if (!user || !activeId) return;
    const t = String(text || "").trim();
    if (!t) return;
    await addDoc(collection(db, "conversations", activeId, "messages"), {
      text: t,
      senderUid: user.uid,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, "conversations", activeId), { lastMessageAt: serverTimestamp() }, { merge: true });
    setText("");
  };

  return (
    <section className="max-w-5xl mx-auto px-3 py-6 grid md:grid-cols-[280px,1fr] gap-3">
      <div className="bg-white rounded-2xl p-3 border h-[70vh] overflow-y-auto">
        <div className="font-medium mb-2">Conversaciones</div>
        <ul className="space-y-1">
          {list.map(c => (
            <li key={c.id}>
              <button
                onClick={() => setActiveId(c.id)}
                className={[
                  "w-full text-left rounded-xl border px-3 py-2 text-sm",
                  activeId === c.id ? "bg-cyan-50 border-cyan-200" : ""
                ].join(" ")}
              >
                {c.id.replaceAll("__", " · ")}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="text-sm text-neutral-500">Sin conversaciones.</li>}
        </ul>
      </div>

      <div className="bg-white rounded-2xl p-3 border h-[70vh] flex flex-col">
        {!activeId ? (
          <div className="text-sm text-neutral-500">Elegí una conversación.</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-2">
              {msgs.map(m => (
                <div key={m.id} className="flex">
                  <div
                    className={[
                      "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                      m.senderUid === user?.uid ? "ml-auto bg-cyan-100" : "bg-neutral-100"
                    ].join(" ")}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="mt-2 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="flex-1 rounded-2xl border px-3 py-2"
                placeholder="Escribí un mensaje…"
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button onClick={send} className="rounded-2xl border px-3 py-2">Enviar</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
