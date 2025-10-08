import { useState } from "react";
import dayjs from "dayjs";
import useDriverRating from "../hooks/useDriverRating";

export default function DriverCard({ trip, onReserve }) {
  const [showPhoto, setShowPhoto] = useState(false);
  const [showCar, setShowCar] = useState(false);

  const {
    driver: { displayName, photoURL } = {},
    vehiclePhotoURL,
    origin, destination, datetime, price, seatsAvailable,
    ownerUid,
  } = trip || {};

  const { avg, count } = useDriverRating(ownerUid);

  const dts = trip?.datetime?.seconds
    ? dayjs(trip.datetime.seconds * 1000)
    : dayjs(trip?.datetime);

  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border">
      <div className="flex items-center gap-3">
        <img
          src={photoURL || "/user.png"}
          alt={displayName || "Chofer"}
          className="h-12 w-12 rounded-full object-cover border cursor-zoom-in"
          onClick={() => setShowPhoto(true)}
        />
        <div className="text-sm">
          <div className="font-medium">{displayName || "Chofer"}</div>
          <div className="text-neutral-500">{dts.isValid() ? dts.format("DD/MM HH:mm") : ""} • ${price}</div>
        </div>
        <div className="ml-auto text-right text-xs">
          {avg != null ? (
            <div>⭐ {avg.toFixed(1)} ({count})</div>
          ) : (
            <div className="text-neutral-400">Sin calificaciones</div>
          )}
          <div className="mt-1 bg-vc_primary/60 rounded-xl px-2 py-1 inline-block">{seatsAvailable} lugares</div>
        </div>
      </div>
      <div className="mt-2 text-sm text-neutral-700">
        {origin?.label} → {destination?.label}
      </div>
      {vehiclePhotoURL && (
        <img
          src={vehiclePhotoURL}
          alt="Vehículo"
          className="mt-2 h-28 w-full object-cover rounded-xl cursor-zoom-in"
          onClick={() => setShowCar(true)}
        />
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onReserve}
          className="flex-1 rounded-2xl bg-vc_accent px-3 py-2 text-sm font-medium"
        >Reservar</button>
      </div>

      {showPhoto && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center" onClick={() => setShowPhoto(false)}>
          <img src={photoURL} className="max-h-[80vh] max-w-[90vw] rounded-xl" />
        </div>
      )}
      {showCar && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center" onClick={() => setShowCar(false)}>
          <img src={vehiclePhotoURL} className="max-h-[80vh] max-w-[90vw] rounded-xl" />
        </div>
      )}
    </div>
  );
}
