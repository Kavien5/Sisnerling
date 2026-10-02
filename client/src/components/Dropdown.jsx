import React from "react";

export default function Dropdown({ value, onChange, options = [], placeholder = "Pilih...", disabled, className = "", style }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => String(o.value) === String(value));

  const pick = (o) => {
    if (disabled || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`dd ${className}`.trim()} style={style}>
      <button
        type="button"
        className={`dd-btn form-control ${open ? "open" : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`dd-label ${selected ? "" : "placeholder"}`}>{selected ? selected.label : placeholder}</span>
        <span className={`dd-caret ${open ? "open" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="dd-menu" role="listbox">
          {options.length === 0 && <div className="dd-empty">Tidak ada opsi</div>}
          {options.map((o) => (
            <button
              type="button"
              key={String(o.value)}
              className={`dd-opt ${String(o.value) === String(value) ? "selected" : ""} ${o.disabled ? "disabled" : ""}`}
              disabled={o.disabled}
              onClick={() => pick(o)}
              role="option"
              aria-selected={String(o.value) === String(value)}
            >
              <span className="dd-opt-label">{o.label}</span>
              {String(o.value) === String(value) && <span className="dd-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}