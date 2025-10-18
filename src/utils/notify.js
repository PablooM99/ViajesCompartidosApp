// src/utils/notify.js
export async function ensureNotifPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
      const perm = await Notification.requestPermission();
      return perm === "granted";
    } catch {
      return false;
    }
  }
  
  export function showMessageNotif({ title, body, icon = "/icon-192.png", url = "/mensajes" }) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
  
    // Evitar spamear mientras el tab está activo sobre el chat abierto
    const isHidden = document.visibilityState === "hidden";
    if (!isHidden) return;
  
    const n = new Notification(title || "Nuevo mensaje", {
      body: body || "",
      icon,
      data: { url },
      tag: "viajes-compartidos-msg", // agrupa
      renotify: true,
    });
    n.onclick = () => {
      try {
        // abrir/ir a la URL asociada al chat
        window.focus();
        if (n?.data?.url) window.location.assign(n.data.url);
        n.close();
      } catch {}
    };
  }
  