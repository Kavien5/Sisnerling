import React from "react";

const ICONS = {
  user: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  eyeOff: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
};

export default function AuthField({ label, icon = "user", type = "text", value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = React.useState(false);
  const isPw = type === "password";
  const inputType = isPw && show ? "text" : type;

  return (
    <div className="form-group">
      <label>{label}</label>
      <div className={`auth-input${isPw ? " has-eye" : ""}`}>
        <span className="auth-icon">{ICONS[icon] || ICONS.user}</span>
        <input
          className="form-control"
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        {isPw && (
          <button
            type="button"
            className="auth-eye"
            aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
            title={show ? "Sembunyikan" : "Tampilkan"}
            onClick={() => setShow((s) => !s)}
          >
            {show ? ICONS.eyeOff : ICONS.eye}
          </button>
        )}
      </div>
    </div>
  );
}