import React from "react";

export default function TimberLogo({ size = 20, className = "" }) {
  const uid = React.useId().replace(/:/g, "");
  const bark = `timber-bark-${uid}`;
  const cut = `timber-cut-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label="Logo kayu LK Timber"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={bark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a16207" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <linearGradient id={cut} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <g transform="rotate(-10 12 12)">
        <rect x="3" y="6.5" width="17.5" height="6.5" rx="3.25" fill={`url(#${bark})`} />
        <ellipse cx="5.6" cy="9.75" rx="2.6" ry="3.25" fill={`url(#${cut})`} stroke="#78350f" strokeWidth="0.7" />
        <ellipse cx="5.6" cy="9.75" rx="1.3" ry="1.7" fill="none" stroke="#92400e" strokeWidth="0.6" />
      </g>
      <g transform="rotate(9 12 12)">
        <rect x="3.5" y="12.5" width="17.5" height="6.5" rx="3.25" fill={`url(#${bark})`} />
        <ellipse cx="6" cy="15.75" rx="2.6" ry="3.25" fill={`url(#${cut})`} stroke="#78350f" strokeWidth="0.7" />
        <ellipse cx="6" cy="15.75" rx="1.3" ry="1.7" fill="none" stroke="#92400e" strokeWidth="0.6" />
      </g>
      <path d="M18.5 6.2c-.2-2 1-3.4 2.8-3.8.3 2-.9 3.4-2.8 3.8Z" fill="#22c55e" />
      <path d="M18.5 6.2c.6-1.5 1.6-2.5 2.8-3.8" stroke="#15803d" strokeWidth="0.7" strokeLinecap="round" />
    </svg>
  );
}
