export default function StarRating({ value = 0, onChange, size = "text-lg" }) {
    const stars = [1,2,3,4,5];
    return (
      <div className={`flex items-center gap-1 ${size}`}>
        {stars.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => onChange?.(s)}
            className={s <= value ? "text-yellow-500" : "text-neutral-300"}
            aria-label={`${s} estrellas`}
          >★</button>
        ))}
      </div>
    );
  }
  