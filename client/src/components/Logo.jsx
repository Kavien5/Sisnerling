import React from "react";

// Logo SISNERLING: bidang membulat gradasi biru->hijau berisi tunas dua daun
// (lingkungan) yang tumbuh dari satu batang.
export default function Logo({ size = 40, className = "" }) {
  const uid = React.useId().replace(/:/g, "");
  const grad = `sn-grad-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Logo Sisnerling"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${grad})`} />
      <path
        d="M32 34C32 22 42 12 54 12 54 24 44 34 32 34Z"
        fill="#ffffff"
      />
      <path
        d="M30 40C30 31 22 23 12 23 12 32 20 40 30 40Z"
        fill="#ffffff"
        opacity="0.88"
      />
      <path
        d="M33 33 52 13"
        stroke="#047857"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.32"
      />
      <path
        d="M29 39 15 25"
        stroke="#047857"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.28"
      />
      <rect x="29.5" y="32" width="5" height="22" rx="2.5" fill="#ffffff" />
    </svg>
  );
}
