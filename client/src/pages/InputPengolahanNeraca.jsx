import React from "react";
import { api } from "../api.js";
import { getToken, getUser } from "../auth.js";
import { ensureCollabSocket } from "../collabSocket.js";
import Modal from "../components/Modal.jsx";
import { useToast } from "../components/Toast.jsx";
import {
  IconGrid,
  IconPlus,
  IconDownload,
  IconRotate,
  IconEdit,
  IconCheck,
  IconAlert,
  IconCoins,
  IconTable,
  IconCalendar,
  IconTag,
  IconUpload,
  IconFileExcel,
  IconTrash,
} from "../components/Icons.jsx";
import Logo from "../components/Logo.jsx";
import "./InputPengolahanNeraca.css";

function formatNumber(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) {
    return (0).toFixed(decimals);
  }
  return Number(val).toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function parseInputValue(raw) {
  if (raw === "" || raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const clean = String(raw).trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = parseFloat(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recalculateLocal(data) {
  const years = data.years;

  ["Jati Jawa", "Rimba Jawa", "Rimba Luar Jawa"].forEach((shName) => {
    const sh = data.sheets[shName];
    if (!sh) return;

    const phys = sh.physical;
    const rent = sh.rent;
    const mon = sh.monetary;

    for (let i = 0; i < years.length; i++) {
      const yr = years[i];
      const prevYr = i > 0 ? years[i - 1] : null;

      if (i > 0 && prevYr) {
        phys.persediaanAwal[yr] = phys.persediaanAkhir[prevYr] !== undefined ? phys.persediaanAkhir[prevYr] : 0;
      }

      const awalFisik = num(phys.persediaanAwal[yr]);
      const tumbuhFisik = num(phys.pertumbuhan[yr]);
      const tanamFisik = num(phys.penanaman[yr]);
      const konversiFisik = num(phys.konversiKerusakan[yr]);
      const tebangFisik = num(phys.penebangan[yr]);

      const netoFisik = round2(tumbuhFisik + tanamFisik - konversiFisik - tebangFisik);
      phys.perubahanNeto[yr] = netoFisik;

      const akhirFisik = round2(awalFisik + netoFisik);
      phys.persediaanAkhir[yr] = akhirFisik;

      if (i > 0 && prevYr && phys.persediaanAkhir[prevYr]) {
        const prevAkhirFisik = phys.persediaanAkhir[prevYr];
        phys.lajuPertumbuhanAkhir[yr] = round4(((akhirFisik - prevAkhirFisik) / prevAkhirFisik) * 100);
      } else {
        phys.lajuPertumbuhanAkhir[yr] = 0;
      }

      const curRent = num(rent.unitRent[yr]);
      if (i > 0 && prevYr && rent.unitRent[prevYr]) {
        const prevRent = num(rent.unitRent[prevYr]);
        rent.pertumbuhanUnitRent[yr] = prevRent !== 0 ? round4(((curRent - prevRent) / prevRent) * 100) : 0;
      } else {
        rent.pertumbuhanUnitRent[yr] = 0;
      }

      if (i > 0 && prevYr) {
        mon.persediaanAwal[yr] = mon.persediaanAkhir[prevYr] !== undefined ? mon.persediaanAkhir[prevYr] : 0;
      } else if (mon.persediaanAwal[yr] === undefined || mon.persediaanAwal[yr] === null) {
        mon.persediaanAwal[yr] = round2((awalFisik * curRent) / 1000000);
      }

      const awalMoneter = num(mon.persediaanAwal[yr]);
      const tumbuhMon = round2((tumbuhFisik * curRent) / 1000000);
      const tanamMon = round2((tanamFisik * curRent) / 1000000);
      const konversiMon = round2((konversiFisik * curRent) / 1000000);
      const tebangMon = round2((tebangFisik * curRent) / 1000000);
      const netoMon = round2((netoFisik * curRent) / 1000000);

      mon.pertumbuhan[yr] = tumbuhMon;
      mon.penanaman[yr] = tanamMon;
      mon.konversiKerusakan[yr] = konversiMon;
      mon.penebangan[yr] = tebangMon;
      mon.perubahanNeto[yr] = netoMon;

      let reval = 0;
      if (i > 0 && prevYr && rent.unitRent[prevYr]) {
        const prevRent = num(rent.unitRent[prevYr]);
        reval = round2((awalFisik * (curRent - prevRent)) / 1000000);
      }
      mon.revaluasi[yr] = reval;

      const akhirMon = round2(awalMoneter + netoMon + reval);
      mon.persediaanAkhir[yr] = akhirMon;

      if (i > 0 && prevYr && mon.persediaanAkhir[prevYr]) {
        const prevAkhirMon = mon.persediaanAkhir[prevYr];
        mon.lajuPertumbuhanAkhir[yr] = prevAkhirMon !== 0 ? round4(((akhirMon - prevAkhirMon) / prevAkhirMon) * 100) : 0;
      } else {
        mon.lajuPertumbuhanAkhir[yr] = 0;
      }
    }
  });

  const jj = data.sheets["Jati Jawa"];
  const rj = data.sheets["Rimba Jawa"];
  const rlj = data.sheets["Rimba Luar Jawa"];
  const ind = data.sheets["Indonesia"];

  if (jj && rj && rlj && ind) {
    for (let i = 0; i < years.length; i++) {
      const yr = years[i];
      const prevYr = i > 0 ? years[i - 1] : null;

      const awal = round2((jj.physical.persediaanAwal[yr] || 0) + (rj.physical.persediaanAwal[yr] || 0) + (rlj.physical.persediaanAwal[yr] || 0));
      const tumbuh = round2((jj.physical.pertumbuhan[yr] || 0) + (rj.physical.pertumbuhan[yr] || 0) + (rlj.physical.pertumbuhan[yr] || 0));
      const tanam = round2((jj.physical.penanaman[yr] || 0) + (rj.physical.penanaman[yr] || 0) + (rlj.physical.penanaman[yr] || 0));
      const konversi = round2((jj.physical.konversiKerusakan[yr] || 0) + (rj.physical.konversiKerusakan[yr] || 0) + (rlj.physical.konversiKerusakan[yr] || 0));
      const tebang = round2((jj.physical.penebangan[yr] || 0) + (rj.physical.penebangan[yr] || 0) + (rlj.physical.penebangan[yr] || 0));
      const neto = round2((jj.physical.perubahanNeto[yr] || 0) + (rj.physical.perubahanNeto[yr] || 0) + (rlj.physical.perubahanNeto[yr] || 0));
      const akhir = round2((jj.physical.persediaanAkhir[yr] || 0) + (rj.physical.persediaanAkhir[yr] || 0) + (rlj.physical.persediaanAkhir[yr] || 0));

      ind.physical.persediaanAwal[yr] = awal;
      ind.physical.pertumbuhan[yr] = tumbuh;
      ind.physical.penanaman[yr] = tanam;
      ind.physical.konversiKerusakan[yr] = konversi;
      ind.physical.penebangan[yr] = tebang;
      ind.physical.perubahanNeto[yr] = neto;
      ind.physical.persediaanAkhir[yr] = akhir;

      if (i > 0 && prevYr && ind.physical.persediaanAkhir[prevYr]) {
        const prevAkhir = ind.physical.persediaanAkhir[prevYr];
        ind.physical.lajuPertumbuhanAkhir[yr] = round4(((akhir - prevAkhir) / prevAkhir) * 100);
      } else {
        ind.physical.lajuPertumbuhanAkhir[yr] = 0;
      }

      const awalMon = round2((jj.monetary.persediaanAwal[yr] || 0) + (rj.monetary.persediaanAwal[yr] || 0) + (rlj.monetary.persediaanAwal[yr] || 0));
      const tumbuhMon = round2((jj.monetary.pertumbuhan[yr] || 0) + (rj.monetary.pertumbuhan[yr] || 0) + (rlj.monetary.pertumbuhan[yr] || 0));
      const tanamMon = round2((jj.monetary.penanaman[yr] || 0) + (rj.monetary.penanaman[yr] || 0) + (rlj.monetary.penanaman[yr] || 0));
      const konversiMon = round2((jj.monetary.konversiKerusakan[yr] || 0) + (rj.monetary.konversiKerusakan[yr] || 0) + (rlj.monetary.konversiKerusakan[yr] || 0));
      const tebangMon = round2((jj.monetary.penebangan[yr] || 0) + (rj.monetary.penebangan[yr] || 0) + (rlj.monetary.penebangan[yr] || 0));
      const netoMon = round2((jj.monetary.perubahanNeto[yr] || 0) + (rj.monetary.perubahanNeto[yr] || 0) + (rlj.monetary.perubahanNeto[yr] || 0));
      const revalMon = round2((jj.monetary.revaluasi[yr] || 0) + (rj.monetary.revaluasi[yr] || 0) + (rlj.monetary.revaluasi[yr] || 0));
      const akhirMon = round2((jj.monetary.persediaanAkhir[yr] || 0) + (rj.monetary.persediaanAkhir[yr] || 0) + (rlj.monetary.persediaanAkhir[yr] || 0));

      ind.monetary.persediaanAwal[yr] = awalMon;
      ind.monetary.pertumbuhan[yr] = tumbuhMon;
      ind.monetary.penanaman[yr] = tanamMon;
      ind.monetary.konversiKerusakan[yr] = konversiMon;
      ind.monetary.penebangan[yr] = tebangMon;
      ind.monetary.perubahanNeto[yr] = netoMon;
      ind.monetary.revaluasi[yr] = revalMon;
      ind.monetary.persediaanAkhir[yr] = akhirMon;

      if (i > 0 && prevYr && ind.monetary.persediaanAkhir[prevYr]) {
        const prevAkhirMon = ind.monetary.persediaanAkhir[prevYr];
        ind.monetary.lajuPertumbuhanAkhir[yr] = round4(((akhirMon - prevAkhirMon) / prevAkhirMon) * 100);
      } else {
        ind.monetary.lajuPertumbuhanAkhir[yr] = 0;
      }

      if (akhir > 0) {
        ind.rent.unitRent[yr] = round2((akhirMon * 1000000) / akhir);
      } else {
        ind.rent.unitRent[yr] = 0;
      }
    }

    for (let i = 0; i < years.length; i++) {
      const yr = years[i];
      const prevYr = i > 0 ? years[i - 1] : null;
      if (i > 0 && prevYr && ind.rent.unitRent[prevYr]) {
        const prevRent = ind.rent.unitRent[prevYr];
        const curRent = ind.rent.unitRent[yr];
        ind.rent.pertumbuhanUnitRent[yr] = prevRent !== 0 ? round4(((curRent - prevRent) / prevRent) * 100) : 0;
      } else {
        ind.rent.pertumbuhanUnitRent[yr] = 0;
      }
    }
  }

  return data;
}

const SHEET_TABS = [
  { name: "Jati Jawa", badge: "Pulau Jawa" },
  { name: "Rimba Jawa", badge: "Pulau Jawa" },
  { name: "Rimba Luar Jawa", badge: "Luar Jawa" },
  { name: "Indonesia", badge: "Agregasi Otomatis" },
  { name: "Data Penunjang", badge: "Parameter Makro" },
  { name: "Import Mentah", badge: "Isi File Excel" },
];

const PHYSICAL_ROWS = [
  {
    id: "persediaanAwal",
    label: "1. Persediaan Awal",
    satuan: "000 MÂ³",
    decimals: 1,
    isFormula: (isNational, yIdx) => isNational || yIdx > 0,
    tooltip: () => "Tahun pertama = Input awal; Tahun berikutnya = Persediaan Akhir Tahun Lalu",
  },
  {
    id: "pertumbuhan",
    label: "2. Pertumbuhan Alami",
    satuan: "000 MÂ³",
    decimals: 1,
    isFormula: (isNational) => isNational,
    tooltip: (isNational) => (isNational ? "Agregasi = Jati Jawa + Rimba Jawa + Rimba Luar Jawa" : "Input Manual (Riap x Luas)"),
  },
  {
    id: "penanaman",
    label: "3. Penanaman (Reboisasi)",
    satuan: "000 MÂ³",
    decimals: 1,
    isFormula: (isNational) => isNational,
    tooltip: (isNational) => (isNational ? "Agregasi = Jati Jawa + Rimba Jawa + Rimba Luar Jawa" : "Input Manual (Penanaman)"),
  },
  {
    id: "konversiKerusakan",
    label: "4. Konversi & Kerusakan (Deforestasi/Kebakaran)",
    satuan: "000 MÂ³",
    decimals: 1,
    isFormula: (isNational) => isNational,
    tooltip: (isNational) => (isNational ? "Agregasi = Jati Jawa + Rimba Jawa + Rimba Luar Jawa" : "Input Manual (Kerusakan)"),
  },
  {
    id: "penebangan",
    label: "5. Penebangan (Produksi Kayu)",
    satuan: "000 MÂ³",
    decimals: 1,
    isFormula: (isNational) => isNational,
    tooltip: (isNational) => (isNational ? "Agregasi = Jati Jawa + Rimba Jawa + Rimba Luar Jawa" : "Input Manual (Penebangan)"),
  },
  {
    id: "perubahanNeto",
    label: "6. Perubahan Neto",
    satuan: "000 MÂ³",
    decimals: 1,
    isTotal: true,
    isFormula: () => true,
    tooltip: () => "fx: Pertumbuhan + Penanaman - Konversi - Penebangan",
  },
  {
    id: "persediaanAkhir",
    label: "7. Persediaan Akhir",
    satuan: "000 MÂ³",
    decimals: 1,
    isTotal: true,
    isFormula: () => true,
    tooltip: () => "fx: Persediaan Awal + Perubahan Neto",
  },
  {
    id: "lajuPertumbuhanAkhir",
    label: "Laju Pertumbuhan Persediaan Akhir (%)",
    satuan: "%",
    decimals: 2,
    isRate: true,
    isFormula: () => true,
    tooltip: () => "fx: (Akhir_t - Akhir_{t-1}) / Akhir_{t-1} * 100",
  },
];

const RENT_ROWS = [
  {
    id: "unitRent",
    label: "Unit Rent Kayu",
    satuan: "Rp / MÂ³",
    decimals: 0,
    isFormula: (isNational) => isNational,
    tooltip: (isNational) => (isNational ? "Rata-rata tertimbang nasional (Total Moneter / Total Fisik)" : "Input Manual Harga Unit Rent"),
  },
  {
    id: "pertumbuhanUnitRent",
    label: "Pertumbuhan Unit Rent (%)",
    satuan: "%",
    decimals: 2,
    isRate: true,
    isFormula: () => true,
    tooltip: () => "fx: (Rent_t - Rent_{t-1}) / Rent_{t-1} * 100",
  },
];

const MONETARY_ROWS = [
  { id: "persediaanAwal", label: "1. Persediaan Awal Moneter", satuan: "Miliar Rp", decimals: 1, tooltip: "Tahun pertama = Fisik * Rent / 1jt; Tahun berikutnya = Persediaan Akhir Moneter Tahun Lalu" },
  { id: "pertumbuhan", label: "2. Pertumbuhan Moneter", satuan: "Miliar Rp", decimals: 1, tooltip: "fx: Pertumbuhan Fisik * Unit Rent / 1,000,000" },
  { id: "penanaman", label: "3. Penanaman Moneter", satuan: "Miliar Rp", decimals: 1, tooltip: "fx: Penanaman Fisik * Unit Rent / 1,000,000" },
  { id: "konversiKerusakan", label: "4. Konversi & Kerusakan Moneter", satuan: "Miliar Rp", decimals: 1, tooltip: "fx: Konversi Fisik * Unit Rent / 1,000,000" },
  { id: "penebangan", label: "5. Penebangan Moneter", satuan: "Miliar Rp", decimals: 1, tooltip: "fx: Penebangan Fisik * Unit Rent / 1,000,000" },
  { id: "perubahanNeto", label: "6. Perubahan Neto Moneter", satuan: "Miliar Rp", decimals: 1, isTotal: true, tooltip: "fx: Perubahan Neto Fisik * Unit Rent / 1,000,000" },
  { id: "revaluasi", label: "7. Revaluasi (Perubahan Harga Unit Rent)", satuan: "Miliar Rp", decimals: 1, tooltip: "fx: Persediaan Awal Fisik * (Rent_t - Rent_{t-1}) / 1,000,000" },
  { id: "persediaanAkhir", label: "8. Persediaan Akhir Moneter", satuan: "Miliar Rp", decimals: 1, isTotal: true, tooltip: "fx: Persediaan Awal + Perubahan Neto + Revaluasi" },
  { id: "lajuPertumbuhanAkhir", label: "Laju Pertumbuhan Nilai Moneter (%)", satuan: "%", decimals: 2, isRate: true, tooltip: "fx: (AkhirMon_t - AkhirMon_{t-1}) / AkhirMon_{t-1} * 100" },
];

function FormulaChip() {
  return (
    <span className="legend-chip chip-formula">
      <IconCheck size={11} /> fx
    </span>
  );
}

function InputChip() {
  return (
    <span className="legend-chip chip-input">
      <IconEdit size={11} /> Input
    </span>
  );
}

function InputButton({ onClick, title = "Klik untuk input data komponen ini", disabled = false }) {
  return (
    <button
      type="button"
      className="ipn-btn-input-col"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <IconEdit size={12} />
      <span>Input Data</span>
    </button>
  );
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function avatarColor(id) {
  let hue = 0;
  const value = String(id);
  for (let i = 0; i < value.length; i++) hue = (hue * 31 + value.charCodeAt(i)) % 360;
  return `hsl(${hue}, 70%, 45%)`;
}

export default function InputPengolahanNeraca() {
  const toast = useToast();
  const currentUser = getUser();
  const [data, setData] = React.useState(null);
  const [activeUsers, setActiveUsers] = React.useState([]);
  const [presenceStatus, setPresenceStatus] = React.useState("connecting");
  const [loadError, setLoadError] = React.useState(null);
  const [activeSheet, setActiveSheet] = React.useState("Jati Jawa");
  const [rawSheetIdx, setRawSheetIdx] = React.useState(0);
  const [status, setStatus] = React.useState("saved");
  const statusRef = React.useRef(status);
  const [manualSaving, setManualSaving] = React.useState(false);
  const [addYearOpen, setAddYearOpen] = React.useState(false);
  const [newYear, setNewYear] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [includeHidden, setIncludeHidden] = React.useState(
    () => localStorage.getItem("sisnerling_neraca_include_hidden") !== "0"
  );
  const [theme, setTheme] = React.useState(() => localStorage.getItem("sisnerling_neraca_theme") || "light");
  const pendingCellUpdates = React.useRef(new Map());
  const saveChain = React.useRef(Promise.resolve());
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  React.useEffect(() => {
    const socket = ensureCollabSocket();
    if (!socket) {
      setPresenceStatus("offline");
      return undefined;
    }

    const onPresence = ({ users } = {}) => {
      setActiveUsers(Array.isArray(users) ? users : []);
    };
    const onNeracaUpdated = () => {
      loadSpreadsheet();
    };
    const joinPresence = () => {
      setPresenceStatus("connecting");
      socket.emit("join-neraca-presence", (result) => {
        if (result && result.ok) {
          setPresenceStatus("live");
          loadSpreadsheet();
        } else {
          setPresenceStatus("offline");
          console.error("Gagal bergabung ke presence Neraca Hutan:", result && result.error);
        }
      });
    };
    const onDisconnect = () => {
      setPresenceStatus("offline");
      setActiveUsers([]);
    };
    const onConnectError = (error) => {
      setPresenceStatus("offline");
      console.error("Koneksi presence Neraca Hutan gagal:", error.message);
    };

    socket.on("neraca-presence", onPresence);
    socket.on("neraca-updated", onNeracaUpdated);
    socket.on("connect", joinPresence);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    if (socket.connected) joinPresence();

    return () => {
      socket.off("neraca-presence", onPresence);
      socket.off("neraca-updated", onNeracaUpdated);
      socket.off("connect", joinPresence);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      if (socket.connected) socket.emit("leave-neraca-presence");
    };
  }, []);

  const loadSpreadsheet = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.neracaSpreadsheet();
      if (!res || !Array.isArray(res.years) || !res.sheets) {
        throw new Error(
          "Respons server tidak valid. Pastikan server API sudah dijalankan ulang (restart \"npm run dev\") agar rute /api/neraca aktif."
        );
      }
      if (
        pendingCellUpdates.current.size === 0 &&
        !["unsaved", "saving", "error"].includes(statusRef.current)
      ) {
        setData(res);
      }
    } catch (err) {
      setLoadError(err.message);
      toast(err.message, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    loadSpreadsheet();
    return () => {
      pendingCellUpdates.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("sisnerling_neraca_theme", next);
  };

  const toggleIncludeHidden = async (next) => {
    if (!(await flushCurrentDatasetChanges())) return;
    setIncludeHidden(next);
    localStorage.setItem("sisnerling_neraca_include_hidden", next ? "1" : "0");
    setImporting(true);
    try {
      const res = await api.neracaReimportHidden(next);
      setData(res);
      toast(res.message, "success");
    } catch (_) {
      // Tidak ada file Excel asli tersimpan (dataset baseline / import lama).
      // Preferensi tetap disimpan dan berlaku untuk impor berikutnya — tanpa error.
    } finally {
      setImporting(false);
    }
  };

  const [cellDrafts, setCellDrafts] = React.useState({});
  const [inputModalOpen, setInputModalOpen] = React.useState(false);
  const [activeInputRow, setActiveInputRow] = React.useState(null);
  const [rowDraftValues, setRowDraftValues] = React.useState({});
  const [originalRowValues, setOriginalRowValues] = React.useState({});
  const [quickFillVal, setQuickFillVal] = React.useState("");

  React.useEffect(() => {
    const hasUnSavedProgress =
      status === "unsaved" || status === "saving" || status === "error" ||
      pendingCellUpdates.current.size > 0 || Object.keys(cellDrafts).length > 0;
    if (!hasUnSavedProgress) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [status, cellDrafts]);

  const getCellDraftKey = (sheet, section, row, year) => `${sheet}:${section}:${row}:${year}`;
  const getPendingCellKey = (update) =>
    `${update.datasetId || ""}:${getCellDraftKey(update.sheet, update.section, update.row, update.year)}`;

  const commitCellDraft = (sheet, section, row, year) => {
    const key = getCellDraftKey(sheet, section, row, year);
    if (!(key in cellDrafts)) return;
    const raw = cellDrafts[key];
    const value = parseInputValue(raw);
    setCellDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    handleCellChange(sheet, section, row, year, value);
  };

  const cancelCellDraft = (sheet, section, row, year) => {
    const key = getCellDraftKey(sheet, section, row, year);
    if (Object.keys(cellDrafts).length <= 1 && pendingCellUpdates.current.size === 0) setStatus("saved");
    setCellDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const openRowInputModal = ({ def, section, source, isPenunjang }) => {
    if (!data) return;
    const rowId = def.id;
    const currentValues = {};
    const yearsList = data.years || [];
    yearsList.forEach((y) => {
      if (isPenunjang) {
        const rec = (data.sheets["Data Penunjang"]?.records || []).find((r) => r.id === rowId);
        currentValues[y] = rec && rec.values && rec.values[y] !== undefined ? String(rec.values[y]) : "0";
      } else {
        const s = data.sheets[activeSheet]?.[source]?.[rowId];
        currentValues[y] = s && s[y] !== undefined ? String(s[y]) : "0";
      }
    });
    setActiveInputRow({
      id: rowId,
      label: def.label || def.name,
      satuan: def.satuan,
      section,
      source,
      isPenunjang: !!isPenunjang,
      isFormula: def.isFormula,
    });
    setRowDraftValues({ ...currentValues });
    setOriginalRowValues({ ...currentValues });
    setQuickFillVal("");
    setInputModalOpen(true);
  };

  const applyQuickFill = () => {
    const clean = quickFillVal.trim();
    if (!clean) return;
    const num = parseInputValue(clean);
    const nextDraft = {};
    (data?.years || []).forEach((y) => {
      nextDraft[y] = String(num);
    });
    setRowDraftValues(nextDraft);
    toast(`Nilai ${num} diterapkan ke semua tahun. Tekan "Simpan Data" untuk konfirmasi.`, "info");
  };

  const handleResetRowDraftToOriginal = () => {
    setRowDraftValues({ ...originalRowValues });
    setQuickFillVal("");
    toast("Nilai dikembalikan ke angka awal.", "info");
  };

  const flushPendingCellUpdates = async () => {
    const updates = Array.from(pendingCellUpdates.current.values());
    pendingCellUpdates.current.clear();
    if (!updates.length) {
      await saveChain.current;
      return;
    }

    const request = saveChain.current
      .catch(() => {})
      .then(() => api.neracaUpdateCell({ updates }));
    saveChain.current = request;

    try {
      await request;
      setStatus(pendingCellUpdates.current.size ? "unsaved" : "saved");
    } catch (err) {
      updates.forEach((update) => {
        const key = getPendingCellKey(update);
        if (!pendingCellUpdates.current.has(key)) pendingCellUpdates.current.set(key, update);
      });
      setStatus("error");
      toast(err.message, "error");
      throw err;
    }
  };

  const flushCurrentDatasetChanges = async () => {
    if (pendingCellUpdates.current.size || Object.keys(cellDrafts).length) {
      toast("Ada perubahan yang belum disimpan. Klik \"Simpan Perubahan\" terlebih dahulu.", "error");
      return false;
    }
    return true;
  };

  const handleManualSave = async () => {
    const drafts = Object.entries(cellDrafts);
    if (!drafts.length && pendingCellUpdates.current.size === 0 && status !== "saving") {
      toast("Tidak ada perubahan yang perlu disimpan.", "info");
      return;
    }

    const updates = drafts.map(([key, raw]) => {
      const parts = key.split(":");
      const year = parts.pop();
      const row = parts.pop();
      const section = parts.pop();
      const sheet = parts.join(":");
      if (!sheet || !section || !row || !year) return null;
      return { datasetId: data.activeDatasetId, sheet, section, row, year, value: parseInputValue(raw) };
    });
    if (updates.some((update) => !update)) {
      toast("Ada perubahan sel yang identitasnya tidak valid.", "error");
      return;
    }

    setManualSaving(true);
    try {
      updates.forEach((update) => handleCellChange(
        update.sheet,
        update.section,
        update.row,
        update.year,
        update.value
      ));
      if (drafts.length) {
        setCellDrafts((prev) => {
          const next = { ...prev };
          drafts.forEach(([key]) => delete next[key]);
          return next;
        });
      }
      await flushPendingCellUpdates();
      toast("Perubahan Neraca Hutan berhasil disimpan dan tercatat di Audit Log.", "success");
    } catch {
      // flushPendingCellUpdates already reports save failures.
    } finally {
      setManualSaving(false);
    }
  };

  const handleSaveRowInputModal = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!activeInputRow || !data) return;

    try {
      await flushPendingCellUpdates();
    } catch {
      return;
    }

    const updates = [];
    const updatedData = JSON.parse(JSON.stringify(data));
    const yearsList = data.years || [];

    yearsList.forEach((y) => {
      const raw = rowDraftValues[y];
      const clean = parseInputValue(raw);
      if (activeInputRow.isPenunjang) {
        const rec = updatedData.sheets["Data Penunjang"]?.records?.find((r) => r.id === activeInputRow.id);
        if (rec) rec.values[y] = clean;
        updates.push({ datasetId: data.activeDatasetId, sheet: "Data Penunjang", section: "data_penunjang", row: activeInputRow.id, year: y, value: clean });
      } else {
        if (!updatedData.sheets[activeSheet][activeInputRow.section]) {
          updatedData.sheets[activeSheet][activeInputRow.section] = {};
        }
        if (!updatedData.sheets[activeSheet][activeInputRow.section][activeInputRow.id]) {
          updatedData.sheets[activeSheet][activeInputRow.section][activeInputRow.id] = {};
        }
        updatedData.sheets[activeSheet][activeInputRow.section][activeInputRow.id][y] = clean;
        updates.push({ datasetId: data.activeDatasetId, sheet: activeSheet, section: activeInputRow.section, row: activeInputRow.id, year: y, value: clean });
      }
    });

    recalculateLocal(updatedData);
    setData(updatedData);
    setInputModalOpen(false);
    setStatus("saving");

    try {
      let savedData;
      try {
        savedData = await api.neracaUpdateCell({ updates });
      } catch {
        await Promise.all(updates.map((update) => api.neracaUpdateCell(update)));
        savedData = await api.neracaSpreadsheet();
      }
      setData(savedData);
      setStatus("saved");
      toast(`Data "${activeInputRow.label}" berhasil disimpan dan seluruh neraca dihitung ulang!`, "success");
    } catch (err) {
      setStatus("error");
      toast(err.message, "error");
    }
  };

  const saveShortcutRef = React.useRef(null);
  saveShortcutRef.current = {
    action: inputModalOpen ? handleSaveRowInputModal : handleManualSave,
    enabled: !manualSaving && !importing && activeSheet !== "Import Mentah" && status !== "saving",
  };

  React.useEffect(() => {
    const handleSaveShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (saveShortcutRef.current.enabled) saveShortcutRef.current.action();
      }
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, []);

  const queueSave = (payload) => {
    setStatus("unsaved");
    const key = getPendingCellKey(payload);
    pendingCellUpdates.current.set(key, payload);
  };

  const handleCellChange = (sheet, section, row, year, raw) => {
    const value = parseInputValue(raw);
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (section === "data_penunjang") {
        const rec = next.sheets["Data Penunjang"].records.find((r) => r.id === row);
        if (rec) rec.values[year] = value;
      } else {
        next.sheets[sheet][section][row][year] = value;
      }
      recalculateLocal(next);
      return next;
    });
    queueSave({ datasetId: data?.activeDatasetId, sheet, section, row, year, value });
  };

  const openAddYear = () => {
    const lastYear = parseInt(data.years[data.years.length - 1], 10);
    setNewYear(String(lastYear + 1));
    setAddYearOpen(true);
  };

  const handleAddYear = async (e) => {
    e.preventDefault();
    const year = String(newYear).trim();
    if (!year) return;
    if (!(await flushCurrentDatasetChanges())) return;
    try {
      const res = await api.neracaAddYear(year);
      setData(res);
      setAddYearOpen(false);
      toast(`Kolom tahun ${year} berhasil ditambahkan`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Apakah Anda yakin ingin mengembalikan angka dataset aktif ke baseline acuan BPS? Nilai yang baru saja diketik akan diganti dengan data standar.")) {
      return;
    }
    if (!(await flushCurrentDatasetChanges())) return;
    try {
      const res = await api.neracaReset();
      setData(res);
      toast("Angka dataset aktif direset ke acuan BPS!", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleExport = async () => {
    try {
      const token = getToken();
      const res = await fetch(api.neracaExportCsvUrl(activeSheet), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Gagal mengunduh berkas CSV");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Neraca_${activeSheet.replace(/\s+/g, "_")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = getToken();
      const res = await fetch(api.neracaTemplateUrl(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Gagal mengunduh template Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      a.download = `Template_Neraca_Hutan_${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const processImportFile = async (file) => {
    if (!file) return;
    if (inputModalOpen) {
      toast("Simpan atau tutup form input sebelum mengimpor dataset baru.", "error");
      return;
    }
    const name = file.name || "";
    if (/^~\$/.test(name) || /\.(tmp|lock)$/i.test(name)) {
      toast("Itu file kunci sementara Excel (~$...). Tutup file di Excel, lalu pilih file .xlsx yang asli.", "error");
      return;
    }
    if (!/\.xlsx$/i.test(name)) {
      toast("Gunakan file .xlsx (bukan .xls atau CSV).", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("Ukuran file terlalu besar. Maksimal 10 MB.", "error");
      return;
    }
    setImporting(true);
    if (!(await flushCurrentDatasetChanges())) {
      setImporting(false);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).replace(/^data:.*;base64,/, "");
      setStatus("saving");
      try {
        const res = await api.neracaImport({ base64, filename: name, includeHidden });
        setData(res);
        setActiveSheet("Import Mentah");
        setRawSheetIdx(0);
        setStatus("saved");
        toast(res.message, "success");
      } catch (err) {
        setStatus("error");
        toast(err.message, "error");
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setImporting(false);
      toast(`Gagal membaca "${name}". Jika file sedang dibuka di Excel, tutup dulu lalu coba lagi.`, "error");
    };
    try {
      reader.readAsDataURL(file);
    } catch (err) {
      setImporting(false);
      toast("Gagal membaca file.", "error");
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    processImportFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!importing) setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (importing) return;
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    processImportFile(file);
  };

  const handleSelectDataset = async (id) => {
    if (importing || !id || id === data.activeDatasetId) return;
    if (inputModalOpen) {
      toast("Simpan atau tutup form input sebelum mengganti dataset.", "error");
      return;
    }
    if (!(await flushCurrentDatasetChanges())) {
      return;
    }
    try {
      const res = await api.neracaSelectDataset(id);
      setData(res);
      setRawSheetIdx(0);
      const ds = (res.datasets || []).find((d) => d.id === id);
      toast(`Dataset aktif: ${ds ? ds.name : id}`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleRenameDataset = async () => {
    if (!(await flushCurrentDatasetChanges())) return;
    const current = (data.datasets || []).find((d) => d.id === data.activeDatasetId);
    const name = window.prompt("Nama dataset:", current ? current.name : "");
    if (name === null) return;
    const clean = name.trim();
    if (!clean) {
      toast("Nama dataset tidak boleh kosong.", "error");
      return;
    }
    try {
      const res = await api.neracaRenameDataset(data.activeDatasetId, clean);
      setData(res);
      toast("Nama dataset diperbarui.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleDeleteDataset = async () => {
    if (!(await flushCurrentDatasetChanges())) return;
    const datasets = data.datasets || [];
    if (datasets.length <= 1) {
      toast("Minimal harus ada satu dataset.", "error");
      return;
    }
    const current = datasets.find((d) => d.id === data.activeDatasetId);
    if (!window.confirm(`Hapus dataset "${current ? current.name : ""}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    try {
      const res = await api.neracaDeleteDataset(data.activeDatasetId);
      setData(res);
      toast("Dataset dihapus.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (!data) {
    return (
      <div className="ipn-root" data-theme={theme}>
        {loadError ? (
          <div className="ipn-loading">
            <p style={{ color: "var(--ipn-danger-text)", marginBottom: 12 }}>{loadError}</p>
            <button className="btn btn-primary" onClick={loadSpreadsheet}>
              <IconRotate size={14} /> Coba Lagi
            </button>
          </div>
        ) : (
          <div className="ipn-loading">Memuat tabel neracaâ€¦</div>
        )}
      </div>
    );
  }

  const years = data.years;
  const isNational = activeSheet === "Indonesia";
  const isPenunjang = activeSheet === "Data Penunjang";
  const isRaw = activeSheet === "Import Mentah";
  const sh = data.sheets[activeSheet];
  const rawSheets = data.rawSheets || [];
  const rawActive = rawSheets[rawSheetIdx] || rawSheets[0] || null;
  const activeDataset = (data.datasets || []).find((dataset) => dataset.id === data.activeDatasetId);
  const importedFilename =
    activeDataset?.sourceFilename || (activeDataset?.source === "import" ? activeDataset.name : null);
  let rawRows = [];
  if (rawActive) {
    const rows = new Map();
    rawActive.cells.forEach((cell) => {
      if (!rows.has(cell.r)) rows.set(cell.r, new Map());
      rows.get(cell.r).set(cell.c, cell);
    });
    rawRows = Array.from(rows.entries()).sort((a, b) => a[0] - b[0]);
  }

  const statusNode =
    status === "saving" ? (
      <span><IconRotate size={13} /> Menghitung &amp; Menyimpanâ€¦</span>
    ) : status === "unsaved" ? (
      <span style={{ color: "#b45309" }}><IconAlert size={13} /> Belum disimpan</span>
    ) : status === "error" ? (
      <span style={{ color: "var(--ipn-danger-text)" }}><IconAlert size={13} /> Gagal Sinkron</span>
    ) : (
      <span style={{ color: "var(--ipn-success-text)" }}><IconCheck size={13} /> {status === "saved" ? "Formula Sinkron & Tersimpan" : "Formula Sinkron"}</span>
    );

  let title;
  let subtitle;
  if (isRaw) {
    title = (
      <>
        <IconFileExcel size={18} /> {importedFilename || "Import Mentah"} — Isi File Excel Apa Adanya
      </>
    );
    subtitle = rawSheets.length
      ? `Menampilkan ${rawSheets.length} sheet dari file yang diimpor, termasuk nilai hasil formula (cached). Data ini bersifat baca-saja.`
      : "Belum ada data mentah. Import file Excel terlebih dahulu untuk melihat isi file apa adanya.";
  } else if (isPenunjang) {
    title = (
      <>
        <IconCalendar size={18} /> Data Penunjang &amp; Parameter Nasional
      </>
    );
    subtitle = "Parameter statistik dasar KLHK, BPS, dan PDB Kehutanan yang menjadi rujukan kalkulasi neraca fisik. Seluruh nilai dapat diedit langsung.";
  } else if (isNational) {
    title = (
      <>
        <IconTable size={18} /> Neraca Kayu Indonesia (Rekap Agregasi Nasional)
      </>
    );
    subtitle = "Seluruh sel pada lembar ini otomatis teragregasi di belakang layar dari penjumlahan Jati Jawa + Rimba Jawa + Rimba Luar Jawa!";
  } else {
    title = (
      <>
        <IconTable size={18} /> Neraca {sh.commodity} â€” {sh.region} ({activeSheet})
      </>
    );
    subtitle = "Ketik angka di sel input (Persediaan Awal, Pertumbuhan, Penanaman, Konversi, Penebangan, Unit Rent) â€” Sel Perubahan Neto, Persediaan Akhir, dan Neraca Moneter otomatis menghitung seketika!";
  }

  const renderHeader = () => (
    <thead>
      <tr>
        <th className="col-indicator">Komponen / Indikator</th>
        <th className="col-satuan">Satuan</th>
        <th className="col-tipe" title="Gunakan tombol 'Input Data' untuk membuka form input, atau ketik langsung pada sel tahun">
          Kolom Input
        </th>
        {years.map((y) => (
          <th key={y} style={{ textAlign: "right", minWidth: 100 }}>
            {y}
          </th>
        ))}
      </tr>
    </thead>
  );

  const renderRegionalRows = (rows, section, source) => (
    <tbody>
      {rows.map((def) => {
        const trClass = def.isTotal ? "row-total" : def.isRate ? "row-rate" : "";
        const series = sh[source][def.id] || {};
        const firstFormula = def.isFormula ? def.isFormula(isNational, 0) : true;
        return (
          <tr key={def.id} className={trClass}>
            <td className="col-indicator">{def.label}</td>
            <td className="col-satuan">{def.satuan}</td>
            <td className="col-tipe">
              {isNational ? (
                <span
                  className="legend-chip chip-formula chip-clickable"
                  onClick={() => {
                    setActiveSheet("Jati Jawa");
                    toast("Membuka lembar 'Jati Jawa' untuk input data wilayah.", "info");
                  }}
                  title="Agregasi nasional otomatis (Jati Jawa + Rimba Jawa + Rimba Luar Jawa). Klik untuk beralih ke Jati Jawa untuk input data."
                >
                  <IconCheck size={11} /> Agregasi
                </span>
              ) : firstFormula ? (
                <FormulaChip />
              ) : (
                <InputButton
                  onClick={() => openRowInputModal({ def, section, source, isPenunjang: false })}
                  disabled={importing}
                  title={`Klik untuk membuka form input data ${def.label}`}
                />
              )}
            </td>
            {years.map((y, yIdx) => {
              const val = series[y] || 0;
              const isFormula = def.isFormula ? def.isFormula(isNational, yIdx) : true;
              if (isFormula) {
                return (
                  <td key={y} className="cell-formula" title={typeof def.tooltip === "function" ? def.tooltip(isNational) : def.tooltip}>
                    <span>{formatNumber(val, def.decimals)}</span>
                    <span className="formula-tag">fx</span>
                  </td>
                );
              }
              const draftKey = getCellDraftKey(activeSheet, section, def.id, y);
              const isDraft = draftKey in cellDrafts;
              const displayVal = isDraft ? cellDrafts[draftKey] : (val !== undefined && val !== null ? val : 0);
              return (
                <td key={y} className="cell-input" title={`Klik atau ketik untuk mengedit ${def.label} (${y})`}>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="cell-input-field"
                    value={displayVal}
                    disabled={importing}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCellDrafts((prev) => ({ ...prev, [draftKey]: v }));
                      setStatus("unsaved");
                    }}
                    onBlur={() => commitCellDraft(activeSheet, section, def.id, y)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        cancelCellDraft(activeSheet, section, def.id, y);
                      }
                    }}
                  />
                </td>
              );
            })}
          </tr>
        );
      })}
    </tbody>
  );

  return (
    <div
      className={`ipn-root${dragOver ? " ipn-dragover" : ""}`}
      data-theme={theme}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="ipn-drop-overlay">
          <IconUpload size={34} />
          <span>Lepaskan file .xlsx untuk diimpor</span>
        </div>
      )}
      <header className="app-header">
        <div className="header-container">
          <div className="brand-wrapper">
            <div className="brand-icon">
              <Logo size={40} />
            </div>
            <div className="brand-info">
              <h1>
                SISNERLING <span className="brand-tag">Input &amp; Pengolahan</span>
              </h1>
              <p>Tabel Input &amp; Pengolahan Neraca Hutan &amp; Timber â€” Formulasi Otomatis Real-Time</p>
            </div>
          </div>

          <div className="cell-legend">
            <div className="legend-item" title="Tombol 'Input Data' pada Kolom Input membuka form entri komprehensif">
              <span className="ipn-btn-input-col" style={{ pointerEvents: "none", padding: "0.15rem 0.5rem", fontSize: "0.68rem" }}>
                <IconEdit size={10} /> Input Data
              </span>
              <span>Form Input per Komponen</span>
            </div>
            <div className="legend-item" title="Sel putih pada kolom tahun dapat diketik langsung">
              <span className="legend-chip chip-input">
                <IconTable size={11} /> Sel Putih
              </span>
              <span>Ketik Langsung di Sel</span>
            </div>
            <div className="legend-item" title="Sel biru bertanda fx dihitung otomatis oleh formula di belakang layar">
              <FormulaChip />
              <span>Otomatis Real-Time</span>
            </div>
          </div>

          <div
            className="ipn-presence"
            role="status"
            aria-live="polite"
            title={
              activeUsers.length
                ? activeUsers.map((user) => user.nama).join(", ")
                : "Tidak ada pengguna yang sedang membuka halaman ini"
            }
          >
            <span className={`ipn-presence-dot ${presenceStatus}`} />
            <div className="ipn-presence-avatars" aria-label="Pengguna yang sedang online">
              {activeUsers.slice(0, 4).map((user) => (
                <span
                  key={user.id}
                  className="ipn-presence-avatar"
                  style={{ backgroundColor: avatarColor(user.id) }}
                  title={`${user.nama}${String(user.id) === String(currentUser?.id) ? " (Anda)" : ""}`}
                  aria-label={user.nama}
                >
                  {initials(user.nama)}
                </span>
              ))}
              {activeUsers.length > 4 && (
                <span className="ipn-presence-overflow">+{activeUsers.length - 4}</span>
              )}
            </div>
            <span className="ipn-presence-label">
              {presenceStatus === "live"
                ? `${activeUsers.length} online`
                : presenceStatus === "connecting"
                  ? "Menghubungkan…"
                  : "Offline"}
            </span>
          </div>

          <div className="header-buttons">
            <button
              className="btn btn-primary ipn-save-button"
              onClick={handleManualSave}
              disabled={manualSaving || importing || isRaw}
              title="Simpan semua perubahan sel (Ctrl+S / Cmd+S)"
              aria-busy={manualSaving}
            >
              <IconCheck size={15} /> {manualSaving ? "Menyimpan..." : "Simpan Perubahan"}
              {!manualSaving && <kbd className="ipn-save-shortcut">Ctrl / Cmd + S</kbd>}
            </button>
            <div className="ipn-primary-actions">
              <button className="btn btn-primary" onClick={openAddYear} disabled={importing} title="Tambah kolom periode tahun baru">
                <IconPlus size={14} /> Tambah Tahun
              </button>
            </div>
            <div className="ipn-secondary-actions" aria-label="Alat data lainnya">
              <button className="btn btn-secondary" onClick={handleExport} disabled={importing} title="Unduh tabel aktif ke format CSV">
                <IconDownload size={14} /> Unduh Excel/CSV
              </button>
              <button className="btn btn-secondary" onClick={handleDownloadTemplate} disabled={importing} title="Unduh template Excel (.xlsx) untuk diisi lalu diimpor">
                <IconFileExcel size={14} /> Template Excel
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleImportClick}
                disabled={importing}
                title="Unggah file .xlsx sesuai template (hanya mengisi sel input, sisanya dihitung ulang)"
              >
                <IconUpload size={14} /> {importing ? "Mengimporâ€¦" : "Import Excel"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />
              <button className="btn btn-secondary" onClick={handleReset} disabled={importing} title="Kembalikan data ke nilai awal acuan BPS">
                <IconRotate size={14} /> Reset Angka
              </button>
              <button className="btn btn-secondary btn-icon" onClick={toggleTheme} title="Ganti mode gelap / terang">
                <IconCoins size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="ipn-dataset-bar">
        <span className="ipn-dataset-label">Dataset</span>
        <select
          className="ipn-dataset-select"
          value={data.activeDatasetId || ""}
          onChange={(e) => handleSelectDataset(e.target.value)}
          disabled={importing}
          title="Pilih dataset yang ditampilkan"
        >
          {(data.datasets || []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {importedFilename && (
          <span className="ipn-source-file" title={`File Excel sumber: ${importedFilename}`}>
            File sumber: <b>{importedFilename}</b>
          </span>
        )}
        {(() => {
          const active = (data.datasets || []).find((d) => d.id === data.activeDatasetId);
          if (!active || active.includeHidden === undefined) return null;
          return (
            <span
              className={`ipn-import-mode${active.includeHidden ? " on" : " off"}`}
              title="Mode impor yang dipakai dataset ini"
            >
              {active.includeHidden ? "Impor: hidden disertakan" : "Impor: hidden dilewati"}
            </span>
          );
        })()}
        <button className="btn btn-secondary" onClick={handleRenameDataset} disabled={importing} title="Ganti nama dataset aktif">
          <IconEdit size={13} /> Ganti Nama
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleDeleteDataset}
          disabled={importing || (data.datasets || []).length <= 1}
          title="Hapus dataset aktif"
        >
          <IconTrash size={13} /> Hapus
        </button>
        <label
          className="ipn-hidden-toggle"
          title="Jika dicentang, sheet/baris/kolom yang disembunyikan di Excel ikut diimpor. Jika tidak dicentang, bagian tersembunyi dilewati. Perubahan langsung diterapkan pada dataset aktif."
        >
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(e) => toggleIncludeHidden(e.target.checked)}
            disabled={importing}
          />
          <span>Sertakan data tersembunyi saat impor</span>
        </label>
        <span className="ipn-dataset-hint">
          Toggle hidden langsung menerapkan perubahan pada dataset aktif. Import Excel (atau tarik-lepas file ke halaman) membuat dataset <b>baru</b>; data lama tetap utuh.
        </span>
      </div>

      <div className="ipn-save-reminder" role="status">
        <IconAlert size={16} />
        <span>
          Perubahan tidak disimpan otomatis. Klik <b>Simpan Perubahan</b> untuk menyimpan progres.
          Status <b>Belum disimpan</b> berarti perubahan hanya tersimpan sementara di halaman ini.
          Pastikan status kembali menjadi <b>Formula Sinkron &amp; Tersimpan</b> sebelum meninggalkan halaman.
          Super Admin dapat memulihkan nilai sebelum perubahan melalui Audit Log.
        </span>
      </div>

      <nav className="sheet-tabs-container">
        {SHEET_TABS.map((tab) => (
          <button
            key={tab.name}
            className={`sheet-tab${activeSheet === tab.name ? " active" : ""}`}
            onClick={() => setActiveSheet(tab.name)}
          >
            <IconGrid size={14} />
            <span>{tab.name}</span>
            <span className="sheet-badge">{tab.badge}</span>
          </button>
        ))}
      </nav>

      <div className="spreadsheet-card">
        <div className="sheet-meta-bar">
          <div className="sheet-meta-title">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="sheet-toolbar">{statusNode}</div>
        </div>

        {isRaw ? (
          <div>
            {rawSheets.length > 1 && (
              <div className="section-header">
                <span><IconFileExcel size={14} /> Pilih Sheet Mentah</span>
                <select
                  className="ipn-dataset-select"
                  value={rawSheetIdx}
                  onChange={(e) => setRawSheetIdx(Number(e.target.value))}
                  disabled={importing}
                  title="Sheet dari file Excel yang diimpor"
                >
                  {rawSheets.map((rs, i) => (
                    <option key={rs.name + i} value={i}>
                      {rs.name}{rs.state !== "visible" ? " (tersembunyi)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {rawActive ? (
              <>
                <div className="section-header">
                  <span><IconGrid size={14} /> {rawActive.name}</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, opacity: 0.8 }}>
                    {rawActive.rowCount} baris × {rawActive.colCount} kolom — {rawActive.cells.length} sel terisi
                  </span>
                </div>
                <div className="spreadsheet-table-wrapper">
                  <table className="spreadsheet-grid">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "center", minWidth: 40 }}>#</th>
                        {Array.from({ length: Math.min(rawActive.colCount, 60) }, (_, ci) => (
                          <th key={ci} style={{ textAlign: "center", minWidth: 80 }}>
                            {String.fromCharCode(65 + (ci % 26)) + (ci >= 26 ? String.fromCharCode(65 + Math.floor(ci / 26) - 1) : "")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawRows.map(([r, rowCells]) => {
                        return (
                          <tr key={r}>
                            <td style={{ textAlign: "center", fontWeight: 700, opacity: 0.5, background: "var(--ipn-surface, #f5f5f5)" }}>{r}</td>
                            {Array.from({ length: Math.min(rawActive.colCount, 60) }, (_, ci) => ci + 1).map((c) => {
                              const cell = rowCells.get(c);
                              if (!cell) return <td key={c} />;
                              const cls = cell.t === "formula" || cell.t === "formula-empty"
                                ? "cell-formula"
                                : cell.t === "number"
                                ? ""
                                : "cell-input";
                              return (
                                <td key={c} className={cls} title={cell.t === "formula" ? "Nilai hasil formula dari Excel" : undefined}>
                                  {typeof cell.v === "number"
                                    ? formatNumber(cell.v, Number.isInteger(cell.v) ? 0 : 4)
                                    : String(cell.v ?? "")}
                                  {cell.t === "formula" && <span className="formula-tag">fx</span>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p style={{ padding: "2rem", textAlign: "center", opacity: 0.7 }}>
                Belum ada data mentah. Import file Excel untuk mengisi tab ini.
              </p>
            )}
          </div>
        ) : isPenunjang ? (
          <div>
            <div className="section-header">
              <span>PARAMETER &amp; DATA PENUNJANG NASIONAL</span>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, opacity: 0.8 }}>
                Data Statistik KLHK &amp; BPS (Kebakaran, Reboisasi, Produksi Kayu)
              </span>
            </div>
            <div className="spreadsheet-table-wrapper">
              <table className="spreadsheet-grid">
                <thead>
                  <tr>
                    <th className="col-indicator">Indikator Parameter</th>
                    <th className="col-satuan">Satuan</th>
                    <th className="col-tipe" title="Gunakan tombol 'Input Data' untuk membuka form input, atau ketik langsung pada sel tahun">
                      Kolom Input
                    </th>
                    {years.map((y) => (
                      <th key={y} style={{ textAlign: "right", minWidth: 100 }}>
                        {y}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(sh.records || []).map((rec) => (
                    <tr key={rec.id}>
                      <td className="col-indicator">{rec.name}</td>
                      <td className="col-satuan">{rec.satuan}</td>
                      <td className="col-tipe">
                        <InputButton
                          onClick={() => openRowInputModal({ def: rec, section: "data_penunjang", source: "records", isPenunjang: true })}
                          disabled={importing}
                          title={`Klik untuk membuka form input data ${rec.name}`}
                        />
                      </td>
                      {years.map((y) => {
                        const val = rec.values[y] || 0;
                        const draftKey = getCellDraftKey("Data Penunjang", "data_penunjang", rec.id, y);
                        const isDraft = draftKey in cellDrafts;
                        const displayVal = isDraft ? cellDrafts[draftKey] : (val !== undefined && val !== null ? val : 0);
                        return (
                          <td key={y} className="cell-input" title={`Klik atau ketik untuk mengedit ${rec.name} (${y})`}>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="cell-input-field"
                              value={displayVal}
                              disabled={importing}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCellDrafts((prev) => ({ ...prev, [draftKey]: v }));
                                setStatus("unsaved");
                              }}
                              onBlur={() => commitCellDraft("Data Penunjang", "data_penunjang", rec.id, y)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  cancelCellDraft("Data Penunjang", "data_penunjang", rec.id, y);
                                }
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <div className="section-header">
              <span><IconGrid size={14} /> I. NERACA FISIK (000 MÂ³)</span>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, opacity: 0.8 }}>Satuan: Ribu Meter Kubik (000 MÂ³)</span>
            </div>
            <div className="spreadsheet-table-wrapper">
              <table className="spreadsheet-grid">
                {renderHeader()}
                {renderRegionalRows(PHYSICAL_ROWS, "physical", "physical")}
              </table>
            </div>

            <div className="section-header">
              <span><IconTag size={14} /> II. UNIT RENT (Rp / MÂ³)</span>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, opacity: 0.8 }}>Harga Unit Rent Kayu Tegakan</span>
            </div>
            <div className="spreadsheet-table-wrapper">
              <table className="spreadsheet-grid">
                {renderHeader()}
                {renderRegionalRows(RENT_ROWS, "rent", "rent")}
              </table>
            </div>

            <div className="section-header">
              <span><IconCoins size={14} /> III. NERACA MONETER (MILIAR RP)</span>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, opacity: 0.8 }}>Nilai Ekonomi Aset Sumber Daya Hutan (Miliar Rupiah)</span>
            </div>
            <div className="spreadsheet-table-wrapper">
              <table className="spreadsheet-grid">
                {renderHeader()}
                <tbody>
                  {MONETARY_ROWS.map((def) => {
                    const trClass = def.isTotal ? "row-total" : def.isRate ? "row-rate" : "";
                    const series = (sh.monetary && sh.monetary[def.id]) || {};
                    return (
                      <tr key={def.id} className={trClass}>
                        <td className="col-indicator">{def.label}</td>
                        <td className="col-satuan">{def.satuan}</td>
                        <td className="col-tipe">
                          <FormulaChip />
                        </td>
                        {years.map((y) => {
                          const val = series[y] || 0;
                          return (
                            <td key={y} className="cell-formula" title={def.tooltip}>
                              <span>{formatNumber(val, def.decimals)}</span>
                              <span className="formula-tag">fx</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {inputModalOpen && activeInputRow && (
        <Modal
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <IconEdit size={16} />
              <span>Input Data: {activeInputRow.label}</span>
            </div>
          }
          onClose={() => setInputModalOpen(false)}
          width="760px"
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setInputModalOpen(false)}
              >
                Batal
              </button>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleResetRowDraftToOriginal}
                  title="Kembalikan angka ke nilai saat modal dibuka"
                >
                  <IconRotate size={13} /> Reset
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveRowInputModal}
                >
                  <IconCheck size={13} /> Simpan Data &amp; Hitung Neraca
                </button>
              </div>
            </div>
          }
        >
          <div className="ipn-modal-content">
            <div className="ipn-modal-meta-banner">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <strong style={{ fontSize: "1rem", color: "var(--text-main)" }}>{activeInputRow.label}</strong>
                  <span className="ipn-modal-badge">{activeInputRow.satuan}</span>
                </div>
                <div className="ipn-modal-sheet-info">
                  Lembar: <strong>{activeSheet}</strong>
                </div>
              </div>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Ketik angka untuk tahun yang ingin diubah. Gunakan <b>Isi Cepat</b> bila ingin mengisi seluruh tahun dengan angka yang sama sekaligus. Tekan tombol <b>Simpan Data &amp; Hitung Neraca</b> untuk menerapkan ke tabel dan menghitung formula real-time.
              </p>
            </div>

            <div className="ipn-modal-quickfill">
              <span className="ipn-modal-quickfill-label">Isi Cepat (Semua Tahun):</span>
              <input
                type="text"
                inputMode="decimal"
                className="ipn-modal-quickfill-input"
                placeholder="Contoh: 5000"
                value={quickFillVal}
                onChange={(e) => setQuickFillVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyQuickFill();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.38rem 0.75rem", fontSize: "0.8rem" }}
                onClick={applyQuickFill}
                title="Terapkan nilai ini ke semua kotak tahun di bawah"
              >
                <IconCheck size={12} /> Terapkan ke Semua Tahun
              </button>
            </div>

            <div className="ipn-modal-years-grid">
              {(data?.years || []).map((y, yIdx) => {
                const isPersediaanAwalAuto = activeInputRow.id === "persediaanAwal" && yIdx > 0;
                return (
                  <div key={y} className={`ipn-modal-year-card${isPersediaanAwalAuto ? " is-auto" : ""}`}>
                    <div className="ipn-modal-year-header">
                      <span className="ipn-modal-year-title">{y}</span>
                      {activeInputRow.id === "persediaanAwal" && (
                        <span className="ipn-modal-year-tag">
                          {yIdx === 0 ? "Tahun Awal" : "fx Otomatis"}
                        </span>
                      )}
                    </div>
                    <div className="ipn-modal-input-wrapper">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="ipn-modal-year-input"
                        value={rowDraftValues[y] !== undefined ? rowDraftValues[y] : ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRowDraftValues((prev) => ({ ...prev, [y]: val }));
                        }}
                        placeholder="0"
                      />
                      <span className="ipn-modal-input-unit">{activeInputRow.satuan}</span>
                    </div>
                    {isPersediaanAwalAuto && (
                      <span className="ipn-modal-year-hint">
                        * Mengikuti persediaan akhir {data.years[yIdx - 1]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {addYearOpen && (
        <Modal
          title="Tambah Kolom Tahun Baru"
          onClose={() => setAddYearOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAddYearOpen(false)}>
                Batal
              </button>
              <button type="submit" form="ipn-add-year" className="btn btn-primary">
                <IconPlus size={13} /> Tambahkan
              </button>
            </>
          }
        >
          <form id="ipn-add-year" className="ipn-form" onSubmit={handleAddYear}>
            <label htmlFor="ipn-new-year">Tahun Baru (Contoh: 2025)</label>
            <input
              id="ipn-new-year"
              type="number"
              className="ipn-input"
              min="1990"
              max="2100"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              required
            />
            <small>Kolom tahun baru otomatis ditambahkan ke seluruh tabel dan rumus estimasi langsung aktif.</small>
          </form>
        </Modal>
      )}
    </div>
  );
}
