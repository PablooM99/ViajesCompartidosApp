import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
dayjs.extend(utc); dayjs.extend(timezone);
const TZ = "America/Argentina/Buenos_Aires";

/** Helpers **/
function tripDocId({ ownerUid, originId, destinationId, date, time }) {
  const hhmm = time.replace(":", "");
  return `${ownerUid}_${originId}_${destinationId}_${date}_${hhmm}`;
}
async function getUserMini(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return { displayName: "Chofer", photoURL: null };
  const u = snap.data();
  return { displayName: u.displayName || "Chofer", photoURL: u.photoURL || null };
}
async function generateTripsForRule(rule, horizonDays = 30) {
  const {
    ownerUid, originId, destinationId, weekdays, time,
    price, seats, vehiclePhotoURL = null, startDate, endDate, active
  } = rule;
  if (!active) return { created: 0, skipped: 0 };
  const userMini = await getUserMini(ownerUid);

  const start = dayjs.tz(startDate, TZ).startOf("day");
  const hardEnd = endDate ? dayjs.tz(endDate, TZ).endOf("day") : start.add(horizonDays, "day");
  const horizonEnd = dayjs.tz().add(horizonDays, "day").endOf("day");
  const until = hardEnd.isBefore(horizonEnd) ? hardEnd : horizonEnd;

  let created = 0, skipped = 0;
  const batch = db.batch();

  for (let d = start; d.isBefore(until) || d.isSame(until, "day"); d = d.add(1, "day")) {
    const weekday = d.day(); // 0=Dom..6=Sab
    if (!weekdays.includes(weekday)) continue;

    const dateStr = d.format("YYYY-MM-DD");
    const [hh, mm] = time.split(":");
    const ts = dayjs.tz(`${dateStr} ${hh}:${mm}`, "YYYY-MM-DD HH:mm", TZ).toDate();

    const id = tripDocId({ ownerUid, originId, destinationId, date: dateStr, time });
    const tripRef = db.collection("trips").doc(id);

    try {
      batch.create(tripRef, {
        ownerUid,
        originId, destinationId,
        date: dateStr,
        datetime: ts,
        price: Number(price),
        seatsTotal: Number(seats),
        seatsAvailable: Number(seats),
        driver: userMini,
        vehiclePhotoURL: vehiclePhotoURL || null,
        tripKey: id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created++;
    } catch {
      skipped++;
    }
  }

  if (created > 0) await batch.commit();
  return { created, skipped };
}

async function getUserTokens(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return [];
  const data = snap.data();
  const fcmTokens = data.fcmTokens || {};
  return Object.keys(fcmTokens);
}
async function sendPushToTokens(tokens, notification, data = {}) {
  if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0 };
  const message = {
    tokens,
    notification: {
      title: notification.title || 'ViajesCompartidos',
      body: notification.body || '',
      icon: notification.icon || undefined,
    },
    webpush: { fcmOptions: { link: notification.click_action || '/' } },
    data: Object.fromEntries(Object.entries(data).map(([k,v]) => [String(k), String(v)])),
  };
  const res = await admin.messaging().sendEachForMulticast(message);
  return { successCount: res.successCount, failureCount: res.failureCount };
}
async function sendPushToUser(uid, notification, data = {}) {
  const tokens = await getUserTokens(uid);
  return sendPushToTokens(tokens, notification, data);
}
async function notifyRouteFollowers(originId, destinationId, summary = '') {
  const q = await db.collectionGroup('alerts')
    .where('originId', '==', originId)
    .where('destinationId', '==', destinationId)
    .where('active', '==', true).get();
  const byUser = new Map();
  q.forEach(doc => {
    const uid = doc.ref.path.split('/')[1]; // users/{uid}/alerts/{key}
    byUser.set(uid, true);
  });
  const uids = Array.from(byUser.keys());
  const notif = {
    title: 'Nuevos viajes disponibles',
    body: `${originId} → ${destinationId}. ${summary}`.trim(),
    click_action: '/',
  };
  let totalSuccess = 0;
  for (const uid of uids) {
    const res = await sendPushToUser(uid, notif, { originId, destinationId, kind: 'route_new_trips' });
    totalSuccess += res.successCount;
  }
  return { totalSuccess, usersNotified: uids.length };
}

/** Functions: Reservas seguras **/
export const reserveSeats = onCall(async (request) => {
  const auth = request.auth;
  const { tripId, seats } = request.data || {};
  if (!auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión");
  const uid = auth.uid;
  const seatsNum = Number(seats || 1);
  if (!tripId || !Number.isInteger(seatsNum) || seatsNum < 1 || seatsNum > 6) {
    throw new HttpsError("invalid-argument", "Parámetros inválidos");
  }
  const tripRef = db.collection("trips").doc(tripId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(tripRef);
    if (!snap.exists) throw new HttpsError("not-found", "Viaje no encontrado");
    const data = snap.data();

    const now = admin.firestore.Timestamp.now();
    if (data.datetime && data.datetime.toMillis && data.datetime.toMillis() < now.toMillis()) {
      throw new HttpsError("failed-precondition", "El viaje ya ocurrió");
    }
    if (data.seatsAvailable < seatsNum) {
      throw new HttpsError("failed-precondition", "No hay cupos suficientes");
    }

    tx.update(tripRef, {
      seatsAvailable: admin.firestore.FieldValue.increment(-seatsNum),
    });

    const bookingRef = tripRef.collection("bookings").doc();
    tx.set(bookingRef, {
      uid,
      seats: seatsNum,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { bookingId: bookingRef.id, seats: seatsNum };
  });

  try {
    const tripSnap = await db.collection('trips').doc(tripId).get();
    const trip = tripSnap.data();
    const driverUid = trip.ownerUid;

    await sendPushToUser(driverUid, {
      title: 'Nueva reserva',
      body: `${auth.token.name || 'Pasajero'} reservó ${seatsNum} lugar(es).`,
      click_action: '/dashboard'
    }, { kind: 'booking_created', tripId });

    await sendPushToUser(uid, {
      title: 'Reserva confirmada',
      body: `Tu reserva de ${seatsNum} lugar(es) fue registrada.`,
      click_action: '/dashboard'
    }, { kind: 'booking_ok', tripId });
  } catch (e) {}

  logger.info(`Reserva OK trip=${tripId} uid=${uid} seats=${seatsNum}`);
  return { ok: true, ...result };
});

export const cancelBooking = onCall(async (request) => {
  const auth = request.auth;
  const { tripId, bookingId } = request.data || {};
  if (!auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión");
  if (!tripId || !bookingId) throw new HttpsError("invalid-argument", "Faltan parámetros");

  const uid = auth.uid;
  const tripRef = db.collection("trips").doc(tripId);
  const bookingRef = tripRef.collection("bookings").doc(bookingId);

  await db.runTransaction(async (tx) => {
    const [tripSnap, bookingSnap] = await Promise.all([tx.get(tripRef), tx.get(bookingRef)]);
    if (!tripSnap.exists) throw new HttpsError("not-found", "Viaje no encontrado");
    if (!bookingSnap.exists) throw new HttpsError("not-found", "Reserva no encontrada");

    const booking = bookingSnap.data();
    if (booking.uid !== uid) throw new HttpsError("permission-denied", "No puedes cancelar esta reserva");

    tx.delete(bookingRef);
    tx.update(tripRef, {
      seatsAvailable: admin.firestore.FieldValue.increment(booking.seats || 1),
    });
  });

  try {
    const tripSnap = await db.collection('trips').doc(tripId).get();
    const trip = tripSnap.data();
    const driverUid = trip.ownerUid;
    await sendPushToUser(driverUid, {
      title: 'Reserva cancelada',
      body: `${auth.token.name || 'Pasajero'} canceló su reserva.`,
      click_action: '/dashboard'
    }, { kind: 'booking_canceled_by_user', tripId });
  } catch {}

  return { ok: true };
});

export const cancelBookingAsDriver = onCall(async (request) => {
  const auth = request.auth;
  const { tripId, bookingId } = request.data || {};
  if (!auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión");
  if (!tripId || !bookingId) throw new HttpsError("invalid-argument", "Faltan parámetros");

  const uid = auth.uid;
  const tripRef = db.collection("trips").doc(tripId);
  const bookingRef = tripRef.collection("bookings").doc(bookingId);

  await db.runTransaction(async (tx) => {
    const [tSnap, bSnap] = await Promise.all([tx.get(tripRef), tx.get(bookingRef)]);
    if (!tSnap.exists) throw new HttpsError("not-found", "Viaje no encontrado");
    if (!bSnap.exists) throw new HttpsError("not-found", "Reserva no encontrada");
    const trip = tSnap.data();
    const booking = bSnap.data();

    if (trip.ownerUid !== uid) throw new HttpsError("permission-denied", "No eres el dueño del viaje");

    tx.delete(bookingRef);
    tx.update(tripRef, { seatsAvailable: admin.firestore.FieldValue.increment(booking.seats || 1) });
  });

  try {
    const bSnap = await db.collection('trips').doc(tripId).collection('bookings').doc(bookingId).get();
    const booking = bSnap.data();
    if (booking?.uid) {
      await sendPushToUser(booking.uid, {
        title: 'Tu reserva fue cancelada',
        body: 'El chofer canceló tu reserva. Revisa otros viajes disponibles.',
        click_action: '/'
      }, { kind: 'booking_canceled_by_driver', tripId });
    }
  } catch {}

  return { ok: true };
});

/** Functions: Reglas (calendario) **/
export const createOrUpdateRule = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión");
  const uid = auth.uid;
  const payload = request.data || {};

  const required = ["originId", "destinationId", "weekdays", "time", "price", "seats", "startDate"];
  for (const k of required) if (payload[k] === undefined) throw new HttpsError("invalid-argument", `Falta ${k}`);

  const ruleId = payload.ruleId || db.collection("rules").doc().id;
  const ref = db.collection("rules").doc(ruleId);
  const data = {
    ownerUid: uid,
    originId: String(payload.originId),
    destinationId: String(payload.destinationId),
    weekdays: (payload.weekdays || []).map(Number),
    time: String(payload.time),
    price: Number(payload.price),
    seats: Number(payload.seats),
    vehiclePhotoURL: payload.vehiclePhotoURL || null,
    startDate: String(payload.startDate),
    endDate: payload.endDate ? String(payload.endDate) : null,
    active: payload.active !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await ref.set(data, { merge: true });
  const snap = await ref.get();
  const rule = snap.data();

  const result = await generateTripsForRule(rule, 30);

  if (result.created > 0) {
    try { await notifyRouteFollowers(rule.originId, rule.destinationId, `${result.created} nuevo(s) viaje(s)`); } catch {}
  }

  return { ok: true, ruleId, ...result };
});

export const generateForRuleId = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión");
  const { ruleId, horizonDays = 30 } = request.data || {};
  if (!ruleId) throw new HttpsError("invalid-argument", "Falta ruleId");

  const ref = db.collection("rules").doc(ruleId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Regla no encontrada");
  const rule = snap.data();
  if (rule.ownerUid !== auth.uid) throw new HttpsError("permission-denied", "No puedes generar esta regla");

  const result = await generateTripsForRule(rule, Number(horizonDays));
  return { ok: true, ...result };
});

export const extendAllRulesDaily = onSchedule({ schedule: "0 3 * * *", timeZone: TZ }, async () => {
  const q = await db.collection("rules").where("active", "==", true).get();
  let totalCreated = 0, totalSkipped = 0;
  for (const doc of q.docs) {
    const rule = doc.data();
    const { created, skipped } = await generateTripsForRule(rule, 30);
    totalCreated += created; totalSkipped += skipped;
    if (created > 0) {
      try { await notifyRouteFollowers(rule.originId, rule.destinationId, `${created} nuevo(s) viaje(s)`); } catch {}
    }
  }
  logger.info(`extendAllRulesDaily created=${totalCreated} skipped=${totalSkipped}`);
});

/** Functions: Reseñas **/
export const submitReview = onCall(async (request) => {
  const auth = request.auth;
  const { tripId, rating, comment } = request.data || {};
  if (!auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión");
  const uid = auth.uid;
  const r = Number(rating);
  if (!tripId || !Number.isInteger(r) || r < 1 || r > 5) {
    throw new HttpsError("invalid-argument", "Parámetros inválidos");
  }

  const tripRef = db.collection("trips").doc(tripId);
  await db.runTransaction(async (tx) => {
    const tSnap = await tx.get(tripRef);
    if (!tSnap.exists) throw new HttpsError("not-found", "Viaje no encontrado");
    const trip = tSnap.data();
    const driverUid = trip.ownerUid;

    const now = admin.firestore.Timestamp.now();
    if (trip.datetime && trip.datetime.toMillis && trip.datetime.toMillis() > now.toMillis()) {
      throw new HttpsError("failed-precondition", "Sólo se puede calificar tras el viaje");
    }
    const bookingsSnap = await tripRef.collection("bookings").where("uid", "==", uid).limit(1).get();
    if (bookingsSnap.empty) throw new HttpsError("permission-denied", "No tenés una reserva en este viaje");

    const revId = `${tripId}_${uid}`;
    const reviewRef = db.collection("drivers").doc(driverUid).collection("reviews").doc(revId);
    const rvSnap = await tx.get(reviewRef);
    if (rvSnap.exists) throw new HttpsError("already-exists", "Ya calificaste este viaje");

    tx.set(reviewRef, {
      tripId, driverUid, reviewerUid: uid,
      rating: r,
      comment: (comment || "").slice(0, 500),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const userRef = db.collection("users").doc(driverUid);
    const uSnap = await tx.get(userRef);
    const u = uSnap.exists ? uSnap.data() : {};
    const sum = Number(u.ratingSum || 0) + r;
    const count = Number(u.ratingCount || 0) + 1;
    tx.set(userRef, { ratingSum: sum, ratingCount: count }, { merge: true });
  });

  return { ok: true };
});
