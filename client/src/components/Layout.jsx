import React from "react";
import { api } from "../api.js";
import {
  IconDashboard,
  IconTag,
  IconMenu,
  IconX,
  IconFileText,
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconEdit,
  IconTrash,
  IconBox,
  IconCoins,
  IconLayers,
  IconDatabase,
  IconGrid,
  IconHistory,
  IconFileSpreadsheet,
  IconAlert,
} from "./Icons.jsx";
import Modal from "./Modal.jsx";
import ProfileModal from "./ProfileModal.jsx";
import { useToast } from "./Toast.jsx";
import { roleLabel, isSuperAdmin } from "../auth.js";

const NERACA_ICONS = {
  hutan: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 3L7 14h4L4 24h24l-7-10h4L16 3z" fill="#22c55e"/>
      <path d="M16 3L10 12h3L6 22" stroke="#15803d" strokeWidth="0.5" fill="none"/>
      <path d="M16 3L22 12h-3l7 10" stroke="#15803d" strokeWidth="0.5" fill="none"/>
      <path d="M9 18L12 14" stroke="#fff" strokeWidth="0.8" opacity="0.4"/>
      <path d="M20 18L18 14" stroke="#fff" strokeWidth="0.8" opacity="0.4"/>
      <rect x="14.5" y="24" width="3" height="5" rx="1" fill="#92400e"/>
      <ellipse cx="10" cy="20" rx="2" ry="1.5" fill="#4ade80" opacity="0.5"/>
      <ellipse cx="22" cy="17" rx="2" ry="1.5" fill="#4ade80" opacity="0.5"/>
    </svg>
  ),
  mineral: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,2 8,14 12,14 10,28 22,28 20,14 24,14" fill="#f59e0b"/>
      <polygon points="16,2 11,11 16,14 21,11" fill="#fbbf24"/>
      <polygon points="16,2 21,11 24,14 16,14" fill="#f97316" opacity="0.6"/>
      <polygon points="12,14 10,28 16,28 16,14" fill="#eab308" opacity="0.5"/>
      <polygon points="20,14 22,28 16,28 16,14" fill="#d97706" opacity="0.4"/>
      <circle cx="12" cy="18" r="1.5" fill="#fff" opacity="0.5"/>
      <circle cx="18" cy="20" r="1.2" fill="#fff" opacity="0.4"/>
      <circle cx="14" cy="24" r="1" fill="#fff" opacity="0.3"/>
      <line x1="16" y1="6" x2="13" y2="12" stroke="#fde68a" strokeWidth="0.8" opacity="0.6"/>
      <line x1="16" y1="6" x2="19" y2="12" stroke="#fde68a" strokeWidth="0.8" opacity="0.6"/>
    </svg>
  ),
  energi: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M18 3L6 17h7l-2 12 11-16h-7l2-10z" fill="#facc15"/>
      <path d="M18 3L9 16h5" stroke="#eab308" strokeWidth="0.5" fill="none"/>
      <path d="M18 3L15 13l2 7" stroke="#fff" strokeWidth="0.8" opacity="0.3"/>
      <path d="M12 29L16 20" stroke="#fde68a" strokeWidth="0.8" opacity="0.4"/>
      <circle cx="10" cy="12" r="0.8" fill="#fff" opacity="0.5"/>
      <circle cx="20" cy="10" r="0.6" fill="#fff" opacity="0.4"/>
    </svg>
  ),
  terintegrasi: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="5" r="4" fill="#818cf8"/>
      <circle cx="6" cy="25" r="4" fill="#818cf8"/>
      <circle cx="26" cy="25" r="4" fill="#818cf8"/>
      <circle cx="16" cy="5" r="2" fill="#c7d2fe"/>
      <circle cx="6" cy="25" r="2" fill="#c7d2fe"/>
      <circle cx="26" cy="25" r="2" fill="#c7d2fe"/>
      <line x1="16" y1="9" x2="8" y2="21" stroke="#6366f1" strokeWidth="1.5"/>
      <line x1="16" y1="9" x2="24" y2="21" stroke="#6366f1" strokeWidth="1.5"/>
      <line x1="10" y1="25" x2="22" y2="25" stroke="#6366f1" strokeWidth="1.5"/>
      <circle cx="12" cy="15" r="1.5" fill="#a5b4fc"/>
      <circle cx="20" cy="15" r="1.5" fill="#a5b4fc"/>
      <circle cx="16" cy="18" r="1.5" fill="#a5b4fc"/>
      <line x1="12" y1="15" x2="20" y2="15" stroke="#818cf8" strokeWidth="0.8"/>
      <line x1="12" y1="15" x2="16" y2="18" stroke="#818cf8" strokeWidth="0.8"/>
      <line x1="20" y1="15" x2="16" y2="18" stroke="#818cf8" strokeWidth="0.8"/>
    </svg>
  ),
  uang: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" fill="#fde68a" stroke="#f59e0b" strokeWidth="1.5"/>
      <circle cx="16" cy="16" r="10" stroke="#f59e0b" strokeWidth="0.8" fill="none"/>
      <text x="16" y="21" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#92400e">Rp</text>
      <circle cx="16" cy="16" r="1" fill="#f59e0b" opacity="0.6"/>
      <line x1="16" y1="3" x2="16" y2="6" stroke="#f59e0b" strokeWidth="1"/>
      <line x1="16" y1="26" x2="16" y2="29" stroke="#f59e0b" strokeWidth="1"/>
      <line x1="3" y1="16" x2="6" y2="16" stroke="#f59e0b" strokeWidth="1"/>
      <line x1="26" y1="16" x2="29" y2="16" stroke="#f59e0b" strokeWidth="1"/>
    </svg>
  ),
  default: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="24" height="24" rx="5" fill="#e0e7ff" stroke="#818cf8" strokeWidth="1.2"/>
      <path d="M10 11h12M10 16h12M10 21h8" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

const NERACA_ICON_MAP = [
  { pattern: /hutan|pohon|kayu|forest|primer|sekunder|konservasi|rimba|jati|tebu|pinus|mahoni|jati/i, icon: "hutan" },
  { pattern: /mineral|tambang|batu bara|ore|aset mineral|perak|emas|tembaga|nikel|timah|bauksite|platinum|krom/i, icon: "mineral" },
  { pattern: /energi|listrik|gas|minyak|bbm|oil|petroleum|solar|surya|angin|nuklir|panas bumi|geothermal/i, icon: "energi" },
  { pattern: /terintegrasi|terpadu|gabung|komposit|multi/i, icon: "terintegrasi" },
  { pattern: /keuangan|uang|kas|cash|moneter|monetary|piutang|utang|aset|neraca|Modal|laba|rugi|pendapatan|biaya|debet|kredit|investasi|aset/i, icon: "uang" },
  { pattern: /perkebunan|pertanian|agrikultur|sawit|kelapa|karet|kopi|teh|cengkeh|coklat|padi|jagung|kedelai/i, icon: "hutan" },
  { pattern: /perikanan|ikan|laut|lautan|pelabuhan|kapal|tangkap|udang/i, icon: "energi" },
  { pattern: /peternakan|sapi|ayam|kambing|babi|unggas|ternak/i, icon: "uang" },
  { pattern: /infrastruktur|jalan|jembatan|gedung|bangunan|proyek/i, icon: "terintegrasi" },
  { pattern: /teknologi|digital|sistem|komputer|software|hardware|jaringan|server/i, icon: "terintegrasi" },
  { pattern: /sdm|sumber daya manusia|karyawan|pegawai|personil|tenaga kerja/i, icon: "uang" },
  { pattern: /sdal|sumber daya alam|lingkungan|ekosistem|biodiversitas/i, icon: "hutan" },
];

const NERACA_BG = {
  hutan: "linear-gradient(135deg, #16a34a, #15803d)",
  mineral: "linear-gradient(135deg, #f59e0b, #d97706)",
  energi: "linear-gradient(135deg, #eab308, #ca8a04)",
  terintegrasi: "linear-gradient(135deg, #6366f1, #4f46e5)",
  uang: "linear-gradient(135deg, #f59e0b, #b45309)",
  default: "linear-gradient(135deg, #6366f1, #7c3aed)",
};

function getNeracaIcon(name) {
  if (!name) return "default";
  for (const rule of NERACA_ICON_MAP) {
    if (rule.pattern.test(name)) return rule.icon;
  }
  if (/aset|neraca|neraca/i.test(name)) return "uang";
  if (/fisik|physical/i.test(name)) return "mineral";
  return "default";
}

const SUB_ICONS = {
  oil: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M14 4h4v4h-4z" fill="#374151"/>
      <path d="M13 8h6v2h-6z" fill="#4b5563"/>
      <path d="M11 10h10c1 0 2 1 2 2v2c0 4-3 7-7 8-4-1-7-4-7-8v-2c0-1 1-2 2-2z" fill="#1e293b"/>
      <ellipse cx="16" cy="16" rx="5" ry="4" fill="#334155"/>
      <path d="M13 14c0-2 1.5-3 3-3s3 1 3 3" stroke="#64748b" strokeWidth="0.6" fill="none"/>
      <ellipse cx="14" cy="15" rx="1.2" ry="1.8" fill="#475569" opacity="0.6"/>
      <ellipse cx="18" cy="17" rx="1" ry="1.5" fill="#475569" opacity="0.5"/>
      <path d="M14 22v4M18 22v4" stroke="#1e293b" strokeWidth="1.5"/>
      <path d="M12 26h8" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="14" cy="14" r="0.6" fill="#94a3b8" opacity="0.4"/>
    </svg>
  ),
  gas: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="10" y="6" width="12" height="20" rx="6" fill="#0e7490"/>
      <rect x="10" y="6" width="12" height="20" rx="6" stroke="#06b6d4" strokeWidth="0.8" fill="none"/>
      <ellipse cx="16" cy="16" rx="5" ry="7" fill="#0891b2" opacity="0.6"/>
      <rect x="13" y="3" width="6" height="4" rx="2" fill="#155e75"/>
      <path d="M16 3V1" stroke="#155e75" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="14" cy="13" r="1" fill="#67e8f9" opacity="0.7"/>
      <circle cx="18" cy="15" r="0.8" fill="#67e8f9" opacity="0.5"/>
      <circle cx="15" cy="18" r="0.6" fill="#67e8f9" opacity="0.4"/>
      <path d="M8 18c-1.5 0-3 1.5-3 3" stroke="#0891b2" strokeWidth="1" strokeLinecap="round"/>
      <path d="M24 18c1.5 0 3 1.5 3 3" stroke="#0891b2" strokeWidth="1" strokeLinecap="round"/>
      <path d="M13 26v2M19 26v2" stroke="#0e7490" strokeWidth="1"/>
      <rect x="11" y="28" width="10" height="2" rx="1" fill="#155e75"/>
    </svg>
  ),
  mineral_lainnya: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,2 10,12 13,12 10,28 22,28 19,12 22,12" fill="#8b5cf6"/>
      <polygon points="16,2 12,10 16,12 20,10" fill="#a78bfa"/>
      <polygon points="16,2 20,10 22,12 16,12" fill="#7c3aed" opacity="0.7"/>
      <polygon points="13,12 10,28 16,28 16,12" fill="#7c3aed" opacity="0.4"/>
      <polygon points="19,12 22,28 16,28 16,12" fill="#6d28d9" opacity="0.4"/>
      <line x1="16" y1="6" x2="12" y2="11" stroke="#c4b5fd" strokeWidth="0.8" opacity="0.6"/>
      <line x1="16" y1="6" x2="20" y2="11" stroke="#c4b5fd" strokeWidth="0.8" opacity="0.6"/>
      <circle cx="13" cy="18" r="1.2" fill="#e9d5ff" opacity="0.5"/>
      <circle cx="19" cy="20" r="1" fill="#e9d5ff" opacity="0.4"/>
      <circle cx="15" cy="24" r="0.8" fill="#e9d5ff" opacity="0.3"/>
      <polygon points="14,8 16,6 18,8" fill="#c4b5fd" opacity="0.5"/>
    </svg>
  ),
  kas: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="8" width="24" height="18" rx="3" fill="#047857"/>
      <rect x="4" y="8" width="24" height="7" rx="3" fill="#065f46"/>
      <rect x="10" y="15" width="12" height="8" rx="2" fill="#d1fae5"/>
      <circle cx="16" cy="19" r="2.5" fill="#047857" stroke="#065f46" strokeWidth="0.5"/>
      <rect x="14.5" y="17.5" width="3" height="0.8" rx="0.4" fill="#d1fae5"/>
      <rect x="6" y="9.5" width="5" height="3" rx="1" fill="#34d399"/>
      <rect x="21" y="9.5" width="5" height="3" rx="1" fill="#34d399"/>
      <rect x="4" y="4" width="8" height="5" rx="1.5" fill="#10b981"/>
      <text x="8" y="8" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#fff">$</text>
    </svg>
  ),
  piutang: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="4" width="18" height="24" rx="2" fill="#1d4ed8"/>
      <rect x="5" y="4" width="18" height="6" rx="2" fill="#1e40af"/>
      <path d="M10 14h12M10 18h10M10 22h7" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="23" cy="22" r="5" fill="#16a34a"/>
      <path d="M21 22h4M23 20v4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="10" cy="7" r="1" fill="#60a5fa"/>
      <circle cx="14" cy="7" r="1" fill="#60a5fa"/>
      <circle cx="18" cy="7" r="1" fill="#60a5fa"/>
    </svg>
  ),
  persediaan: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M5 10l11-5 11 5v14l-11 5-11-5V10z" fill="#b45309" stroke="#92400e" strokeWidth="0.8"/>
      <path d="M5 10l11 5 11-5" stroke="#fbbf24" strokeWidth="0.8" fill="none"/>
      <line x1="16" y1="15" x2="16" y2="29" stroke="#92400e" strokeWidth="0.8"/>
      <rect x="10" y="13" width="3.5" height="4" rx="0.8" fill="#fde68a"/>
      <rect x="18" y="17" width="3.5" height="4" rx="0.8" fill="#fde68a"/>
      <rect x="11" y="14.5" width="1.5" height="1" rx="0.3" fill="#b45309" opacity="0.4"/>
      <rect x="19" y="18.5" width="1.5" height="1" rx="0.3" fill="#b45309" opacity="0.4"/>
      <rect x="12" y="21" width="3.5" height="3" rx="0.8" fill="#fbbf24" opacity="0.5"/>
    </svg>
  ),
  utang: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="4" width="18" height="24" rx="2" fill="#b91c1c"/>
      <rect x="5" y="4" width="18" height="6" rx="2" fill="#991b1b"/>
      <path d="M10 14h12M10 18h10M10 22h7" stroke="#fca5a5" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="23" cy="22" r="5" fill="#dc2626"/>
      <path d="M21 22h4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="10" cy="7" r="1" fill="#f87171"/>
      <circle cx="14" cy="7" r="1" fill="#f87171"/>
      <circle cx="18" cy="7" r="1" fill="#f87171"/>
    </svg>
  ),
  hutan_primer: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L8 12h4L6 22h20l-6-10h4L16 2z" fill="#15803d"/>
      <path d="M16 2L11 10h3L7 20" stroke="#166534" strokeWidth="0.6" fill="none"/>
      <path d="M16 2L21 10h-3l6 10" stroke="#166534" strokeWidth="0.6" fill="none"/>
      <path d="M10 16L13 12" stroke="#fff" strokeWidth="0.6" opacity="0.3"/>
      <path d="M22 15L19 12" stroke="#fff" strokeWidth="0.6" opacity="0.3"/>
      <rect x="14.5" y="22" width="3" height="6" rx="1" fill="#78350f"/>
      <circle cx="10" cy="18" r="3" fill="#22c55e" opacity="0.4"/>
      <circle cx="22" cy="16" r="3" fill="#22c55e" opacity="0.4"/>
      <circle cx="16" cy="12" r="2.5" fill="#4ade80" opacity="0.3"/>
      <circle cx="8" cy="20" r="2" fill="#16a34a" opacity="0.3"/>
      <circle cx="24" cy="20" r="2" fill="#16a34a" opacity="0.3"/>
    </svg>
  ),
  hutan_sekunder: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M10 6L5 14h3L3 22h12l-5-8h3L10 6z" fill="#16a34a"/>
      <path d="M10 6L7 12h2L5 20" stroke="#15803d" strokeWidth="0.5" fill="none"/>
      <path d="M22 4L17 12h3l-5 10h12l-5-10h3L22 4z" fill="#22c55e"/>
      <path d="M22 4L19 10h2l-4 8" stroke="#16a34a" strokeWidth="0.5" fill="none"/>
      <rect x="9" y="22" width="2" height="5" rx="0.8" fill="#78350f"/>
      <rect x="21" y="24" width="2" height="4" rx="0.8" fill="#78350f"/>
      <circle cx="8" cy="16" r="1.5" fill="#4ade80" opacity="0.4"/>
      <circle cx="13" cy="14" r="1.2" fill="#4ade80" opacity="0.3"/>
      <circle cx="24" cy="14" r="1.5" fill="#86efac" opacity="0.4"/>
      <circle cx="20" cy="12" r="1.2" fill="#86efac" opacity="0.3"/>
    </svg>
  ),
  konservasi: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 3L9 12h3L6 22h20l-6-10h3L16 3z" fill="#166534"/>
      <rect x="14.5" y="22" width="3" height="5" rx="1" fill="#78350f"/>
      <circle cx="16" cy="12" r="8" stroke="#fbbf24" strokeWidth="2" fill="none" strokeDasharray="4 3"/>
      <path d="M13 12l2 2 4-4" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="16" cy="12" r="1" fill="#fbbf24" opacity="0.4"/>
    </svg>
  ),
  default: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="5" y="5" width="22" height="22" rx="4" fill="#e0e7ff" stroke="#818cf8" strokeWidth="1.2"/>
      <path d="M11 12h10M11 17h8M11 22h6" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  coal: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,3 8,10 6,18 10,28 22,28 26,18 24,10" fill="#1c1917"/>
      <polygon points="16,3 12,9 16,12 20,9" fill="#292524"/>
      <polygon points="16,3 20,9 24,10 16,12" fill="#0c0a09" opacity="0.6"/>
      <polygon points="10,28 6,18 12,16 16,20 16,28" fill="#292524" opacity="0.5"/>
      <polygon points="22,28 26,18 20,16 16,20 16,28" fill="#1c1917" opacity="0.4"/>
      <path d="M12 14l2-1 2 2 2-1 2 2" stroke="#57534e" strokeWidth="0.8" opacity="0.6"/>
      <path d="M10 20l3-1 2 2 3-1 2 2" stroke="#57534e" strokeWidth="0.6" opacity="0.5"/>
      <circle cx="13" cy="16" r="0.6" fill="#78716c" opacity="0.4"/>
      <circle cx="19" cy="22" r="0.5" fill="#78716c" opacity="0.3"/>
      <circle cx="15" cy="24" r="0.5" fill="#78716c" opacity="0.3"/>
    </svg>
  ),
  gold: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,3 8,12 11,12 8,26 24,26 21,12 24,12" fill="#eab308"/>
      <polygon points="16,3 12,10 16,12 20,10" fill="#facc15"/>
      <polygon points="16,3 20,10 24,12 16,12" fill="#ca8a04" opacity="0.7"/>
      <polygon points="11,12 8,26 16,26 16,12" fill="#ca8a04" opacity="0.5"/>
      <polygon points="21,12 24,26 16,26 16,12" fill="#a16207" opacity="0.5"/>
      <circle cx="13" cy="16" r="1.2" fill="#fef08a" opacity="0.7"/>
      <circle cx="19" cy="18" r="1" fill="#fef08a" opacity="0.5"/>
      <circle cx="15" cy="22" r="0.8" fill="#fef08a" opacity="0.4"/>
      <line x1="16" y1="6" x2="13" y2="11" stroke="#fef9c3" strokeWidth="0.8" opacity="0.6"/>
      <line x1="16" y1="6" x2="19" y2="11" stroke="#fef9c3" strokeWidth="0.8" opacity="0.6"/>
    </svg>
  ),
  silver: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,3 8,12 11,12 8,26 24,26 21,12 24,12" fill="#9ca3af"/>
      <polygon points="16,3 12,10 16,12 20,10" fill="#d1d5db"/>
      <polygon points="16,3 20,10 24,12 16,12" fill="#6b7280" opacity="0.7"/>
      <polygon points="11,12 8,26 16,26 16,12" fill="#6b7280" opacity="0.5"/>
      <polygon points="21,12 24,26 16,26 16,12" fill="#4b5563" opacity="0.5"/>
      <circle cx="13" cy="16" r="1.2" fill="#f3f4f6" opacity="0.7"/>
      <circle cx="19" cy="18" r="1" fill="#f3f4f6" opacity="0.5"/>
      <circle cx="15" cy="22" r="0.8" fill="#f3f4f6" opacity="0.4"/>
      <line x1="16" y1="6" x2="13" y2="11" stroke="#e5e7eb" strokeWidth="0.8" opacity="0.6"/>
      <line x1="16" y1="6" x2="19" y2="11" stroke="#e5e7eb" strokeWidth="0.8" opacity="0.6"/>
    </svg>
  ),
  copper: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,3 8,12 11,12 8,26 24,26 21,12 24,12" fill="#c2410c"/>
      <polygon points="16,3 12,10 16,12 20,10" fill="#ea580c"/>
      <polygon points="16,3 20,10 24,12 16,12" fill="#9a3412" opacity="0.7"/>
      <polygon points="11,12 8,26 16,26 16,12" fill="#9a3412" opacity="0.5"/>
      <polygon points="21,12 24,26 16,26 16,12" fill="#7c2d12" opacity="0.5"/>
      <circle cx="13" cy="16" r="1.2" fill="#fed7aa" opacity="0.6"/>
      <circle cx="19" cy="18" r="1" fill="#fed7aa" opacity="0.5"/>
      <circle cx="15" cy="22" r="0.8" fill="#fed7aa" opacity="0.4"/>
      <path d="M14 8c1-1 3-1 4 0" stroke="#fb923c" strokeWidth="0.6" opacity="0.5"/>
    </svg>
  ),
  tin: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,3 8,12 11,12 8,26 24,26 21,12 24,12" fill="#94a3b8"/>
      <polygon points="16,3 12,10 16,12 20,10" fill="#cbd5e1"/>
      <polygon points="16,3 20,10 24,12 16,12" fill="#64748b" opacity="0.7"/>
      <polygon points="11,12 8,26 16,26 16,12" fill="#64748b" opacity="0.5"/>
      <polygon points="21,12 24,26 16,26 16,12" fill="#475569" opacity="0.5"/>
      <circle cx="13" cy="16" r="1.2" fill="#e2e8f0" opacity="0.7"/>
      <circle cx="19" cy="18" r="1" fill="#e2e8f0" opacity="0.5"/>
      <circle cx="15" cy="22" r="0.8" fill="#e2e8f0" opacity="0.4"/>
      <path d="M12 15l2-1 2 1.5 2-1 2 1.5" stroke="#cbd5e1" strokeWidth="0.6" opacity="0.5"/>
    </svg>
  ),
  nickel: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,3 8,12 11,12 8,26 24,26 21,12 24,12" fill="#71717a"/>
      <polygon points="16,3 12,10 16,12 20,10" fill="#a1a1aa"/>
      <polygon points="16,3 20,10 24,12 16,12" fill="#52525b" opacity="0.7"/>
      <polygon points="11,12 8,26 16,26 16,12" fill="#52525b" opacity="0.5"/>
      <polygon points="21,12 24,26 16,26 16,12" fill="#3f3f46" opacity="0.5"/>
      <circle cx="13" cy="16" r="1.2" fill="#d4d4d8" opacity="0.6"/>
      <circle cx="19" cy="18" r="1" fill="#d4d4d8" opacity="0.5"/>
      <circle cx="15" cy="22" r="0.8" fill="#d4d4d8" opacity="0.4"/>
      <path d="M11 18l3-2 2 1.5 3-2 2 1.5" stroke="#a1a1aa" strokeWidth="0.6" opacity="0.5"/>
    </svg>
  ),
  bauxite: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,3 8,12 11,12 8,26 24,26 21,12 24,12" fill="#b91c1c"/>
      <polygon points="16,3 12,10 16,12 20,10" fill="#dc2626"/>
      <polygon points="16,3 20,10 24,12 16,12" fill="#991b1b" opacity="0.7"/>
      <polygon points="11,12 8,26 16,26 16,12" fill="#991b1b" opacity="0.5"/>
      <polygon points="21,12 24,26 16,26 16,12" fill="#7f1d1d" opacity="0.5"/>
      <circle cx="13" cy="16" r="1.2" fill="#fca5a5" opacity="0.6"/>
      <circle cx="19" cy="18" r="1" fill="#fca5a5" opacity="0.5"/>
      <circle cx="15" cy="22" r="0.8" fill="#fca5a5" opacity="0.4"/>
      <path d="M12 14l2-1 2 2 2-1" stroke="#ef4444" strokeWidth="0.6" opacity="0.5"/>
      <path d="M10 20l3-1 2 2 3-1" stroke="#ef4444" strokeWidth="0.6" opacity="0.4"/>
    </svg>
  ),
  data_penunjang: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="3" width="20" height="26" rx="2" fill="#166534"/>
      <rect x="4" y="3" width="20" height="6" rx="2" fill="#14532d"/>
      <rect x="7" y="12" width="14" height="2" rx="1" fill="#4ade80" opacity="0.6"/>
      <rect x="7" y="16" width="10" height="2" rx="1" fill="#4ade80" opacity="0.4"/>
      <rect x="7" y="20" width="12" height="2" rx="1" fill="#4ade80" opacity="0.4"/>
      <rect x="7" y="24" width="8" height="2" rx="1" fill="#4ade80" opacity="0.3"/>
      <path d="M20 18l4-3v10l-4-3V18z" fill="#86efac" opacity="0.7"/>
      <path d="M16 6l-2 2.5h1.2L14 11l3-2.5h-1.2L16 6z" fill="#22c55e"/>
      <circle cx="10" cy="22" r="0.6" fill="#86efac"/>
      <circle cx="14" cy="24" r="0.5" fill="#86efac"/>
    </svg>
  ),
  jati_jawa: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="14" y="18" width="4" height="10" rx="1" fill="#92400e"/>
      <path d="M16 18c-3-4-8-6-8-10 0-1 1-2 3-2 1.5 0 2.5 1 3.5 3 1-2 2-3 3.5-3 2 0 3 1 3 2 0 4-5 6-8 10z" fill="#15803d"/>
      <path d="M16 18c-2-3-5-5-5-8 0-0.8 0.7-1.5 2-1.5 1 0 1.8 0.7 2.5 2" stroke="#166534" strokeWidth="0.6" fill="none"/>
      <path d="M16 18c2-3 5-5 5-8 0-0.8-0.7-1.5-2-1.5-1 0-1.8 0.7-2.5 2" stroke="#166534" strokeWidth="0.6" fill="none"/>
      <circle cx="12" cy="14" r="2" fill="#22c55e" opacity="0.4"/>
      <circle cx="20" cy="13" r="2" fill="#22c55e" opacity="0.4"/>
      <circle cx="16" cy="10" r="2.5" fill="#4ade80" opacity="0.3"/>
      <path d="M10 28h12" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="13" cy="16" r="0.8" fill="#4ade80" opacity="0.5"/>
      <circle cx="19" cy="15" r="0.7" fill="#4ade80" opacity="0.4"/>
    </svg>
  ),
  rimba_jawa: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="8" y="20" width="3" height="8" rx="1" fill="#78350f"/>
      <rect x="14.5" y="18" width="3" height="10" rx="1" fill="#78350f"/>
      <rect x="21" y="22" width="3" height="6" rx="1" fill="#78350f"/>
      <path d="M9.5 20c-2-3-5-5-5-8 0-1 0.8-1.5 2-1.5 1.2 0 2 0.8 2.5 2" stroke="#166534" strokeWidth="0.5" fill="none"/>
      <ellipse cx="9.5" cy="12" rx="4" ry="5" fill="#15803d"/>
      <ellipse cx="9.5" cy="12" rx="2.5" ry="3.5" fill="#22c55e" opacity="0.5"/>
      <path d="M16 18c-2-4-5-6-5-9 0-0.8 0.7-1.5 2-1.5 1 0 1.8 0.7 2.5 2 0.7-1.3 1.5-2 2.5-2 1.3 0 2 0.7 2 1.5 0 3-3 5-5 9z" fill="#16a34a"/>
      <path d="M16 18c-1.5-3-3.5-4.5-3.5-7 0-0.6 0.5-1 1.2-1 0.8 0 1.3 0.5 1.8 1.5" stroke="#15803d" strokeWidth="0.5" fill="none"/>
      <circle cx="14" cy="14" r="2" fill="#4ade80" opacity="0.4"/>
      <circle cx="18.5" cy="13" r="1.8" fill="#4ade80" opacity="0.3"/>
      <path d="M22.5 22c-2-3-4-5-4-7 0-0.8 0.7-1.5 2-1.5 1 0 1.5 0.7 2 2" stroke="#166534" strokeWidth="0.5" fill="none"/>
      <ellipse cx="22.5" cy="14" rx="3.5" ry="4.5" fill="#22c55e"/>
      <circle cx="22.5" cy="13" r="2" fill="#4ade80" opacity="0.4"/>
      <path d="M4 28h24" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  rimba_luar_jawa: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M4 28h24" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="5" y="22" width="2.5" height="6" rx="0.8" fill="#78350f"/>
      <rect x="11" y="20" width="2.5" height="8" rx="0.8" fill="#78350f"/>
      <rect x="17" y="19" width="2.5" height="9" rx="0.8" fill="#92400e"/>
      <rect x="23" y="21" width="2.5" height="7" rx="0.8" fill="#78350f"/>
      <ellipse cx="6.25" cy="16" rx="3.5" ry="5" fill="#065f46"/>
      <ellipse cx="6.25" cy="16" rx="2" ry="3" fill="#047857" opacity="0.5"/>
      <ellipse cx="12.25" cy="13" rx="4.5" ry="6" fill="#064e3b"/>
      <ellipse cx="12.25" cy="13" rx="3" ry="4" fill="#059669" opacity="0.4"/>
      <path d="M18.25 19c-2-4-5-6-5-9 0-0.8 0.7-1.5 2-1.5 1 0 1.8 0.7 2.5 2 0.7-1.3 1.5-2 2.5-2 1.3 0 2 0.7 2 1.5 0 3-3 5-5 9z" fill="#065f46"/>
      <circle cx="16" cy="11" r="2.5" fill="#10b981" opacity="0.3"/>
      <circle cx="20" cy="10" r="2" fill="#10b981" opacity="0.3"/>
      <ellipse cx="24.25" cy="15" rx="3.5" ry="5" fill="#064e3b"/>
      <circle cx="24.25" cy="14" r="2" fill="#34d399" opacity="0.4"/>
      <circle cx="7" cy="10" r="1" fill="#facc15" opacity="0.7"/>
      <path d="M7 8V6M5.5 7l-0.5-1M8.5 7l0.5-1M7 9v1" stroke="#facc15" strokeWidth="0.6" strokeLinecap="round"/>
    </svg>
  ),
};

const SUB_ICON_MAP = [
  { pattern: /^oil$/i, key: "oil" },
  { pattern: /^gas$/i, key: "gas" },
  { pattern: /^coal$/i, key: "coal" },
  { pattern: /^gold$/i, key: "gold" },
  { pattern: /^silver$/i, key: "silver" },
  { pattern: /^copper$/i, key: "copper" },
  { pattern: /^tin$/i, key: "tin" },
  { pattern: /^nickel$/i, key: "nickel" },
  { pattern: /^bauxite$/i, key: "bauxite" },
  { pattern: /mineral/i, key: "mineral_lainnya" },
  { pattern: /kas|uang tunai|cash/i, key: "kas" },
  { pattern: /bank|rekening|tabungan|deposito/i, key: "kas" },
  { pattern: /piutang|tagihan|receivable/i, key: "piutang" },
  { pattern: /persediaan|stok|inventory|gudang/i, key: "persediaan" },
  { pattern: /utang|hutang|kredit|pinjaman|loan|payable/i, key: "utang" },
  { pattern: /primer|asli|alami|native/i, key: "hutan_primer" },
  { pattern: /sekunder|buatan|reboisasi|planted/i, key: "hutan_sekunder" },
  { pattern: /konservasi|保护|cagar|suaka|reservasi/i, key: "konservasi" },
  { pattern: /penunjang|data penunjang|support|dukungan/i, key: "data_penunjang" },
  { pattern: /jati.*jawa|jawa.*jati|teak/i, key: "jati_jawa" },
  { pattern: /rimba.*jawa|jawa.*rimba|jungle.*java/i, key: "rimba_jawa" },
  { pattern: /rimba.*luar|luar.*jawa|rimba luar|outside.*java|tropical/i, key: "rimba_luar_jawa" },
  { pattern: /platinum|plat/i, key: "silver" },
  { pattern: /krom|chrom/i, key: "nickel" },
  { pattern: /timah hitam|lead|seng|zinc/i, key: "coal" },
  { pattern: /bijih|ore|fe/i, key: "mineral_lainnya" },
  { pattern: /sawit|kelapa sawit|palm/i, key: "hutan_primer" },
  { pattern: /karet|rubber|latex/i, key: "hutan_sekunder" },
  { pattern: /kopi|coffee|teh|tea|cengkeh|clove|coklat|cocoa/i, key: "hutan_primer" },
  { pattern: /padi|rice|jagung|corn|kedelai|soybean/i, key: "persediaan" },
  { pattern: /ikan|fish|udang|shrimp|laut|sea/i, key: "oil" },
  { pattern: /sapi|cow|ayam|chicken|kambing|goat|ternak|livestock/i, key: "persediaan" },
  { pattern: /emas.*perak|silver.*gold/i, key: "gold" },
  { pattern: /solar|angin|wind|surya|solar|nuklir|panas bumi|geothermal/i, key: "gas" },
  { pattern: /laut|sea|ocean|pelabuhan|port|kapal|ship/i, key: "gas" },
  { pattern: /jalan|road|jembatan|bridge|gedung|building/i, key: "persediaan" },
  { pattern: /karyawan|staff|pegawai|personil|hr|manusia|people/i, key: "kas" },
  { pattern: /hewan|animal|fauna|flora|tumbuhan/i, key: "hutan_primer" },
  { pattern: /air|water|sungai|river|danau|lake/i, key: "gas" },
  { pattern: /produksi|production|manufaktur|manufacture|pabrik|factory/i, key: "persediaan" },
  { pattern: /penjualan|sales|omset|revenue|usaha|business/i, key: "kas" },
];

const SUB_BG = {
  oil: "#1e293b",
  gas: "#0891b2",
  coal: "#1c1917",
  gold: "#eab308",
  silver: "#6b7280",
  copper: "#c2410c",
  tin: "#64748b",
  nickel: "#52525b",
  bauxite: "#b91c1c",
  mineral_lainnya: "#7c3aed",
  kas: "#059669",
  piutang: "#2563eb",
  persediaan: "#d97706",
  utang: "#dc2626",
  hutan_primer: "#15803d",
  hutan_sekunder: "#16a34a",
  konservasi: "#166534",
  data_penunjang: "#14532d",
  jati_jawa: "#15803d",
  rimba_jawa: "#16a34a",
  rimba_luar_jawa: "#064e3b",
  default: "#6366f1",
};

function getSubIcon(name) {
  if (!name) return "default";
  const lower = name.trim().toLowerCase();
  for (const rule of SUB_ICON_MAP) {
    if (rule.pattern.test(lower)) return rule.key;
  }
  return "default";
}

const ICON_OPTIONS = [
  { key: "IconBox", label: "Kotak", Comp: IconBox },
  { key: "IconCoins", label: "Koin", Comp: IconCoins },
  { key: "IconLayers", label: "Lapisan", Comp: IconLayers },
  { key: "IconDatabase", label: "Database", Comp: IconDatabase },
  { key: "IconTag", label: "Label", Comp: IconTag },
  { key: "IconFileText", label: "Dokumen", Comp: IconFileText },
  { key: "IconGrid", label: "Grid", Comp: IconGrid },
  { key: "IconHistory", label: "Riwayat", Comp: IconHistory },
  { key: "IconFileSpreadsheet", label: "Spreadsheet", Comp: IconFileSpreadsheet },
  { key: "IconAlert", label: "Peringatan", Comp: IconAlert },
  { key: "IconArrowDown", label: "Masuk", Comp: IconArrowDown },
  { key: "IconArrowUp", label: "Keluar", Comp: IconArrowUp },
  { key: "neraca_hutan", label: "Hutan", Comp: NERACA_ICONS.hutan },
  { key: "neraca_mineral", label: "Mineral", Comp: NERACA_ICONS.mineral },
  { key: "neraca_energi", label: "Energi", Comp: NERACA_ICONS.energi },
  { key: "neraca_terintegrasi", label: "Terintegrasi", Comp: NERACA_ICONS.terintegrasi },
  { key: "neraca_uang", label: "Uang", Comp: NERACA_ICONS.uang },
  { key: "sub_oil", label: "Oil", Comp: SUB_ICONS.oil },
  { key: "sub_gas", label: "Gas", Comp: SUB_ICONS.gas },
  { key: "sub_coal", label: "Coal", Comp: SUB_ICONS.coal },
  { key: "sub_gold", label: "Gold", Comp: SUB_ICONS.gold },
  { key: "sub_silver", label: "Silver", Comp: SUB_ICONS.silver },
  { key: "sub_copper", label: "Copper", Comp: SUB_ICONS.copper },
  { key: "sub_tin", label: "Tin", Comp: SUB_ICONS.tin },
  { key: "sub_nickel", label: "Nickel", Comp: SUB_ICONS.nickel },
  { key: "sub_bauxite", label: "Bauxite", Comp: SUB_ICONS.bauxite },
  { key: "sub_mineral_lainnya", label: "Mineral Lain", Comp: SUB_ICONS.mineral_lainnya },
  { key: "sub_kas", label: "Kas", Comp: SUB_ICONS.kas },
  { key: "sub_piutang", label: "Piutang", Comp: SUB_ICONS.piutang },
  { key: "sub_persediaan", label: "Persediaan", Comp: SUB_ICONS.persediaan },
  { key: "sub_utang", label: "Utang", Comp: SUB_ICONS.utang },
  { key: "sub_hutan_primer", label: "Hutan Primer", Comp: SUB_ICONS.hutan_primer },
  { key: "sub_hutan_sekunder", label: "Hutan Sekunder", Comp: SUB_ICONS.hutan_sekunder },
  { key: "sub_konservasi", label: "Konservasi", Comp: SUB_ICONS.konservasi },
  { key: "sub_data_penunjang", label: "Data Penunjang", Comp: SUB_ICONS.data_penunjang },
  { key: "sub_jati_jawa", label: "Jati Jawa", Comp: SUB_ICONS.jati_jawa },
  { key: "sub_rimba_jawa", label: "Rimba Jawa", Comp: SUB_ICONS.rimba_jawa },
  { key: "sub_rimba_luar_jawa", label: "Rimba Luar Jawa", Comp: SUB_ICONS.rimba_luar_jawa },
];

const ICON_MAP = {};
ICON_OPTIONS.forEach((o) => { ICON_MAP[o.key] = o.Comp; });

function fmtTanggalSidebar(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(dt);
}

const ROLE_CHIP = {
  user: { background: "#eef2ff", color: "#4338ca" },
  admin: { background: "#ecfdf5", color: "#047857" },
  super_admin: { background: "#fef3c7", color: "#b45309" },
};

function RoleChip({ role, style }) {
  const s = ROLE_CHIP[role] || ROLE_CHIP.user;
  return (
    <span
      className="role-chip"
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: s.background,
        color: s.color,
        ...style,
      }}
    >
      {roleLabel(role)}
    </span>
  );
}

export default function Layout({ page, setPage, children, importedFiles, user, onLogout, onUserUpdated, onAccountDeleted }) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [kategori, setKategori] = React.useState([]);
  const [addModal, setAddModal] = React.useState(null);
  const [addForm, setAddForm] = React.useState({ nama_kategori: "", deskripsi: "" });
  const [saving, setSaving] = React.useState(false);

  const [expanded, setExpanded] = React.useState({});
  const [subKategoriMap, setSubKategoriMap] = React.useState({});

  const [subModal, setSubModal] = React.useState(null);
  const [subForm, setSubForm] = React.useState({ nama: "", deskripsi: "", icon: "" });
  const [subSaving, setSubSaving] = React.useState(false);
  const [deleteSubTarget, setDeleteSubTarget] = React.useState(null);
  const [deleteKategoriTarget, setDeleteKategoriTarget] = React.useState(null);
  const [editKategoriModal, setEditKategoriModal] = React.useState(null);
  const [editKategoriForm, setEditKategoriForm] = React.useState({ nama_kategori: "", deskripsi: "" });
  const [editKategoriSaving, setEditKategoriSaving] = React.useState(false);

  const fetchSubKategori = React.useCallback((katList) => {
    katList.forEach((k) => {
      api.getSubKategori(k.id).then((subs) => {
        setSubKategoriMap((m) => ({ ...m, [k.id]: subs }));
      }).catch(() => {});
    });
  }, []);

  React.useEffect(() => {
    api.getKategori().then((list) => {
      setKategori(list);
      fetchSubKategori(list);
    }).catch(() => {});
  }, [page, fetchSubKategori]);

  const refreshKategoriAndSub = async () => {
    const list = await api.getKategori();
    setKategori(list);
    fetchSubKategori(list);
  };

  const toggleExpand = (kategoriId) => {
    setExpanded((prev) => ({ ...prev, [kategoriId]: !prev[kategoriId] }));
  };

  const go = (key) => {
    setPage(key);
    setOpen(false);
  };

  const setAdd = (key) => (e) => setAddForm((f) => ({ ...f, [key]: e.target.value }));

  const openAddModal = (key) => {
    setAddForm({ nama_kategori: "", deskripsi: "", icon: "" });
    setAddModal(key);
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.createKategori(addForm);
      toast("Neraca berhasil ditambahkan");
      const list = await api.getKategori();
      setKategori(list);
      fetchSubKategori(list);
      const key = addModal;
      setAddModal(null);
      const created = list.find((x) => String(x.id) === String(res.id));
      if (created) {
        setExpanded((prev) => ({ ...prev, [created.id]: true }));
        go(`${key}:${created.id}`);
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const openEditKategoriModal = (k) => {
    setEditKategoriForm({ nama_kategori: k.nama_kategori, deskripsi: k.deskripsi || "", icon: k.icon || "" });
    setEditKategoriModal(k);
  };

  const setEditKategoriField = (k) => (e) => setEditKategoriForm((f) => ({ ...f, [k]: e.target.value }));

  const submitEditKategori = async (e) => {
    e.preventDefault();
    setEditKategoriSaving(true);
    try {
      await api.updateKategori(editKategoriModal.id, editKategoriForm);
      toast("Neraca berhasil diubah");
      setEditKategoriModal(null);
      await refreshKategoriAndSub();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEditKategoriSaving(false);
    }
  };

  const openSubModal = (kategoriId, sub = null) => {
    setSubForm(sub ? { nama: sub.nama, deskripsi: sub.deskripsi || "", icon: sub.icon || "" } : { nama: "", deskripsi: "", icon: "" });
    setSubModal({ kategoriId, editing: sub });
    setExpanded((prev) => ({ ...prev, [kategoriId]: true }));
  };

  const setSubField = (k) => (e) => setSubForm((f) => ({ ...f, [k]: e.target.value }));

  const submitSub = async (e) => {
    e.preventDefault();
    setSubSaving(true);
    try {
      const { kategoriId, editing } = subModal;
      if (editing) {
        await api.updateSubKategori(editing.id, subForm);
        toast("Sub-kategori berhasil diubah");
      } else {
        await api.createSubKategori(kategoriId, subForm);
        toast("Sub-kategori berhasil ditambahkan");
      }
      setSubModal(null);
      await refreshKategoriAndSub();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSubSaving(false);
    }
  };

  const confirmDeleteKategori = async () => {
    if (!deleteKategoriTarget) return;
    try {
      await api.deleteKategori(deleteKategoriTarget.id);
      toast("Neraca berhasil dihapus");
      setDeleteKategoriTarget(null);
      if (page.startsWith(`input:${deleteKategoriTarget.id}`) || page.startsWith(`output:${deleteKategoriTarget.id}`)) {
        setPage("dashboard");
      }
      await refreshKategoriAndSub();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const confirmDeleteSub = async () => {
    if (!deleteSubTarget) return;
    try {
      await api.deleteSubKategori(deleteSubTarget.id);
      toast("Sub-kategori berhasil dihapus");
      setDeleteSubTarget(null);
      await refreshKategoriAndSub();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const isActive = (key) => page === key || page.startsWith(`${key}:`);

  const topTitle = React.useMemo(() => {
    if (page === "dashboard") return "Dashboard";
    if (page === "kategori") return "Kategori";
    if (page === "laporan") return "Laporan";
    if (page === "import-result") return "Hasil Import";
    if (page === "spreadsheet") return "Spreadsheet";
    if (page === "files") return "File & Import";
    if (page === "panduan") return "Panduan Penggunaan";
    if (page === "audit-log") return "Audit Log";
    if (page === "admin-users") return "User & Admin Management";
    if (page === "admin-tables") return "Penugasan Tabel untuk Admin";
    if (page === "admin-maintenance") return "Maintenance Mode";
    if (page === "admin-backup") return "Backup & Restore";
    if (page === "admin-settings") return "Website / System Settings";
    if (page === "input") return "Input";
    const parts = page.split(":");
    const fam = parts[0];
    if (fam === "input") {
      const id = parts[1];
      const subId = parts[2];
      const k = kategori.find((x) => String(x.id) === id);
      if (subId) {
        const subs = subKategoriMap[Number(id)] || [];
        const sub = subs.find((s) => String(s.id) === subId);
        return sub ? `Input - ${k?.nama_kategori || "Kategori"} / ${sub.nama}` : `Input - ${k?.nama_kategori || "Kategori"}`;
      }
      return k ? `Input - ${k.nama_kategori}` : `Input - Kategori`;
    }
    return "Dashboard";
  }, [page, kategori, subKategoriMap]);

  const renderGroup = ({ key, label, icon: Icon }) => (
    <div key={key} className={`nav-group${isActive(key) ? " active" : ""}`}>
      <div className="nav-group-title">
        <span className="icon"><Icon /></span>
        {label}
      </div>
      {kategori.length === 0 ? (
        <span className="nav-sub-empty">Belum ada kategori</span>
      ) : (
        kategori.map((k) => {
          const subs = subKategoriMap[k.id] || [];
          const isOpen = !!expanded[k.id];
          const isKategoriActive = page.startsWith(`${key}:${k.id}`);
          return (
            <div key={k.id} className="nav-kategori-wrap">
              <button
                className={`nav-item nav-group-item${isKategoriActive ? " active" : ""}`}
                onClick={() => go(`${key}:${k.id}`)}
              >
                <span
                  className={`nav-caret-inline${isOpen ? " open" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(k.id);
                  }}
                >
                  &#9654;
                </span>
                {(() => {
                  let IconSvg, bg;
                  if (k.icon && ICON_MAP[k.icon]) {
                    IconSvg = ICON_MAP[k.icon];
                    const nKey = getNeracaIcon(k.nama_kategori);
                    bg = NERACA_BG[nKey] || "linear-gradient(135deg, #6366f1, #7c3aed)";
                  } else {
                    const iconName = getNeracaIcon(k.nama_kategori);
                    IconSvg = NERACA_ICONS[iconName] || NERACA_ICONS.default;
                    bg = NERACA_BG[iconName] || NERACA_BG.default;
                  }
                  return (
                    <span className="nav-kategori-icon" style={{ background: bg, width: 26, height: 26, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 1 }}>
                      {React.createElement(IconSvg, { size: 20 })}
                    </span>
                  );
                })()}
                <span
                  className="nav-item-label"
                  onClick={() => go(`${key}:${k.id}`)}
                >
                  {k.nama_kategori}
                </span>
                <span className="nav-kategori-actions">
                  <span className="nav-sub-action" onClick={() => openSubModal(k.id)} title="Tambah sub-kategori">
                    <IconPlus size={13} />
                  </span>
                  <span className="nav-sub-action" onClick={() => openEditKategoriModal(k)} title="Ubah neraca">
                    <IconEdit size={13} />
                  </span>
                  <span className="nav-sub-action danger" onClick={() => setDeleteKategoriTarget(k)} title="Hapus neraca">
                    <IconTrash size={13} />
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="nav-sub">
                  {subs.length === 0 && (
                    <span className="nav-sub-empty">Belum ada sub-kategori</span>
                  )}
                  {subs.map((sk) => {
                    let SubIconSvg, subBg;
                    if (sk.icon && ICON_MAP[sk.icon]) {
                      SubIconSvg = ICON_MAP[sk.icon];
                      const sKey = getSubIcon(sk.nama);
                      subBg = SUB_BG[sKey] || SUB_BG.default;
                    } else {
                      const subKey = getSubIcon(sk.nama);
                      SubIconSvg = SUB_ICONS[subKey] || SUB_ICONS.default;
                      subBg = SUB_BG[subKey] || SUB_BG.default;
                    }
                    return (
                    <div key={sk.id} className="nav-sub-row">
                      <button
                        className={`nav-sub-item${page === `${key}:${k.id}:${sk.id}` ? " active" : ""}`}
                        onClick={() => go(`${key}:${k.id}:${sk.id}`)}
                      >
                        <span style={{ background: subBg, width: 26, height: 26, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 8, padding: 1 }}>
                          {React.createElement(SubIconSvg, { size: 20 })}
                        </span>
                        {sk.nama}
                      </button>
                      <span className="nav-sub-actions">
                        <span className="nav-sub-action" onClick={() => openSubModal(k.id, sk)} title="Ubah">
                          <IconEdit size={12} />
                        </span>
                        <span className="nav-sub-action danger" onClick={() => setDeleteSubTarget(sk)} title="Hapus">
                          <IconTrash size={12} />
                        </span>
                      </span>
                    </div>
                    );
                  })}
                  <button
                    className="nav-sub-add"
                    onClick={() => openSubModal(k.id)}
                    title="Tambah sub-kategori"
                  >
                    <IconPlus size={12} /> Tambah Sub-Kategori
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
      <button className="nav-add" onClick={() => openAddModal(key)} title="Tambah neraca baru">
        <IconPlus size={13} /> Tambah Neraca
      </button>
    </div>
  );

  const renderLeaf = ({ key, label, icon: Icon }) => (
    <button
      key={key}
      className={`nav-item${page === key ? " active" : ""}`}
      onClick={() => go(key)}
    >
      <span className="icon"><Icon /></span>
      {label}
    </button>
  );

  return (
    <div className="layout">
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-brand" onClick={() => setPage("dashboard")} style={{ cursor: "pointer" }}>
          <div className="brand-logo">S</div>
          <div className="brand-text">
            <strong>SISNERLING</strong>
            <span>Sistem Neraca Lingkungan</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {renderLeaf({ key: "dashboard", label: "Dashboard", icon: IconDashboard })}
          {renderLeaf({ key: "spreadsheet", label: "Spreadsheet", icon: IconFileSpreadsheet })}
          {renderLeaf({ key: "files", label: "File & Import", icon: IconDatabase })}
          {renderLeaf({ key: "kategori", label: "Kategori", icon: IconTag })}
          {renderLeaf({ key: "laporan", label: "Laporan", icon: IconFileText })}
          {renderLeaf({ key: "panduan", label: "Panduan", icon: IconBox })}
          {isSuperAdmin(user) && renderLeaf({ key: "audit-log", label: "Audit Log", icon: IconHistory })}
          {isSuperAdmin(user) && (
            <>
              <div className="nav-section-label">Pengelolaan</div>
              {renderLeaf({ key: "admin-users", label: "User & Admin", icon: IconDatabase })}
              {renderLeaf({ key: "admin-tables", label: "Penugasan Tabel", icon: IconLayers })}
              {renderLeaf({ key: "admin-maintenance", label: "Maintenance", icon: IconAlert })}
              {renderLeaf({ key: "admin-backup", label: "Backup & Restore", icon: IconHistory })}
              {renderLeaf({ key: "admin-settings", label: "Pengaturan", icon: IconBox })}
            </>
          )}
        </nav>
        {user && (
          <div className="sidebar-profile" onClick={() => setProfileOpen(true)} title="Lihat / ubah profil">
            <span className="sidebar-profile-avatar">
              {user.avatar ? (
                <img src={user.avatar} alt="Foto profil" />
              ) : (
                (user.nama || "U").slice(0, 2).toUpperCase()
              )}
            </span>
            <span className="sidebar-profile-info">
              <strong>{user.nama}</strong>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <RoleChip role={user.role} />
                <span style={{ opacity: 0.7 }}>Bergabung {fmtTanggalSidebar(user.created_at)}</span>
              </span>
            </span>
          </div>
        )}
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <IconX /> : <IconMenu />}
          </button>
          <div className="topbar-title">
            <h1>{topTitle}</h1>
            <p>Data terhubung dengan MySQL</p>
          </div>
          <div className="topbar-right">
            {user && (
              <>
                <div className="topbar-profile" onClick={() => setProfileOpen(true)} title="Lihat / ubah profil">
                  <div className="topbar-user">
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="topbar-user-name">{user.nama}</span>
                      <RoleChip role={user.role} />
                    </span>
                    <span className="topbar-user-email">{user.email}</span>
                  </div>
                  <span className="avatar">
                    {user.avatar ? (
                      <img src={user.avatar} alt="Foto profil" />
                    ) : (
                      (user.nama || "U").slice(0, 2).toUpperCase()
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>

      {addModal && (
        <Modal
          title="Tambah Neraca"
          onClose={() => setAddModal(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setAddModal(null)}>Batal</button>
              <button className="btn btn-primary" form="form-add-neraca" type="submit" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          }
        >
          <form id="form-add-neraca" onSubmit={submitAdd}>
            <div className="form-group">
              <label>Nama Neraca *</label>
              <input className="form-control" value={addForm.nama_kategori} onChange={setAdd("nama_kategori")} placeholder="contoh: Neraca Sumber Daya" required />
            </div>
            <div className="form-group">
              <label>Deskripsi</label>
              <textarea className="form-control" rows="3" value={addForm.deskripsi} onChange={setAdd("deskripsi")} placeholder="Keterangan (opsional)" />
            </div>
            <div className="form-group">
              <label>Icon</label>
              <div className="icon-picker">
                {ICON_OPTIONS.map((opt) => (
                  <span
                    key={opt.key}
                    className={`icon-picker-item${addForm.icon === opt.key ? " selected" : ""}`}
                    title={opt.label}
                    onClick={() => setAddForm((f) => ({ ...f, icon: f.icon === opt.key ? "" : opt.key }))}
                  >
                    <opt.Comp size={18} />
                    <span className="label">{opt.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </form>
        </Modal>
      )}

      {editKategoriModal && (
        <Modal
          title="Ubah Neraca"
          onClose={() => setEditKategoriModal(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEditKategoriModal(null)}>Batal</button>
              <button className="btn btn-primary" form="form-edit-neraca" type="submit" disabled={editKategoriSaving}>
                {editKategoriSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          }
        >
          <form id="form-edit-neraca" onSubmit={submitEditKategori}>
            <div className="form-group">
              <label>Nama Neraca *</label>
              <input className="form-control" value={editKategoriForm.nama_kategori} onChange={setEditKategoriField("nama_kategori")} required />
            </div>
            <div className="form-group">
              <label>Deskripsi</label>
              <textarea className="form-control" rows="3" value={editKategoriForm.deskripsi} onChange={setEditKategoriField("deskripsi")} placeholder="Keterangan (opsional)" />
            </div>
            <div className="form-group">
              <label>Icon</label>
              <div className="icon-picker">
                {ICON_OPTIONS.map((opt) => (
                  <span
                    key={opt.key}
                    className={`icon-picker-item${editKategoriForm.icon === opt.key ? " selected" : ""}`}
                    title={opt.label}
                    onClick={() => setEditKategoriForm((f) => ({ ...f, icon: f.icon === opt.key ? "" : opt.key }))}
                  >
                    <opt.Comp size={18} />
                    <span className="label">{opt.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </form>
        </Modal>
      )}

      {subModal && (
        <Modal
          title={subModal.editing ? "Ubah Sub-Kategori" : "Tambah Sub-Kategori"}
          onClose={() => setSubModal(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setSubModal(null)}>Batal</button>
              <button className="btn btn-primary" form="form-sub-kategori" type="submit" disabled={subSaving}>
                {subSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          }
        >
          <form id="form-sub-kategori" onSubmit={submitSub}>
            <div className="form-group">
              <label>Nama Sub-Kategori *</label>
              <input className="form-control" value={subForm.nama} onChange={setSubField("nama")} placeholder="contoh: Oil, Gas, dll" required />
            </div>
            <div className="form-group">
              <label>Deskripsi</label>
              <textarea className="form-control" rows="2" value={subForm.deskripsi} onChange={setSubField("deskripsi")} placeholder="Keterangan (opsional)" />
            </div>
            <div className="form-group">
              <label>Icon</label>
              <div className="icon-picker">
                {ICON_OPTIONS.map((opt) => (
                  <span
                    key={opt.key}
                    className={`icon-picker-item${subForm.icon === opt.key ? " selected" : ""}`}
                    title={opt.label}
                    onClick={() => setSubForm((f) => ({ ...f, icon: f.icon === opt.key ? "" : opt.key }))}
                  >
                    <opt.Comp size={18} />
                    <span className="label">{opt.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </form>
        </Modal>
      )}

      {deleteSubTarget && (
        <Modal
          title="Hapus Sub-Kategori"
          onClose={() => setDeleteSubTarget(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setDeleteSubTarget(null)}>Batal</button>
              <button className="btn btn-danger" onClick={confirmDeleteSub}>Ya, Hapus</button>
            </>
          }
        >
          <p>Yakin ingin menghapus sub-kategori <b>{deleteSubTarget.nama}</b>? Data yang terkait tidak akan dihapus.</p>
        </Modal>
      )}

      {deleteKategoriTarget && (
        <Modal
          title="Hapus Neraca"
          onClose={() => setDeleteKategoriTarget(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setDeleteKategoriTarget(null)}>Batal</button>
              <button className="btn btn-danger" onClick={confirmDeleteKategori}>Ya, Hapus</button>
            </>
          }
        >
          <p>Yakin ingin menghapus neraca <b>{deleteKategoriTarget.nama_kategori}</b>?</p>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
            Semua sub-kategori di dalamnya juga akan dihapus. Data terkait akan dipindahkan (sub-kategori dikosongkan).
          </p>
        </Modal>
      )}

      {profileOpen && (
        <ProfileModal
          user={user}
          onClose={() => setProfileOpen(false)}
          onUpdated={onUserUpdated}
          onLogout={onLogout}
          onAccountDeleted={onAccountDeleted}
        />
      )}
    </div>
  );
}
