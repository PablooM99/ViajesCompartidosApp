const DAYS = [
    { v: 1, label: "Lu" }, { v: 2, label: "Ma" }, { v: 3, label: "Mi" },
    { v: 4, label: "Ju" }, { v: 5, label: "Vi" }, { v: 6, label: "Sa" }, { v: 0, label: "Do" },
  ];
  export default function WeekdayToggle({ value = [], onChange }) {
    const toggle = (v) => {
      const set = new Set(value);
      set.has(v) ? set.delete(v) : set.add(v);
      onChange(Array.from(set).sort((a,b)=>a-b));
    };
    return (
      <div className="flex flex-wrap gap-2">
        {DAYS.map(d => (
          <button
            type="button"
            key={d.v}
            onClick={() => toggle(d.v)}
            className={`px-3 py-1 rounded-2xl border ${value.includes(d.v) ? 'bg-vc_primary' : 'bg-white'}`}
          >{d.label}</button>
        ))}
      </div>
    );
  }
  