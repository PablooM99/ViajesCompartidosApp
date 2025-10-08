export default function Select({ label, value, onChange, options }) {
    return (
      <label className="block">
        <span className="text-xs text-neutral-600">{label}</span>
        <select
          className="mt-1 w-full rounded-2xl border bg-white px-3 py-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Seleccionar…</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
    );
  }
  