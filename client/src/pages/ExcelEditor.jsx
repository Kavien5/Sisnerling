import React from "react";
import * as XLSX from "xlsx-js-style";
import { useToast } from "../components/Toast.jsx";
import { api } from "../api.js";
import { getUser, isSuperAdmin } from "../auth.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
import { colName, evaluateGrid, cellAddress, createExternalResolverHook } from "../spreadsheet.js";
import { saveDraftSheets, loadDraftSheets } from "../excelDrafts.js";
import { createEmptySheet, workbookToSheets, workbookToSheetsProgressive, firstSheetFromWorkbook, sheetsToWorkbook, autoFitSheet, insertColumnIntoSheet, insertRowIntoSheet, deleteRowsFromSheet, deleteColumnsFromSheet, applyBordersToSheet, debugImportFidelity, bakeThemeColors } from "../excelImportUtil.js";
import ExcelGrid from "../components/ExcelGrid.jsx";
import ExcelToolbar from "../components/ExcelToolbar.jsx";
import Modal from "../components/Modal.jsx";
import PerbandinganData from "../components/PerbandinganData.jsx";
import { sheetsToTables } from "../perbandinganUtils.js";
import { saveFile, removeFile, generateId, flushSync, ensureFileLoaded } from "../excelStorage.js";
import { openFileZip, extractImagesFromZip } from "../excelImages.js";
import { enrichWorkbookFromZip } from "../excelRawStyles.js";
import {
  snapshotVersion,
  listVersions,
  getVersion,
  trashFile,
  listTrashedFiles,
  restoreTrashedFile,
  restoreAllTrash,
  purgeFileHistory,
  purgeAllTrash,
  purgeVersion,
  purgeAllVersions,
} from "../excelHistory.js";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
);

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#a855f7", "#f43f5e", "#84cc16", "#0ea5e9", "#6d28d9",
];

const LEGACY_KEY = "sisnerling_spreadsheet_workbook1";

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (_) {
    return iso || "";
  }
}

function emptyWorkbook() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[]]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return wb;
}

// Layout sheet, konversi workbook<->sheets, dan penulisan ulang referensi rumus
// dipindah ke ../excelImportUtil.js agar dipakai bersama dengan ExcelResult.

function detectColTypes(rows, columns) {
  const types = {};
  for (const col of columns) {
    let numCount = 0;
    let textCount = 0;
    const sample = rows.slice(0, 50);
    for (const row of sample) {
      const v = row[col.key];
      if (v === "" || v === null || v === undefined) continue;
      if (typeof v === "number") { numCount++; continue; }
      const s = String(v).trim();
      if (s === "") continue;
      if (!isNaN(Number(s))) { numCount++; continue; }
      textCount++;
    }
    types[col.key] = numCount > textCount && numCount > 2 ? "number" : "text";
  }
  return types;
}

export default function ExcelEditor({ importedFiles = [], onFilesChanged, readOnly = false, openFileId = null }) {
  const toast = useToast();
  const [publishing, setPublishing] = React.useState(false);
  const gridRef = React.useRef(null);
  const prevFileIdRef = React.useRef(null);
  // Workbook yang sudah dimuat ke grid, agar lazy-load tidak mengulang
  // pemuatan yang sama setiap render.
  const loadedWorkbookRef = React.useRef(null);
  const [activeFileId, setActiveFileId] = React.useState(() => openFileId || importedFiles[importedFiles.length - 1]?.id || null);
  // Workbook awal hanya bisa dibangun bila byte file sudah ada di memori.
// File dari server dimuat secara lazy (lihat loadFileWithDraft), jadi saat
// daftar baru dimuat kita mulai dari sheet kosong lalu effector di bawah yang
// mengisi grid begitu workbook-nya tersedia.
  const [initialFile] = React.useState(
    () => importedFiles.find((f) => f.id === openFileId) || importedFiles[importedFiles.length - 1] || null
  );
  const [sheets, setSheets] = React.useState(() =>
    initialFile && initialFile.workbook
      ? [autoFitSheet(firstSheetFromWorkbook(initialFile.workbook, { native: true }))]
      : [createEmptySheet("Sheet1")]
  );
  const sheetsRef = React.useRef(sheets);
  const [activeSheetIdx, setActiveSheetIdx] = React.useState(0);
  const [computed, setComputed] = React.useState(new Map());
  const [showChart, setShowChart] = React.useState(false);
  const [chartType, setChartType] = React.useState("bar");
  const [chartXCol, setChartXCol] = React.useState("");
  const [chartYCols, setChartYCols] = React.useState([]);
  const [chartKey, setChartKey] = React.useState(0);
  const [showCompare, setShowCompare] = React.useState(false);
  const [renamingSheet, setRenamingSheet] = React.useState(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [showImport, setShowImport] = React.useState(false);
  const [importDrag, setImportDrag] = React.useState(false);
  const [importError, setImportError] = React.useState("");
  const [fillColor, setFillColor] = React.useState("#fff2cc");
  const [borderWeight, setBorderWeight] = React.useState(1);
  const [fxState, setFxState] = React.useState({ fxValue: "", fxRefText: "", hasActive: false });
  const [activeCellIdx, setActiveCellIdx] = React.useState(null);
  const [activeCellRow, setActiveCellRow] = React.useState(null);

  const handleFxStateChange = (st) => {
    setFxState(st);
    setActiveCellIdx(st.activeColIdx ?? null);
    setActiveCellRow(st.activeRowIdx ?? null);
  };

  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);
  const undoStackRef = React.useRef([]);
  const redoStackRef = React.useRef([]);
  const [filterMode, setFilterMode] = React.useState(false);
  const [colFilter, setColFilter] = React.useState({});
  const [searchText, setSearchText] = React.useState("");
  const [matchCount, setMatchCount] = React.useState(null);
  const [frozen, setFrozen] = React.useState(true);
  const [toolbarCollapsed, setToolbarCollapsed] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const clampZoom = React.useCallback((z) => Math.max(0.5, Math.min(2, Math.round(z * 100) / 100)), []);
  const handleZoomChange = React.useCallback((z) => setZoom(clampZoom(z)), [clampZoom]);
  const [selImgIdx, setSelImgIdx] = React.useState(-1);

  const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48];

  const handleApplyFill = (color) => {
    gridRef.current?.applyFill(color);
    setFillColor(color || "#fff2cc");
  };

  const [saveFlash, setSaveFlash] = React.useState("");
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [renameFileModal, setRenameFileModal] = React.useState(false);
  const [renameFileName, setRenameFileName] = React.useState("");
  const [confirmDeleteFile, setConfirmDeleteFile] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [versions, setVersions] = React.useState([]);
  const [trashedFiles, setTrashedFiles] = React.useState([]);
  const [historyTab, setHistoryTab] = React.useState("versi");
  const [confirmPurge, setConfirmPurge] = React.useState(null);
  const [confirmPurgeFiles, setConfirmPurgeFiles] = React.useState(null);
  const [confirmPurgeAll, setConfirmPurgeAll] = React.useState(false);
  const [confirmPurgeAllVersions, setConfirmPurgeAllVersions] = React.useState(false);
  const [fidOpen, setFidOpen] = React.useState(false);

  const activeFile = importedFiles.find((f) => f.id === activeFileId) || null;

  // DEBUG WAJIB: bandingkan workbook ASLI vs grid hasil import, cell-per-cell
  // oleh alamat (A1..). Status 1:1 (atau daftar sel yang berbeda) ditampilkan
  // di bawah fx-bar untuk setiap file terimport — bukan sekadar klaim.
  const fid = React.useMemo(() => {
    if (!activeFile || !activeFile.workbook) return null;
    return debugImportFidelity(activeFile.workbook);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileId, activeFile]);
  const activeSheet = sheets[activeSheetIdx];
  // Bentuk/gambar yang sedang diklik di grid — untuk diubah warnanya lewat menu Format.
  const selShape = activeSheet && selImgIdx >= 0 ? (activeSheet.images || [])[selImgIdx] || null : null;

  const allSheetsMap = React.useMemo(() => {
    const m = {};
    for (const s of sheets) {
      m[s.name.toUpperCase()] = s;
    }
    return m;
  }, [sheets]);

  // Draft edit per file (termasuk rumus & referensi antar-file) untuk pemulihan
  // saat refresh / pindah halaman, dan sebagai sumber nilai "live" file lain
  // saat mengevaluasi referensi lintas-file.
  const draftCacheRef = React.useRef(new Map());
  const [draftRevision, setDraftRevision] = React.useState(0);

  const baseNameOf = (name) => String(name || "").replace(/\.(xlsx?|xlsm)$/i, "");

  // Peta sheet bergaya-grid per file untuk referensi antar-file. File yang punya
  // draft (hasil edit) dipakai nilai live-nya; file aktif memakai grid editor
  // langsung. Kunci = nama file UPPERCASE (dengan & tanpa ekstensi).
  const fileSheets = React.useMemo(() => {
    const m = {};
    const addSheetsForFile = (sheetsArr, names) => {
      if (!sheetsArr || !sheetsArr.length) return;
      const byName = {};
      for (const s of sheetsArr) {
        byName[s.name.toUpperCase()] = s;
      }
      for (const nm of names) {
        if (nm) m[nm] = byName;
      }
    };
    if (activeFile) {
      addSheetsForFile(sheets, [String(activeFile.fileName).toUpperCase(), baseNameOf(activeFile.fileName).toUpperCase()]);
    }
    for (const f of importedFiles) {
      const draft = draftCacheRef.current.get(f.id);
      if (draft && draft.length) {
        addSheetsForFile(draft, [String(f.fileName).toUpperCase(), baseNameOf(f.fileName).toUpperCase()]);
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importedFiles, sheets, activeFile, draftRevision]);

  // Resolver workbook eksternal: membaca data file lain yang TIDAK punya draft
  // (masih asli) untuk referensi antar-file. Rumus di dalamnya ikut dievaluasi,
  // dan resolver dimemo sehingga referensi melingkar antar-file jadi #CYCLE!.
  const externalHook = React.useMemo(() => {
    const byKey = new Map();
    for (const f of importedFiles) {
      const names = [String(f.fileName).toUpperCase(), baseNameOf(f.fileName).toUpperCase()];
      for (const k of names) {
        if (k && !byKey.has(k)) byKey.set(k, f.workbook);
      }
    }
    return createExternalResolverHook(byKey);
  }, [importedFiles]);

  // Performa: deteksi apakah sheet aktif memuat rumus. Sheet tanpa rumus (mayoritas
  // hasil import Excel) TIDAK dihitung ulang sama sekali saat satu sel diubah —
  // nilai tampilan angka di sheet native sudah memakai nilai cached dari file.
  const formulaDensity = React.useMemo(() => {
    if (!activeSheet) return 0;
    // Sheet hasil impor membawa hitungan rumus O(1) dari importSheetNative —
    // tidak perlu memindai 26k sel per render.
    if (typeof activeSheet.__formulaCount === "number") {
      return activeSheet.__formulaCount;
    }
    let n = 0;
    const cols = activeSheet.columns;
    for (let ri = 0; ri < activeSheet.rows.length; ri++) {
      const row = activeSheet.rows[ri];
      for (let ci = 0; ci < cols.length; ci++) {
        const v = row[cols[ci].key];
        if (typeof v === "string" && v.startsWith("=")) {
          n++;
          if (n > 800) return n;
        }
      }
    }
    return n;
  }, [activeSheet]);

  // Evaluasi ulang rumus (termasuk antar-file) mengikuti state sheets LIVE.
  // Hasilnya (Map baris:kolom → nilai) dikirim ke grid untuk ditampilkan.
  // useDeferredValue dihindari di sini: nilainya bisa tidak pernah flush di
  // beberapa konteks, sehingga hasil rumus tidak tampil. Evaluator sudah
  // ringan (cache + hanya sel ber-rumus yang ditulis ulang).
  const deferredSheets = sheets;

  React.useEffect(() => {
    const sheet = deferredSheets[activeSheetIdx];
    if (!sheet) return;
    if (formulaDensity === 0) {
      setComputed(new Map());
      return;
    }
    const result = evaluateGrid(sheet.rows, sheet.columns, allSheetsMap, sheet.name.toUpperCase(), {
      fileSheets,
      external: externalHook,
    });
    setComputed(result);
  }, [deferredSheets, activeSheetIdx, allSheetsMap, formulaDensity, fileSheets, externalHook]);

  // Muat isi file yang dipilih (dari file terimport) ke grid editor — bertahap
  // (aktif dulu/instant, sisanya di waktu idle) supaya buka file besar tidak freeze.
  React.useEffect(() => {
    const file = importedFiles.find((f) => f.id === activeFileId);
    if (activeFileId !== prevFileIdRef.current && file) {
      prevFileIdRef.current = activeFileId;
      loadedWorkbookRef.current = null;
      loadFileWithDraft(file);
    }
    if (activeFileId) { setVersions(listVersions(activeFileId)); setTrashedFiles(listTrashedFiles()); }
  }, [activeFileId, importedFiles]);

  // Workbook file aktif bisa tiba SETELAH file dipilih: daftar dari server
  // sengaja dimuat lazy (byte .xlsx diunduh saat file dibuka). Effect ini
  // memuat grid begitu workbook-nya tersedia, supaya halaman Spreadsheet
  // menampilkan workbook asli dari server, bukan sheet kosong.
  const activeWorkbook = importedFiles.find((f) => f.id === activeFileId)?.workbook || null;
  React.useEffect(() => {
    if (!activeWorkbook) return;
    if (loadedWorkbookRef.current === activeWorkbook) return;
    loadedWorkbookRef.current = activeWorkbook;
    loadFileWithDraft(importedFiles.find((f) => f.id === activeFileId));
  }, [activeWorkbook]);

  // Unduh byte file aktif bila belum ada di memori. Setelah refresh / restart
  // backend / login ulang, daftar file dibaca dari server tanpa byte aslinya
  // (lazy). Tanpa langkah ini, Spreadsheet akan menampilkan grid kosong walau
  // file tersimpan permanen di server. Setelah byte tiba, daftar disegarkan
  // sehingga workbook ASLI (bukan salinan) tampil di grid.
  const fetchingFileRef = React.useRef(null);
  React.useEffect(() => {
    if (!activeFileId) return;
    const file = importedFiles.find((f) => f.id === activeFileId);
    if (!file || file.workbook) {
      fetchingFileRef.current = null;
      return;
    }
    if (fetchingFileRef.current === activeFileId) return;
    fetchingFileRef.current = activeFileId;
    let alive = true;
    ensureFileLoaded(activeFileId).then((loaded) => {
      if (!alive) return;
      fetchingFileRef.current = null;
      if (loaded) onFilesChanged?.();
    });
    return () => {
      alive = false;
    };
  }, [activeFileId, importedFiles]);

  // Muat byte SEMUA file di latar belakang (setelah file aktif tampil). Referensi
  // formula ANTAR-FILE (mis. Neraca Aset!Oil!T12 -> Neraca Terintegrasi!B10)
  // membutuhkan workbook file LAIN di memori. Tanpa langkah ini, setelah refresh
  // hanya file aktif yang punya byte sehingga rumus lintas-file menjadi kosong.
  // Dijaga dengan Set agar file yang gagal dimuat tidak memicu percobaan tak
  // berujung; percobaan berikutnya terjadi saat halaman dibuka lagi.
  const eagerLoadRef = React.useRef(new Set());
  React.useEffect(() => {
    const pending = importedFiles.filter(
      (f) => f && f.workbookCode && !f.workbook && !eagerLoadRef.current.has(f.id)
    );
    if (!pending.length) return undefined;
    for (const f of pending) eagerLoadRef.current.add(f.id);
    let alive = true;
    (async () => {
      for (const f of pending) {
        if (!alive) return;
        try {
          await ensureFileLoaded(f.id);
        } catch (_) {
          /* file individual gagal dimuat; file lain tetap diproses */
        }
      }
      if (alive) onFilesChanged?.();
    })();
    return () => {
      alive = false;
    };
  }, [importedFiles]);

  // Saat ada file baru yang diimpor, langsung buka hasil import terbaru tersebut
  // (impor baru selalu ditambahkan di posisi paling akhir daftar file).
  const prevImportedCountRef = React.useRef(importedFiles.length);
  React.useEffect(() => {
    const count = importedFiles.length;
    if (count > prevImportedCountRef.current) {
      const newest = importedFiles[count - 1];
      if (newest) setActiveFileId((cur) => (cur === newest.id ? cur : newest.id));
    }
    prevImportedCountRef.current = count;
  }, [importedFiles]);

  // Buka file tertentu yang diminta dari luar (mis. menekan "Buka" pada daftar
  // file terimport). runth saat prop openFileId berubah; jika file masih ada di
  // daftar, file itu yang dipilih.
  const prevOpenFileIdRef = React.useRef(openFileId);
  React.useEffect(() => {
    if (!openFileId || openFileId === prevOpenFileIdRef.current) return;
    prevOpenFileIdRef.current = openFileId;
    const next = importedFiles.find((f) => f.id === openFileId);
    if (!next) return;
    if (openFileId !== activeFileId) {
      flushGrid();
      persistActive();
      loadFileWithDraft(next);
      setActiveFileId(openFileId);
      prevFileIdRef.current = openFileId;
      onFilesChanged?.();
    }
  }, [openFileId, importedFiles]);

  // Sinkronkan ringkasan (Dashboard/Laporan/Kategori) dengan file yang aktif.
  const currentSheetsRef = React.useRef(sheets);
  const currentSheetIdxRef = React.useRef(activeSheetIdx);
  currentSheetsRef.current = sheets;
  currentSheetIdxRef.current = activeSheetIdx;

  const writeLegacy = (s, idx) => {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ sheets: s, activeSheetIdx: idx }));
    } catch (_) {
      // ignore quota / serialization errors
    }
  };

  React.useEffect(() => {
    writeLegacy(sheets, activeSheetIdx);
    if (activeFileId) {
      draftCacheRef.current.set(activeFileId, sheets);
      saveDraftSheets(activeFileId, sheets);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, activeSheetIdx, activeFileId]);

  const uniqueNewName = (baseName) => {
    let base = baseName;
    let n = 2;
    while (importedFiles.some((f) => f.fileName === base)) {
      base = `${baseName} (${n})`;
      n++;
    }
    return base;
  };

  const persistActive = () => {
    if (!activeFile) return;
    saveFile({ id: activeFile.id, fileName: activeFile.fileName, workbook: sheetsToWorkbook(sheetsRef.current), rawBase64: activeFile.rawBase64 });
    saveDraftSheets(activeFile.id, sheetsRef.current);
    // Unggahan ke server Normally tertunda; saat pindah file/keluar halaman
    // kita paksa kirim sekarang supaya edit terakhir tidak tertinggal di server.
    flushSync();
  };

  // Simpan otomatis saat halaman ditutup/di-refresh (pagehide/beforeunload)
  // agar edit terakhir (termasuk perpindahan gambar Home & isi sel) TIDAK
  // hilang. Handler dibangun ulang tiap file aktif berubah (closure segar).
  React.useEffect(() => {
    const persist = () => {
      if (!activeFileId || !activeFile) return;
      try {
        gridRef.current?.commitActive?.();
        saveFile({ id: activeFile.id, fileName: activeFile.fileName, workbook: sheetsToWorkbook(sheetsRef.current), rawBase64: activeFile.rawBase64 });
        saveDraftSheets(activeFile.id, sheetsRef.current);
        flushSync();
      } catch (_) {
        // penulisan gagal (quota) — abaikan agar unload tidak tersendat
      }
    };
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
    };
  }, [activeFileId, activeFile, importedFiles]);

  const flushGrid = () => {
    gridRef.current?.commitActive?.();
  };

  const refreshHistory = () => {
    if (activeFileId) setVersions(listVersions(activeFileId));
    setTrashedFiles(listTrashedFiles());
  };

  const loadWorkbookFromVersion = (versionId) => {
    if (!activeFileId) return null;
    return getVersion(activeFileId, versionId);
  };

  const handleSave = () => {
    flushGrid();
    let id = activeFileId;
    if (activeFile) {
      // Simpan snapshot sebelum menimpa, supaya versi sebelumnya tetap ada.
      snapshotVersion({
        fileId: activeFile.id,
        fileName: activeFile.fileName,
        workbook: sheetsToWorkbook(sheetsRef.current),
        label: "Simpan manual",
      });
      saveFile({ id: activeFile.id, fileName: activeFile.fileName, workbook: sheetsToWorkbook(sheetsRef.current), rawBase64: activeFile.rawBase64 });
    } else {
      id = generateId();
      saveFile({ id, fileName: uniqueNewName("Spreadsheet"), workbook: sheetsToWorkbook(sheetsRef.current) });
      snapshotVersion({
        fileId: id,
        fileName: uniqueNewName("Spreadsheet"),
        workbook: sheetsToWorkbook(sheetsRef.current),
        label: "File baru",
      });
      setActiveFileId(id);
    }
    onFilesChanged?.();
    refreshHistory();
    setSaveFlash("Tersimpan & backup dibuat");
    window.clearTimeout(handleSave._t);
    handleSave._t = window.setTimeout(() => setSaveFlash(""), 1800);
  };

  const handleNewFile = () => {
    // Simpan perubahan terakhir file yang sedang dibuka agar tidak hilang.
    flushGrid();
    persistActive();
    onFilesChanged?.();
    const id = generateId();
    const wb = emptyWorkbook();
    saveFile({ id, fileName: uniqueNewName("Spreadsheet"), workbook: wb });
    snapshotVersion({ fileId: id, fileName: uniqueNewName("Spreadsheet"), workbook: wb, label: "File baru" });
    const loaded = workbookToSheets(wb);
    resetUndoHistory();
    sheetsRef.current = loaded;
    setSheets(loaded);
    setActiveSheetIdx(0);
    prevFileIdRef.current = null;
    onFilesChanged?.();
    setActiveFileId(id);
    refreshHistory();
    setSaveFlash("");
  };

  const handleSelectFile = (id) => {
    if (id === activeFileId) return;
    // Commit edit yang belum selesai lalu simpan ke file yang sedang ditinggalkan.
    flushGrid();
    persistActive();
    const next = importedFiles.find((f) => f.id === id);
    if (next) {
      loadFileWithDraft(next);
    }
    setActiveFileId(id);
    prevFileIdRef.current = id;
    onFilesChanged?.();
    setActiveFileId(id);
  };
  const handleRenameFile = () => {
    const trimmed = renameFileName.trim();
    setRenameFileModal(false);
    if (!trimmed || !activeFile) return;
    flushGrid();
    const wb = sheetsToWorkbook(sheetsRef.current);
    snapshotVersion({ fileId: activeFile.id, fileName: trimmed, workbook: wb, label: "Ubah nama" });
    saveFile({ id: activeFile.id, fileName: trimmed, workbook: wb });
    onFilesChanged?.();
    refreshHistory();
  };

  const handleDeleteFile = () => {
    setConfirmDeleteFile(false);
    if (!activeFileId) return;
    // Soft delete — simpan versi terakhir dan tandai di trash agar bisa dikembalikan.
    const wb = sheetsToWorkbook(sheetsRef.current);
    snapshotVersion({
      fileId: activeFileId,
      fileName: activeFile?.fileName,
      workbook: wb,
      label: "Dihapus (trash)",
    });
    trashFile(activeFileId, "Dihapus (trash)");
    removeFile(activeFileId);
    const rest = importedFiles.filter((f) => f.id !== activeFileId);
    onFilesChanged?.();
    if (rest.length > 0) {
      setActiveFileId(rest[0].id);
    } else {
      setActiveFileId(null);
      prevFileIdRef.current = null;
      const empty = [createEmptySheet("Sheet1")];
      resetUndoHistory();
      sheetsRef.current = empty;
      setSheets(empty);
      setActiveSheetIdx(0);
    }
    refreshHistory();
    setSaveFlash("");
  };

  const handleClearAll = () => {
    const wbBefore = sheetsToWorkbook(sheetsRef.current);
    const emptyGrid = [createEmptySheet("Sheet1")];
    resetUndoHistory();
    sheetsRef.current = emptyGrid;
    setSheets(emptyGrid);
    setActiveSheetIdx(0);
    setConfirmClear(false);
    setSaveFlash("");
    if (activeFile) {
      // Simpan snapshot data sebelum dihapus agar tetap bisa dikembalikan.
      snapshotVersion({
        fileId: activeFile.id,
        fileName: activeFile.fileName,
        workbook: wbBefore,
        label: "Sebelum Hapus Semua",
      });
      saveFile({ id: activeFile.id, fileName: activeFile.fileName, workbook: sheetsToWorkbook(emptyGrid) });
      currentSheetsRef.current = emptyGrid;
      writeLegacy(emptyGrid, 0);
      onFilesChanged?.();
      refreshHistory();
    }
  };

  const pushUndoSnapshot = (prevSheets) => {
    try {
      undoStackRef.current.push(prevSheets.map((s) => JSON.parse(JSON.stringify(s))));
      if (undoStackRef.current.length > 50) undoStackRef.current.shift();
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
    } catch (_) {}
  };

  const resetUndoHistory = () => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  };

  // Pemuat workbook BERTAHAP: sheet 0 selesai dibangun duluan sehingga grid
  // langsung terisi, lalu sheet berikutnya disusulkan lewat requestIdleCallback
  // (time-slicing ~12ms). UI tidak pernah membeku saat membuka/import file besar.
  // Token ref membatalkan batch lama bila pengguna cepat berpindah file.
  const progressiveTokenRef = React.useRef(0);
  const loadWorkbookProgressive = (wb, opts, onSettled) => {
    const token = ++progressiveTokenRef.current;
    resetUndoHistory();
    setActiveSheetIdx(0);
    setComputed(new Map());
    sheetsRef.current = [];
    setSheets([]);
    return workbookToSheetsProgressive(
      wb,
      opts,
      (acc) => {
        if (progressiveTokenRef.current !== token) return;
        const fitted = acc.map((s) => autoFitSheet(s));
        sheetsRef.current = fitted;
        setSheets(fitted);
      },
      () => {
        if (progressiveTokenRef.current === token && onSettled) onSettled(sheetsRef.current);
      }
    );
  };

  // Buka file dengan pemulihan DRAFT edit (bila ada): grid menampilkan hasil
  // edit terakhir (rumus antar-file ikut kembali). Tanpa draft → muat dari
  // workbook asli seperti biasa. Token ref membatalkan draft kadaluarsa bila
  // pengguna cepat berpindah file sebelum IndexedDB selesai dibaca.
  const draftLoadTokenRef = React.useRef(0);
  const loadFileWithDraft = (file) => {
    if (!file) return;
    const token = ++draftLoadTokenRef.current;
    loadDraftSheets(file.id).then((draft) => {
      if (token !== draftLoadTokenRef.current) return;
      if (draft && draft.length) {
        const fitted = draft.map((s) => autoFitSheet(s));
        resetUndoHistory();
        setActiveSheetIdx(0);
        setComputed(new Map());
        sheetsRef.current = fitted;
        setSheets(fitted);
        draftCacheRef.current.set(file.id, fitted);
        setDraftRevision((r) => r + 1);
        saveDraftSheets(file.id, fitted);
      } else {
        // Workbook asli belum dimuat (file berasal dari server, byte-nya
        // diunduh saat file dibuka). Tunggu sampai tersedia agar grid tidak
        // menampilkan sheet kosong palsu.
        if (file.workbook) loadWorkbookProgressive(file.workbook, { native: true });
      }
    });
  };

  const updateSheet = (idx, updater, record = true) => {
    const prev = sheetsRef.current;
    if (record && prev.length) pushUndoSnapshot(prev);
    const next = [...prev];
    next[idx] = updater(next[idx]);
    sheetsRef.current = next;
    setSheets(next);
  };

  // Posisi/teks gambar & bentuk di sheet dikirim dari ExcelGrid (drag, edit
  // tulisan, hapus) → disimpan ke sheet. Nantinya ikut tersimpan saat saveFile.
  const handleImagesChange = (imgs) => {
    if (!sheetsRef.current.length) return;
    updateSheet(activeSheetIdx, (s) => ({ ...s, images: Array.isArray(imgs) ? imgs : [] }));
  };

  // Buat bentuk/shape baru di sheet aktif — seperti bentuk yang muncul dari
  // file impor. Bentuk ini bisa digeser, diubah ukuran, diedit tulisannya
  // (klik dua kali), atau dihapus (tombol Delete) langsung di grid.
  const handleAddShape = React.useCallback(
    (kind, fill) => {
      if (!sheetsRef.current.length) return;
      const idx = activeSheetIdx;
      updateSheet(idx, (s) => {
        const imgs = Array.isArray(s.images) ? s.images : [];
        const shape = {
          type: "shape",
          name: `Bentuk ${imgs.length + 1}`,
          col: Math.min(1, Math.max(0, (s.columns || []).length - 1)),
          row: Math.min(2, Math.max(0, (s.rows || []).length - 1)),
          dxPx: 6,
          dyPx: 6,
          w: 180,
          h: 64,
          shapeKind: kind || "rect",
          text: "",
          fill: fill || "#e53935",
          border: { weight: 2, color: "rgba(0,0,0,0.28)" },
          fontSizePx: 14,
          fontFamily: null,
          fontColor: "#ffffff",
          bold: false,
          alignH: "center",
          anchorV: "ctr",
          z: imgs.length,
        };
        return { ...s, images: [...imgs, shape] };
      });
    },
    [activeSheetIdx]
  );

  // Dorong perubahan kecil pada satu gambar/bentuk terpilih (warna dll).
  const patchSelectedImage = React.useCallback(
    (updater) => {
      if (!sheetsRef.current.length || selImgIdx < 0) return;
      const idx = activeSheetIdx;
      updateSheet(idx, (s) => {
        const imgs = Array.isArray(s.images) ? s.images : [];
        return {
          ...s,
          images: imgs.map((im, j) => (j === selImgIdx && im.type === "shape" ? updater(im) : im)),
        };
      });
    },
    [activeSheetIdx, selImgIdx]
  );

  const handleSelectImage = React.useCallback((i) => setSelImgIdx(i), []);
  const handleShapeFill = React.useCallback(
    (color) => patchSelectedImage((im) => ({ ...im, fill: color || null })),
    [patchSelectedImage]
  );
  const handleShapeTextColor = React.useCallback(
    (color) => patchSelectedImage((im) => ({ ...im, fontColor: color || "#000000" })),
    [patchSelectedImage]
  );
  const handleShapeBold = React.useCallback(
    () => patchSelectedImage((im) => ({ ...im, bold: !im.bold })),
    [patchSelectedImage]
  );

  // Sisipkan gambar (foto) dari komputer ke sheet aktif — skala otomatis agar
  // tidak lebih besar dari area wajar, tetap bisa digeser / dihapus.
  const handleAddImage = React.useCallback(
    (file) => {
      if (!sheetsRef.current.length || !file) return;
      const idx = activeSheetIdx;
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result;
        const img = new Image();
        img.onload = () => {
          const MAX = 360;
          const MIN = 24;
          const scale = Math.min(1, MAX / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(MIN, Math.round((img.width || 0) * scale));
          const h = Math.max(MIN, Math.round((img.height || 0) * scale));
          updateSheet(idx, (s) => {
            const imgs = Array.isArray(s.images) ? s.images : [];
            const pic = {
              type: "pic",
              name: `Gambar ${imgs.length + 1}`,
              col: Math.min(1, Math.max(0, (s.columns || []).length - 1)),
              row: Math.min(2, Math.max(0, (s.rows || []).length - 1)),
              dxPx: 6,
              dyPx: 6,
              w,
              h,
              dataUrl: url,
              mime: file.type || "image/png",
              z: imgs.length,
            };
            return { ...s, images: [...imgs, pic] };
          });
        };
        img.onerror = () => {};
        img.src = url;
      };
      reader.readAsDataURL(file);
    },
    [activeSheetIdx]
  );

  // Seleksi bentuk/gambar direset saat ganti file atau sheet.
  React.useEffect(() => {
    setSelImgIdx(-1);
  }, [activeFileId, activeSheetIdx]);

  const doUndo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    try {
      redoStackRef.current.push(JSON.parse(JSON.stringify(sheetsRef.current)));
    } catch (_) {}
    sheetsRef.current = prev;
    setSheets(prev);
    setActiveSheetIdx((i) => Math.min(i, prev.length - 1));
    setCanRedo(true);
    setCanUndo(undoStackRef.current.length > 0);
    setComputed(new Map());
  };

  const doRedo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    try {
      undoStackRef.current.push(JSON.parse(JSON.stringify(sheetsRef.current)));
    } catch (_) {}
    sheetsRef.current = next;
    setSheets(next);
    setActiveSheetIdx((i) => Math.min(i, next.length - 1));
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    setComputed(new Map());
  };

  const handleRowsChange = (newRows) => {
    updateSheet(activeSheetIdx, (s) => ({ ...s, rows: newRows }));
  };

  const handleMergeCells = (range) => {
    if (!range || range.r1 == null || range.r2 == null || range.c1 == null || range.c2 == null) return;
    const { r1, r2, c1, c2 } = range;
    if (r1 > r2 || c1 > c2) return;
    if (r1 === r2 && c1 === c2) return;
    updateSheet(activeSheetIdx, (s) => {
      const cols = s.columns;
      if (c2 >= cols.length || r2 >= s.rows.length) return s;
      // Hapus merge lama yang menabrak, lalu kosongkan isi sel lanjutan
      // (kecuali sel sudut kiri-atas) seperti perilaku Excel saat menggabung.
      const merges = (s.merges || []).filter(
        (m) => !(m.r1 <= r2 && m.r2 >= r1 && m.c1 <= c2 && m.c2 >= c1)
      );
      const rows = s.rows.map((row, ri) => {
        if (ri < r1 || ri > r2) return row;
        const nr = { ...row };
        for (let ci = c1; ci <= c2; ci++) {
          if (ri === r1 && ci === c1) continue;
          const k = cols[ci]?.key;
          if (k) nr[k] = "";
        }
        return nr;
      });
      return { ...s, rows, merges: [...merges, { r1, r2, c1, c2 }] };
    });
  };

  const handleUnmergeCells = (range) => {
    if (!range || range.r1 == null || range.r2 == null || range.c1 == null || range.c2 == null) return;
    updateSheet(activeSheetIdx, (s) => {
      const merges = (s.merges || []).filter(
        (m) => !(m.r1 <= range.r2 && m.r2 >= range.r1 && m.c1 <= range.c2 && m.c2 >= range.c1)
      );
      return { ...s, merges };
    });
  };

  const handleApplyBorders = (range, sides, weight) => {
    if (!range || range.r1 == null || range.r2 == null || range.c1 == null || range.c2 == null) return;
    updateSheet(activeSheetIdx, (s) => applyBordersToSheet(s, range, sides, weight));
  };

  const handleAddRow = () => {
    updateSheet(activeSheetIdx, (s) => {
      const newRow = { id: `row_${s.name}_${Date.now()}` };
      for (const c of s.columns) newRow[c.key] = "";
      return { ...s, rows: [...s.rows, newRow] };
    });
  };

  const handleAddColumn = (count = 1, afterIndex) => {
    let scrollTo = null;
    updateSheet(activeSheetIdx, (s) => {
      if (count <= 0) return s;
      const n = s.columns.length;
      const pos = afterIndex == null || afterIndex < 0 || afterIndex >= n - 1 ? null : afterIndex;
      if (pos === null) {
        const newKeys = [];
        for (let i = 0; i < count; i++) newKeys.push(colName(n + i));
        const newCols = newKeys.map((k) => ({ key: k, label: k, type: "text", width: 100 }));
        const newRows = s.rows.map((row) => {
          const nr = { ...row };
          for (const k of newKeys) nr[k] = "";
          return nr;
        });
        scrollTo = null;
        return { ...s, columns: [...s.columns, ...newCols], rows: newRows };
      }
      scrollTo = pos + 1;
      return insertColumnIntoSheet(s, pos, count);
    });
    requestAnimationFrame(() => {
      if (!gridRef.current) return;
      if (scrollTo === null) gridRef.current.scrollToLastColumn();
      else gridRef.current.scrollToColumn(scrollTo);
    });
  };

  const handleDeleteColumn = (ci) => {
    if (activeFile && sheets[activeSheetIdx]?.columns?.length > 1) {
      snapshotVersion({
        fileId: activeFile.id,
        fileName: activeFile.fileName,
        workbook: sheetsToWorkbook(sheetsRef.current),
        label: `Hapus kolom "${sheetsRef.current[activeSheetIdx].columns[ci]?.label || ""}"`,
      });
    }
    updateSheet(activeSheetIdx, (s) => {
      if (s.columns.length <= 1) return s;
      const col = s.columns[ci];
      const newColumns = s.columns.filter((_, i) => i !== ci);
      const newRows = s.rows.map((row) => {
        const nr = { ...row };
        delete nr[col.key];
        return nr;
      });
      return { ...s, columns: newColumns, rows: newRows };
    });
    refreshHistory();
  };

  const handleColumnResize = (ci, newWidth) => {
    updateSheet(activeSheetIdx, (s) => {
      const newCols = [...s.columns];
      newCols[ci] = { ...newCols[ci], width: newWidth, manual: true };
      return { ...s, columns: newCols };
    }, false);
  };

  const handleInsertRow = (atIndex, count = 1) => {
    if (activeFile) {
      snapshotVersion({
        fileId: activeFile.id,
        fileName: activeFile.fileName,
        workbook: sheetsToWorkbook(sheetsRef.current),
        label: `Sisip ${count} baris`,
      });
    }
    updateSheet(activeSheetIdx, (s) => insertRowIntoSheet(s, atIndex, count));
    refreshHistory();
  };

  const handleDeleteRows = (r1, r2) => {
    if (activeFile) {
      snapshotVersion({
        fileId: activeFile.id,
        fileName: activeFile.fileName,
        workbook: sheetsToWorkbook(sheetsRef.current),
        label: `Hapus baris ${r1 + 1}–${r2 + 1}`,
      });
    }
    updateSheet(activeSheetIdx, (s) => deleteRowsFromSheet(s, r1, r2));
    refreshHistory();
  };

  const handleInsertColumn = (afterIndex, count = 1) => {
    let scrollTo = null;
    if (activeFile) {
      snapshotVersion({
        fileId: activeFile.id,
        fileName: activeFile.fileName,
        workbook: sheetsToWorkbook(sheetsRef.current),
        label: `Sisip ${count} kolom`,
      });
    }
    updateSheet(activeSheetIdx, (s) => {
      if (!s || s.columns.length === 0) return s;
      scrollTo = Math.max(0, Math.min(s.columns.length, afterIndex + 1));
      return insertColumnIntoSheet(s, afterIndex, count);
    });
    requestAnimationFrame(() => {
      if (!gridRef.current) return;
      if (scrollTo === null || scrollTo === undefined) gridRef.current.scrollToLastColumn();
      else gridRef.current.scrollToColumn(scrollTo);
    });
    refreshHistory();
  };

  const handleDeleteColumns = (c1, c2) => {
    if (activeFile) {
      snapshotVersion({
        fileId: activeFile.id,
        fileName: activeFile.fileName,
        workbook: sheetsToWorkbook(sheetsRef.current),
        label: `Hapus kolom ${colName(c1)}–${colName(c2)}`,
      });
    }
    updateSheet(activeSheetIdx, (s) => deleteColumnsFromSheet(s, c1, c2));
    refreshHistory();
  };

  const handleRowResize = (ri, newHeight) => {
    updateSheet(activeSheetIdx, (s) => {
      const newRows = [...s.rows];
      newRows[ri] = { ...newRows[ri], height: newHeight };
      return { ...s, rows: newRows };
    }, false);
  };

  // ---------- Ribbon: format / pengurutan / filter / cari ----------
  const activeStyleValue = (prefix) => {
    if (!activeSheet || activeCellIdx == null || activeCellRow == null) return null;
    const k = activeSheet.columns[activeCellIdx]?.key;
    if (!k) return null;
    return activeSheet.rows[activeCellRow]?.[prefix + k] ?? null;
  };
  const isActiveStyle = (prefix) => !!activeStyleValue(prefix);

  const handleBold = () => gridRef.current?.applyStyle({ bold: !isActiveStyle("__b_") });
  const handleItalic = () => gridRef.current?.applyStyle({ italic: !isActiveStyle("__i_") });
  const handleUnderline = () => gridRef.current?.applyStyle({ underline: !isActiveStyle("__u_") });
  const handleAlignH = (v) => gridRef.current?.applyStyle({ ha: v });
  const handleAlignV = (v) => gridRef.current?.applyStyle({ va: v });
  const handleWrapToggle = () => gridRef.current?.applyStyle({ wrap: !isActiveStyle("__wr_") });
  const handleFontColor = (color) => gridRef.current?.applyStyle({ fc: color });
  const handleFontSize = (delta) => {
    const cur = activeStyleValue("__sz_") || 11;
    let idx = FONT_SIZES.indexOf(cur);
    if (idx < 0) {
      idx = FONT_SIZES.findIndex((s) => s >= cur);
      if (idx < 0) idx = FONT_SIZES.length - 1;
    }
    const next = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, idx + delta))];
    gridRef.current?.applyStyle({ sz: next });
  };
  const handleToggleFreeze = () => setFrozen((v) => !v);

  const handleSort = (dir) => {
    if (!activeSheet || !activeSheet.columns.length || !activeSheet.rows.length) {
      setSaveFlash("Tidak ada data untuk diurutkan");
      return;
    }
    const ci = activeCellIdx != null ? Math.max(0, Math.min(activeCellIdx, activeSheet.columns.length - 1)) : 0;
    const col = activeSheet.columns[ci];
    updateSheet(activeSheetIdx, (s) => {
      const sorted = [...s.rows];
      sorted.sort((a, b) => {
        const av = a[col.key];
        const bv = b[col.key];
        const aEmpty = av === "" || av === null || av === undefined;
        const bEmpty = bv === "" || bv === null || bv === undefined;
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        const aStr = String(av);
        const bStr = String(bv);
        const an = typeof av === "number" || (aStr.trim() !== "" && !isNaN(Number(aStr)));
        const bn = typeof bv === "number" || (bStr.trim() !== "" && !isNaN(Number(bStr)));
        let cmp;
        if (an && bn) cmp = Number(av) - Number(bv);
        else cmp = aStr.localeCompare(bStr, "id", { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      });
      return { ...s, rows: sorted };
    });
    setSaveFlash(`Diurutkan ${dir === "asc" ? "A-Z naik" : "Z-A turun"} (${col.label || colName(ci)})`);
    window.clearTimeout(handleSort._t);
    handleSort._t = window.setTimeout(() => setSaveFlash(""), 1800);
  };

  const toggleFilter = () => {
    setFilterMode((m) => {
      if (m) setColFilter({});
      return !m;
    });
  };

  const applyColFilter = (key, values) => {
    setColFilter((prev) => {
      const next = { ...prev };
      if (values === null || !Array.isArray(values) || values.length === 0) delete next[key];
      else next[key] = values;
      return next;
    });
  };

  const hiddenRows = React.useMemo(() => {
    const set = new Set();
    if (!activeSheet) return null;
    // Baris tersembunyi bawaan file Excel (row.hidden) ikut disembunyikan.
    activeSheet.rows.forEach((row, ri) => {
      if (row && row.hidden) set.add(ri);
    });
    if (filterMode) {
      const entries = Object.entries(colFilter).filter(([, v]) => Array.isArray(v) && v.length > 0);
      if (entries.length) {
        activeSheet.rows.forEach((row, ri) => {
          for (const [k, allowed] of entries) {
            const v = row[k];
            const sv = v === null || v === undefined ? "" : String(v);
            if (!allowed.includes(sv)) {
              set.add(ri);
              break;
            }
          }
        });
      }
    }
    return set.size ? set : null;
  }, [activeSheet, filterMode, colFilter]);

  const handleFindNext = () => {
    setMatchCount(gridRef.current?.goNextMatch() ?? 0);
  };

  const handleInsertRowBtn = () => handleInsertRow(Math.max(0, activeCellRow ?? 0), 1);
  const handleDeleteRowBtn = () => handleDeleteRows(Math.max(0, activeCellRow ?? 0), Math.max(0, activeCellRow ?? 0));
  const handleInsertColBtn = () => handleInsertColumn(Math.max(0, (activeCellIdx ?? 0) - 1), 1);
  const handleDeleteColBtn = () => {
    const ci = Math.max(0, activeCellIdx ?? 0);
    handleDeleteColumns(ci, ci);
  };

  const handleAddSheet = () => {
    const base = sheetsRef.current;
    let idx = base.length + 1;
    let name = `Sheet${idx}`;
    while (base.some((s) => s.name === name)) {
      idx++;
      name = `Sheet${idx}`;
    }
    pushUndoSnapshot(base);
    const next = [...base, createEmptySheet(name)];
    sheetsRef.current = next;
    setSheets(next);
    setActiveSheetIdx(base.length);
  };

  const handleDeleteSheet = (idx) => {
    const base = sheetsRef.current;
    if (base.length <= 1) return;
    const sheetToDelete = base[idx];
    const next = base.filter((_, i) => i !== idx);
    if (activeFile) {
      snapshotVersion({
        fileId: activeFile.id,
        fileName: activeFile.fileName,
        workbook: sheetsToWorkbook(base),
        label: `Hapus sheet "${sheetToDelete?.name || ""}" (trash)`,
      });
    }
    pushUndoSnapshot(base);
    sheetsRef.current = next;
    setSheets(next);
    setActiveSheetIdx((prev) => {
      if (prev >= next.length) return Math.max(0, next.length - 1);
      return prev;
    });
    requestAnimationFrame(() => refreshHistory());
  };

  const handleRenameSheet = (idx, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || sheets.some((s, i) => i !== idx && s.name === trimmed)) return;
    updateSheet(idx, (s) => ({ ...s, name: trimmed }));
    setRenamingSheet(null);
  };

  const handleImportFile = (file) => {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (![".xlsx", ".xls"].includes(ext)) {
      setImportError("Format file tidak didukung. Gunakan .xlsx atau .xls");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        // Parsing workbook DULU (nilai, rumus, merge, ukuran kolom/baris, fill,
        // numFmt). Kemudian buka zip SEkali untuk dua hal yang xlsx-js-style
        // tidak baca saat parse: GAMBAR/shape dan STYLE mentah (border, font,
        // alignment) langsung dari styles.xml + atribut s= tiap <c>.
        const wb = XLSX.read(data, { type: "array", cellDates: true, cellStyles: true });
        let images = {};
        try {
          const zip = await openFileZip(data.buffer);
          images = await extractImagesFromZip(zip);
          await enrichWorkbookFromZip(wb, zip);
        } catch (_imErr) {
          images = {};
        }
        wb.__images = images;
        // Tandai sebagai workbook native agar setiap sheet diimpor 1:1
        // (struktur + formula + style + merge + lebar/tinggi per sheet aslinya).
        wb.Custprops = { ...(wb.Custprops || {}), sisnerling_native_sheets: JSON.stringify(wb.SheetNames) };
        // Impor ulang file dengan NAMA sama akan menggantikan entri lama secara
        // otomatis (tidak menumpuk duplikat), sehingga hasilnya selalu yang paling
        // baru & utuh — tanpa perlu menghapus file lama secara manual.
        const existing = importedFiles.find((f) => f.fileName === file.name);
        const fileId = existing ? existing.id : generateId();
        // Impor isi file apa adanya; setiap sheet mengikuti strukturnya sendiri.
        // Konversi workbook → grid dilakukan BERTAHAP (sheet 0 duluan agar tabel
        // langsung terisi, sisanya di waktu idle) sehingga UI tidak membeku.
        loadWorkbookProgressive(wb, { native: true });
        // Simpan base64 MENTAH dari file asli untuk reload presisi — lebih ringan
        // & akurat daripada XLSX.write ulang yang juga membuang gambar. Bila file
        // terlalu besar, simpan tanpa rawBase64 (fallback ke XLSX.write saat reload).
        const fileName = file.name;
        let rawBase64 = "";
        try {
          // Konversi Uint8Array → base64 secara chunked (hindari stack overflow)
          const CHUNK = 8192;
          let bin = "";
          for (let i = 0; i < data.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, data.subarray(i, i + CHUNK));
          }
          rawBase64 = btoa(bin);
        } catch (_) {
          rawBase64 = "";
        }
        // Simpan file sesegera mungkin — langsung (bukan requestIdleCallback)
        // agar data TIDAK HILANG bila user refresh segera setelah import.
        const savedAt = progressiveTokenRef.current;
        try {
          saveFile({ id: fileId, fileName, workbook: wb, rawBase64 });
        } catch (_err) {
          // Fallback: simpan via rebuild workbook tanpa rawBase64
          try {
            saveFile({ id: fileId, fileName, workbook: sheetsToWorkbook(sheetsRef.current) });
          } catch (_err2) {
            // abaikan bila tetap gagal; tampilan tetap berfungsi
          }
        }
        prevFileIdRef.current = null;
        onFilesChanged?.();
        setActiveFileId(fileId);
        setShowImport(false);
        setImportError("");
      } catch (err) {
        setImportError("Gagal membaca file Excel.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExport = () => {
    XLSX.writeFile(sheetsToWorkbook(sheetsRef.current), (activeFile?.fileName || "spreadsheet").replace(/\.(xlsx|xls)$/i, "") + ".xlsx");
  };

  const openHistory = () => {
    setShowHistory(true);
    setHistoryTab(activeFile ? "versi" : "sampah");
    refreshHistory();
  };

  const applyWorkbookToEditor = (wb) => {
    loadWorkbookProgressive(wb, { native: true }, (finalSheets) => {
      currentSheetsRef.current = finalSheets;
      writeLegacy(finalSheets, 0);
    });
    prevFileIdRef.current = activeFileId;
  };

  const handleRestoreVersion = (versionId) => {
    if (!activeFileId) return;
    const snap = loadWorkbookFromVersion(versionId);
    if (!snap) {
      setSaveFlash("Gagal memuat versi");
      return;
    }
    applyWorkbookToEditor(snap.workbook);
    saveFile({ id: activeFileId, fileName: activeFile?.fileName, workbook: snap.workbook });
    onFilesChanged?.();
    setSaveFlash("Versi dipulihkan");
    window.clearTimeout(handleRestoreVersion._t);
    handleRestoreVersion._t = window.setTimeout(() => setSaveFlash(""), 1800);
    refreshHistory();
  };

  const handleRestoreTrashFile = (fileId) => {
    const restored = restoreTrashedFile(fileId);
    if (restored) saveFile({ id: fileId, fileName: restored.fileName, workbook: restored.workbook });
    onFilesChanged?.();
    if (restored) {
      setActiveFileId(fileId);
      prevFileIdRef.current = null;
      applyWorkbookToEditor(restored.workbook);
    }
    refreshHistory();
  };

  const handleRestoreAllTrash = () => {
    const restored = restoreAllTrash();
    restored.forEach((r) => saveFile({ id: r.fileId, fileName: r.fileName, workbook: r.workbook }));
    onFilesChanged?.();
    refreshHistory();
    if (restored.length > 0) {
      setSaveFlash(`${restored.length} file dipulihkan dari sampah`);
      window.clearTimeout(handleRestoreAllTrash._t);
      handleRestoreAllTrash._t = window.setTimeout(() => setSaveFlash(""), 1800);
    } else {
      setSaveFlash("Tidak ada file untuk dipulihkan");
      window.clearTimeout(handleRestoreAllTrash._t);
      handleRestoreAllTrash._t = window.setTimeout(() => setSaveFlash(""), 1800);
    }
  };

  const handlePurgeFile = () => {
    if (!confirmPurgeFiles) return;
    purgeFileHistory(confirmPurgeFiles);
    setConfirmPurgeFiles(null);
    refreshHistory();
  };

  const handlePurgeAllTrash = () => {
    purgeAllTrash();
    setConfirmPurgeAll(false);
    refreshHistory();
    onFilesChanged?.();
  };

  const handlePurgeAllVersions = () => {
    if (!activeFileId) return;
    purgeAllVersions(activeFileId);
    setConfirmPurgeAllVersions(false);
    refreshHistory();
  };

  const handlePurgeVersion = () => {
    if (!confirmPurge) return;
    purgeVersion(activeFileId, confirmPurge.id);
    setConfirmPurge(null);
    refreshHistory();
  };

  const chartColTypes = React.useMemo(
    () => activeSheet ? detectColTypes(activeSheet.rows, activeSheet.columns) : {},
    [activeSheet]
  );

  const numericCols = React.useMemo(
    () => activeSheet ? activeSheet.columns.filter((c) => chartColTypes[c.key] === "number") : [],
    [activeSheet, chartColTypes]
  );

  const catCols = React.useMemo(
    () => activeSheet ? activeSheet.columns.filter((c) => chartColTypes[c.key] === "text") : [],
    [activeSheet, chartColTypes]
  );

  React.useEffect(() => {
    if (activeSheet) {
      setChartXCol(catCols.length > 0 ? catCols[0].key : activeSheet.columns[0]?.key || "");
      setChartYCols(numericCols.length > 0 ? numericCols.slice(0, 3).map((c) => c.key) : []);
    }
  }, [activeSheetIdx]);

  const chartData = React.useMemo(() => {
    if (!activeSheet || !chartXCol || chartYCols.length === 0) return null;
    const xIdx = activeSheet.columns.findIndex((c) => c.key === chartXCol);
    if (xIdx === -1) return null;

    const aggregated = {};
    const order = [];
    for (const row of activeSheet.rows) {
      const xVal = row[chartXCol];
      const xKey = (xVal === "" || xVal === null || xVal === undefined) ? "(Kosong)" : String(xVal).trim() || "(Kosong)";
      if (!aggregated[xKey]) {
        aggregated[xKey] = {};
        order.push(xKey);
        for (const yk of chartYCols) aggregated[xKey][yk] = 0;
      }
      for (const yk of chartYCols) {
        const v = row[yk];
        const n = typeof v === "number" ? v : parseFloat(String(v || "0"));
        if (!isNaN(n)) aggregated[xKey][yk] += n;
      }
    }

    const labels = order.slice(0, 60);
    const isPie = chartType === "pie" || chartType === "doughnut";
    const isArea = chartType === "area";

    const datasets = chartYCols.map((yk, i) => {
      const col = activeSheet.columns.find((c) => c.key === yk);
      const data = labels.map((l) => aggregated[l][yk] || 0);
      const color = CHART_COLORS[i % CHART_COLORS.length];
      if (isPie) return {
        label: col?.label || yk, data,
        backgroundColor: labels.map((_, j) => CHART_COLORS[j % CHART_COLORS.length]),
        borderColor: "#fff", borderWidth: 2,
      };
      return {
        label: col?.label || yk, data,
        backgroundColor: isArea ? color + "30" : color,
        borderColor: color, borderWidth: 2, fill: isArea,
        tension: (chartType === "line" || isArea) ? 0.35 : 0,
        pointRadius: (chartType === "line" || isArea) ? 3 : 0,
        pointBackgroundColor: color, pointBorderColor: "#fff", pointBorderWidth: 1,
      };
    });

    return { labels, datasets };
  }, [activeSheet, chartXCol, chartYCols, chartType]);

  const chartOptions = React.useMemo(() => {
    const isPie = chartType === "pie" || chartType === "doughnut";
    if (isPie) return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { padding: 14, usePointStyle: true, font: { size: 12 } } },
        tooltip: { backgroundColor: "rgba(15,23,42,0.9)", padding: 10, cornerRadius: 8 },
      },
    };
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, padding: 14, font: { size: 12 } } },
        tooltip: { backgroundColor: "rgba(15,23,42,0.9)", titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 8 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.06)" }, ticks: { font: { size: 11 } } },
      },
    };
  }, [chartType]);

  const renderChart = () => {
    if (!chartData) return null;
    const props = { key: chartKey, data: chartData, options: chartOptions };
    switch (chartType) {
      case "bar": return <Bar {...props} />;
      case "line": return <Line {...props} />;
      case "pie": return <Pie {...props} />;
      case "doughnut": return <Doughnut {...props} />;
      case "area": return <Line {...props} />;
      default: return <Bar {...props} />;
    }
  };

  const nonEmptyRows = activeSheet
    ? activeSheet.rows.filter((row) =>
        activeSheet.columns.some((c) => row[c.key] !== "" && row[c.key] !== null && row[c.key] !== undefined)
      )
    : [];

  // ===== Lock/Unlock dari Super Admin (halaman Spreadsheet) =====
  // Aturan diambil dari server memakai koordinat sheet ASLI. Resolusi
  // "paling spesifik menang": workbook < sheet < kolom/baris < range < cell.
  const [lockRules, setLockRules] = React.useState([]);

  const SPECIFICITY = { workbook: 1, sheet: 2, column: 3, row: 3, range: 4, cell: 5 };

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (isSuperAdmin(getUser())) { setLockRules([]); return; }
      // Workbook belum siap (halaman ini tampil sebelum file selesai dimuat):
      // jangan pakai aturan apa pun daripada menampilkan sheet yang terkunci
      // karena workbook-level rule yang kebetulan cocok dengan key kosong.
      if (!activeFile?.fileName) {
        if (!cancelled) setLockRules([]);
        return;
      }
      try {
        const res = await api.getLocks({
          workbookKey: activeFile.fileName,
          sheetName: activeSheet?.name || "",
        });
        if (!cancelled) setLockRules(Array.isArray(res?.rules) ? res.rules : []);
      } catch {
        if (!cancelled) setLockRules([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activeFile?.fileName, activeSheet?.name]);

  const lockHighlights = React.useMemo(() => {
    if (isSuperAdmin(getUser()) || !lockRules.length || !activeSheet) return null;
    const nRows = activeSheet.rows.length;
    const nCols = activeSheet.columns.length;
    const out = [];
    for (const r of lockRules) {
      if (r.level === "workbook" || r.level === "sheet") {
        out.push({ spec: SPECIFICITY[r.level], r1: 0, r2: nRows - 1, c1: 0, c2: nCols - 1, lock: r.status === "lock" });
      } else if (r.level === "column") {
        const idx = (r.colKeys || []).map((k) => {
          const s = String(k || "").toUpperCase();
          if (!/^[A-Z]+$/.test(s)) return null;
          let n = 0;
          for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
          return n - 1;
        }).filter((n) => n != null);
        const c1 = idx.length ? Math.min(...idx) : 0;
        const c2 = idx.length ? Math.max(...idx) : nCols - 1;
        out.push({ spec: SPECIFICITY.column, r1: 0, r2: nRows - 1, c1, c2, lock: r.status === "lock" });
      } else if (r.r1 != null && r.r2 != null && r.c1 != null && r.c2 != null) {
        out.push({
          spec: SPECIFICITY[r.level] || 4,
          r1: Math.max(0, r.r1), r2: Math.min(nRows - 1, r.r2),
          c1: Math.max(0, r.c1), c2: Math.min(nCols - 1, r.c2),
          lock: r.status === "lock",
        });
      }
    }
    // Ditulis dari paling umum ke paling spesifik supaya yang spesifik menimpa
    // (peta "r:c" di ExcelGrid ditulis berurutan).
    return out.sort((a, b) => a.spec - b.spec);
  }, [lockRules, activeSheet]);

  const handleLockedCell = React.useCallback((_r, _key) => {
    toast("Sel ini terkunci oleh Super Admin", "error");
  }, [toast]);

  // Publikasikan file browser ke server agar muncul di halaman Penugasan Tabel.
  const canPublish = !readOnly && isSuperAdmin(getUser());
  const handlePublish = async () => {
    if (!importedFiles.length) {
      toast("Tidak ada file untuk dipublikasikan", "error");
      return;
    }
    if (!window.confirm(`Publikasikan ${importedFiles.length} file ke server agar bisa ditugaskan ke admin di halaman Penugasan Tabel?`)) return;
    // Pastikan edit terakhir sudah naik ke server sebelum dipublikasikan, supaya
    // data yang ditugaskan Admin sama persis dengan isi file yang tersimpan.
    flushSync();
    setPublishing(true);
    let ok = 0;
    let inserted = 0;
    const fails = [];
    for (const f of importedFiles) {
      try {
        // File dari server bisa belum punya workbook di memori (dimuat lazy).
        // Muat dulu lewat ensureFileLoaded agar tidak gagal saat publish.
        let wb = f.workbook;
        let b64 = f.rawBase64 || "";
        if (!b64 && !wb) {
          const loaded = await ensureFileLoaded(f.id);
          if (loaded) {
            wb = loaded.workbook;
            b64 = loaded.rawBase64 || "";
          }
        }
        if (!b64 && wb) {
          try {
            b64 = XLSX.write(bakeThemeColors(wb), { type: "base64", bookType: "xlsx" });
          } catch (_err) {
            b64 = "";
          }
        }
        if (!b64) {
          fails.push(`"${f.fileName}" — workbook tidak bisa dikonversi (kosong/tidak valid)`);
          continue;
        }
        const res = await api.importWorkbook({ base64: b64, filename: f.fileName });
        if (res && typeof res.inserted === "number") {
          ok++;
          inserted += res.inserted || 0;
        } else {
          fails.push(`"${f.fileName}" — respons server tidak lengkap`);
        }
      } catch (err) {
        fails.push(`"${f.fileName}" — ${err && err.message ? err.message : "gagal dipublikasikan"}`);
      }
    }
    const summary =
      `${ok} file dipublikasikan (${inserted} baris).` +
      (fails.length ? ` ${fails.length} gagal: ${fails.join(" | ")}` : "");
    toast(summary, fails.length && !ok ? "error" : undefined);
    setPublishing(false);
  };

  return (
    <div className="excel-editor">
      <ExcelToolbar
        collapsed={toolbarCollapsed}
        readOnly={readOnly}
        onToggleCollapse={() => setToolbarCollapsed((v) => !v)}
        fileLabel={activeFile?.fileName || ""}
        activeFileId={activeFileId || ""}
        importedFiles={importedFiles}
        onSelectFile={handleSelectFile}
        saveFlash={saveFlash}
        infoBadge={`${nonEmptyRows.length} baris \u00d7 ${activeSheet?.columns.length || 0} kolom`}
        onSave={handleSave}
        onImport={() => setShowImport(true)}
        onExport={handleExport}
        onPublish={publishing ? null : handlePublish}
        publishingPublish={publishing}
        canPublish={canPublish}
        onNewFile={handleNewFile}
        onHistory={openHistory}
        onRenameFile={() => {
          setRenameFileName(activeFile?.fileName || "");
          setRenameFileModal(true);
        }}
        onDeleteFile={() => setConfirmDeleteFile(true)}
        onClearAll={() => setConfirmClear(true)}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onBold={handleBold}
        boldActive={isActiveStyle("__b_")}
        onItalic={handleItalic}
        italicActive={isActiveStyle("__i_")}
        onUnderline={handleUnderline}
        underlineActive={isActiveStyle("__u_")}
        onFontSize={handleFontSize}
        onFontColor={handleFontColor}
        onApplyFill={handleApplyFill}
        fillColor={fillColor}
        onAlignH={handleAlignH}
        alignH={activeStyleValue("__ha_")}
        onAlignV={handleAlignV}
        onWrapToggle={handleWrapToggle}
        wrapActive={isActiveStyle("__wr_")}
        onInsertRow={handleInsertRowBtn}
        onDeleteRow={handleDeleteRowBtn}
        onInsertCol={handleInsertColBtn}
        onDeleteCol={handleDeleteColBtn}
        onAddSheet={handleAddSheet}
        onMergeCells={() => gridRef.current?.mergeSelection()}
        onUnmergeCells={() => gridRef.current?.unmergeSelection()}
        onApplyBorders={(sides, weight) => gridRef.current?.applyBorder(sides, weight)}
        borderWeight={borderWeight}
        onBorderWeight={setBorderWeight}
        onSortAsc={readOnly ? null : () => handleSort("asc")}
        onSortDesc={readOnly ? null : () => handleSort("desc")}
        filterOn={filterMode}
        onToggleFilter={toggleFilter}
        searchText={searchText}
        onSearchChange={(v) => {
          setSearchText(v);
          setMatchCount(null);
        }}
        onFindNext={handleFindNext}
        matchCount={matchCount}
        freezeOn={frozen}
        onToggleFreeze={handleToggleFreeze}
onChart={() => setShowChart((v) => !v)}
          onCompare={() => setShowCompare(true)}
          onAddShape={handleAddShape}
          onAddImage={handleAddImage}
          selShape={selShape}
          onShapeFill={handleShapeFill}
          onShapeTextColor={handleShapeTextColor}
          onShapeBold={handleShapeBold}
          zoom={zoom}
          onZoomIn={() => handleZoomChange(zoom + 0.1)}
          onZoomOut={() => handleZoomChange(zoom - 0.1)}
          onZoomReset={() => handleZoomChange(1)}
      />

      <div className="ee-formula-bar">
        <span className="fx-icon">fx</span>
        <input
          className="fx-input"
          placeholder="Ketik rumus atau nilai, contoh: =SUM(A1:A10)"
          value={fxState.fxValue}
          onChange={(e) => gridRef.current?.handleFxChange(e.target.value)}
          onKeyDown={(e) => gridRef.current?.handleFxKeyDown(e)}
          onFocus={() => gridRef.current?.handleFxFocus()}
          disabled={readOnly || !fxState.hasActive}
        />
        <span className="fx-ref">{fxState.fxRefText}</span>
        {readOnly && <span className="fx-lock" title="Anda hanya dapat melihat spreadsheet ini">&#128272; Hanya bisa melihat</span>}
      </div>

      {fid && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            padding: "6px 14px", fontSize: 12.5,
            background: fid.differences === 0 ? "#ecfdf5" : "#fef2f2",
            color: fid.differences === 0 ? "#047857" : "#991b1b",
            borderBottom: "1px solid " + (fid.differences === 0 ? "#a7f3d0" : "#fecaca"),
          }}
        >
          <span style={{ fontWeight: 700 }}>
            {fid.differences === 0 ? "&#10003;" : "&#10007;"} Importer
            {fid.differences === 0
              ? ` sesuai 1:1 (${fid.checked.toLocaleString("id-ID")} sel dicek, ${fid.sheets.length} sheet, posisi & nilai identik)`
              : ` BEDA: ${fid.differences} sel berbeda dari file asli`}
          </span>
          <button
            onClick={() => setFidOpen(true)}
            style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid currentColor", background: "transparent", cursor: "pointer", fontSize: 12 }}
          >
            Rincian
          </button>
        </div>
      )}

      {fidOpen && fid && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setFidOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 860, width: "92%", maxHeight: "80vh", overflow: "auto", background: "#fff", borderRadius: 12, padding: "18px 20px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Debug Import &mdash; Excel Asli vs Web</h3>
              <button onClick={() => setFidOpen(false)} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>
              Setiap sel dipetakan by alamat (Excel A1 &rarr; web A1). Di bawah adalah perbandingan value &amp; number format per sel.
            </p>
            {fid.sheets.map((s) => (
              <div key={s.name} style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "#f8fafc", fontWeight: 700, fontSize: 13, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <span>{s.name}</span>
                  <span style={{ fontWeight: 500, color: s.valueDiff + s.nfDiff + s.mergeDiff + (s.styleDiff || 0) + (s.dimDiff || 0) === 0 ? "#047857" : "#991b1b" }}>
                    {s.columns} kolom &times; {s.rows} baris (file: {s.fileExtent.cols} &times; {s.fileExtent.rows}) &middot; {s.checked.toLocaleString("id-ID")} sel dicek &middot;
                    {s.valueDiff === 0 && s.nfDiff === 0 && s.mergeDiff === 0 && !s.styleDiff && !s.dimDiff ? " IDENTIK" : ` ${s.valueDiff} nilai + ${s.nfDiff} nf + ${s.mergeDiff} merge + ${s.styleDiff || 0} style + ${s.dimDiff || 0} ukuran beda`}
                    {s.extentNote ? ` — ${s.extentNote}` : ""}
                  </span>
                </div>
                {s.sample.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        <th style={{ padding: "4px 10px", textAlign: "left" }}>Alamat</th>
                        <th style={{ padding: "4px 10px", textAlign: "left" }}>Excel Asli</th>
                        <th style={{ padding: "4px 10px", textAlign: "left" }}>Web</th>
                        <th style={{ padding: "4px 10px", textAlign: "left" }}>numFmt Excel / Web</th>
                        <th style={{ padding: "4px 10px", textAlign: "left" }}>Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.sample.map((d, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "4px 10px", fontWeight: 700 }}>{d.addr}</td>
                          <td style={{ padding: "4px 10px", whiteSpace: "pre-wrap", color: "#047857" }}>{String(d.excel)}</td>
                          <td style={{ padding: "4px 10px", whiteSpace: "pre-wrap", color: "#991b1b" }}>{String(d.web)}</td>
                          <td style={{ padding: "4px 10px" }}>{d.excelNf ? `${d.excelNf} / ${d.webNf || "-"}` : ""}</td>
                          <td style={{ padding: "4px 10px", whiteSpace: "pre-wrap", color: "#b45309" }}>{d.styleDiff || d.category || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ padding: "8px 12px", margin: 0, fontSize: 13, color: "#047857" }}>Semua sel pada alamat &amp; format identik dengan file asli.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ee-sheet-tabs">
        {sheets.map((s, i) => (
          <div
            key={i}
            className={`ee-tab${i === activeSheetIdx ? " active" : ""}`}
            onClick={() => setActiveSheetIdx(i)}
          >
            {renamingSheet === i ? (
              <input
                className="ee-tab-rename-input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRenameSheet(i, renameValue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSheet(i, renameValue);
                  if (e.key === "Escape") setRenamingSheet(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="ee-tab-name"
                onDoubleClick={readOnly ? null : (e) => {
                  e.stopPropagation();
                  setRenamingSheet(i);
                  setRenameValue(s.name);
                }}
                title={readOnly ? "" : "Klik dua kali untuk mengganti nama"}
              >
                {s.name}
              </span>
            )}
            {!readOnly && (
              <button
                className="ee-tab-rename"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingSheet(i);
                  setRenameValue(s.name);
                }}
                title="Ganti nama sheet"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
            {!readOnly && (
              <button
                className="ee-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSheet(i);
                }}
                title="Hapus sheet"
                disabled={sheets.length <= 1}
              >
                &times;
              </button>
            )}
          </div>
        ))}
        {!readOnly && <button className="ee-tab-add" onClick={handleAddSheet} title="Tambah Sheet">+</button>}
      </div>

      {activeSheet && (
        <ExcelGrid
          key={`${activeFileId ?? "none"}:${activeSheetIdx}`}
          ref={gridRef}
          rows={activeSheet.rows}
          columns={activeSheet.columns}
          computed={computed}
          onChange={handleRowsChange}
          onMergeCells={handleMergeCells}
          onUnmergeCells={handleUnmergeCells}
          onApplyBorders={handleApplyBorders}
          onAddRow={handleAddRow}
          onAddColumn={handleAddColumn}
          onDeleteColumn={handleDeleteColumn}
          onInsertRow={handleInsertRow}
          onDeleteRows={handleDeleteRows}
          onInsertColumn={handleInsertColumn}
          onDeleteColumns={handleDeleteColumns}
          onColumnResize={handleColumnResize}
          onRowResize={handleRowResize}
          onFxStateChange={handleFxStateChange}
          onImagesChange={handleImagesChange}
          onSelectImage={handleSelectImage}
          merges={activeSheet.merges || []}
          banner={activeSheet.banner || null}
          onUndo={doUndo}
          onRedo={doRedo}
          hiddenRows={hiddenRows}
          filterMode={filterMode}
          colFilter={colFilter}
          onApplyColFilter={applyColFilter}
          searchQuery={searchText}
          frozen={frozen}
          freezePane={activeSheet.freeze || null}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          images={activeSheet.images || []}
          readOnly={readOnly}
          rangeHighlights={lockHighlights}
          onLockedCell={handleLockedCell}
        />
      )}

      {showChart && activeSheet && (
        <div className="ee-chart-panel">
          <div className="ee-chart-config">
            <h3>Konfigurasi Chart</h3>
            <div className="form-group">
              <label>Jenis Chart</label>
              <div className="chart-type-grid">
                {["bar", "line", "pie", "doughnut", "area"].map((ct) => (
                  <button
                    key={ct}
                    className={`chart-type-btn${chartType === ct ? " active" : ""}`}
                    onClick={() => { setChartType(ct); setChartKey((k) => k + 1); }}
                  >
                    {ct.charAt(0).toUpperCase() + ct.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Sumbu X (Label)</label>
              <select
                className="form-control"
                value={chartXCol}
                onChange={(e) => { setChartXCol(e.target.value); setChartKey((k) => k + 1); }}
              >
                <option value="">-- Pilih Kolom --</option>
                {activeSheet.columns.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Sumbu Y (Data Numerik)</label>
              <div className="chart-y-checkboxes">
                {activeSheet.columns.map((c) => (
                  <label key={c.key} className={`chart-y-check${chartYCols.includes(c.key) ? " selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={chartYCols.includes(c.key)}
                      onChange={() => {
                        setChartYCols((prev) =>
                          prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]
                        );
                        setChartKey((k) => k + 1);
                      }}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="ee-chart-render">
            {chartData ? (
              <div className="excel-chart-canvas">{renderChart()}</div>
            ) : (
              <div className="empty-state">
                <div className="big">&#128202;</div>
                <p>Pilih kolom untuk Sumbu X dan minimal satu kolom untuk Sumbu Y.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showImport && (
        <div className="overlay" onClick={() => setShowImport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Import File Excel</h3>
              <button className="modal-close" onClick={() => setShowImport(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div
                className={`excel-dropzone${importDrag ? " dragging" : ""}`}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImportDrag(false);
                  handleImportFile(e.dataTransfer.files[0]);
                }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setImportDrag(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setImportDrag(false); }}
              >
                <svg width="48" height="48" viewBox="0 0 56 56" fill="none">
                  <rect x="6" y="10" width="44" height="36" rx="8" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="5 4"/>
                  <path d="M28 22v12M22 28h12" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                <p className="dropzone-text">Drag & drop file Excel ke sini</p>
                <p className="dropzone-hint">atau</p>
                <label className="btn btn-primary excel-browse-btn">
                  Pilih File
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => { handleImportFile(e.target.files[0]); e.target.value = ""; }}
                    style={{ display: "none" }}
                  />
                </label>
                <p className="dropzone-format">Format .xlsx / .xls</p>
              </div>
              {importError && <p className="excel-error-msg">{importError}</p>}
              <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 10 }}>
                File akan ditambahkan ke daftar "File Terimport" dan bisa dipilih kembali dari dropdown File di toolbar.
              </p>
            </div>
          </div>
        </div>
      )}
      {confirmClear && (
        <div className="overlay" onClick={() => setConfirmClear(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Hapus Semua Data</h3>
              <button className="modal-close" onClick={() => setConfirmClear(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 16 }}>
                Semua sheet pada file aktif akan dikosongkan dan dikembalikan ke satu sheet kosong. Tindakan ini tidak bisa dibatalkan.
              </p>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirmClear(false)}>Batal</button>
                <button className="btn btn-danger btn-sm" onClick={handleClearAll}>Ya, Hapus Semua</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {renameFileModal && (
        <div className="overlay" onClick={() => setRenameFileModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Ubah Nama File</h3>
              <button className="modal-close" onClick={() => setRenameFileModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Nama File</label>
                <input
                  className="form-control"
                  value={renameFileName}
                  autoFocus
                  onChange={(e) => setRenameFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameFile();
                    if (e.key === "Escape") setRenameFileModal(false);
                  }}
                />
              </div>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setRenameFileModal(false)}>Batal</button>
                <button className="btn btn-primary btn-sm" onClick={handleRenameFile}>Simpan Nama</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteFile && (
        <div className="overlay" onClick={() => setConfirmDeleteFile(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Hapus File</h3>
              <button className="modal-close" onClick={() => setConfirmDeleteFile(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 16 }}>
                File <b>{activeFile?.fileName}</b> akan dipindahkan ke <b>Riwayat / Sampah</b>. Data sebelumnya tetap tersimpan dan bisa dikembalikan kapan saja dari menu Riwayat / Backup.
              </p>
              <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
                Untuk menghapus permanen, gunakan menu Riwayat / Backup &rarr; Sampah.
              </p>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirmDeleteFile(false)}>Batal</button>
                <button className="btn btn-danger btn-sm" onClick={handleDeleteFile}>Ya, Pindah ke Sampah</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showHistory && (
        <div className="overlay" onClick={() => setShowHistory(false)}>
          <div className="modal history-modal-max" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Riwayat / Backup</h3>
              <button className="modal-close" onClick={() => setShowHistory(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="history-tabs">
                <button
                  className={`history-tab${historyTab === "versi" ? " active" : ""}`}
                  onClick={() => setHistoryTab("versi")}
                  disabled={!activeFile}
                >
                  Versi File Aktif
                </button>
                <button
                  className={`history-tab${historyTab === "sampah" ? " active" : ""}`}
                  onClick={() => setHistoryTab("sampah")}
                >
                  Sampah ({trashedFiles.length})
                </button>
              </div>

              {historyTab === "versi" && (
                activeFile ? (
                  versions.length === 0 ? (
                    <div className="history-empty">
                      <p>Belum ada versi tersimpan. Setiap kali Anda menyimpan atau melakukan perubahan besar, versi otomatis dibuat di sini.</p>
                    </div>
                  ) : (
                    <div className="history-list">
                      {activeFile && versions.length > 0 && !readOnly && (
                        <div className="history-actions">
                          <button
                            className="btn btn-outline btn-sm ee-btn-danger"
                            onClick={() => setConfirmPurgeAllVersions(true)}
                            title="Hapus semua versi file aktif secara permanen"
                          >
                            Hapus Semua Versi
                          </button>
                        </div>
                      )}
                      {[...versions].reverse().map((v) => (
                        <div className={`history-item${v.trashed ? " trashed" : ""}`} key={v.id}>
                          <div className="history-item-info">
                            <div className="history-item-title">
                              <span className="history-ver">v{v.version}</span>
                              <span className="history-label">{v.label}</span>
                              {v.trashed && <span className="history-badge">Di Sampah</span>}
                            </div>
                            <div className="history-time">{formatDate(v.createdAt)}</div>
                            <div className="history-sheets">{v.sheetNames.length} sheet: {v.sheetNames.join(", ")}</div>
                          </div>
                          <div className="history-item-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleRestoreVersion(v.id)}
                              title="Kembalikan data, rumus, struktur dan sheet ke kondisi versi ini"
                              disabled={readOnly}
                            >
                              Restore
                            </button>
                            <button
                              className="btn btn-outline btn-sm ee-btn-danger"
                              onClick={() => setConfirmPurge(v)}
                              title="Hapus versi ini secara permanen"
                              disabled={readOnly}
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="history-empty">
                    <p>Pilih file terlebih dahulu untuk melihat versinya.</p>
                  </div>
                )
              )}

              {historyTab === "sampah" && (
                trashedFiles.length === 0 ? (
                  <div className="history-empty">
                    <p>Belum ada file di sampah. File yang dihapus akan muncul di sini dan bisa dikembalikan.</p>
                  </div>
                ) : (
                  <div className="history-list">
                    {!readOnly && (
                      <div className="history-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleRestoreAllTrash}
                          title="Kembalikan semua file di sampah beserta seluruh versinya"
                        >
                          Pulihkan Semua ({trashedFiles.length})
                        </button>
                        <button
                          className="btn btn-outline btn-sm ee-btn-danger"
                          onClick={() => setConfirmPurgeAll(true)}
                          title="Hapus semua file di sampah beserta seluruh riwayatnya secara permanen"
                        >
                          Hapus Semua
                        </button>
                      </div>
                    )}
                    {trashedFiles.map((t) => (
                      <div className="history-item trashed" key={t.fileId}>
                        <div className="history-item-info">
                          <div className="history-item-title">
                            <span className="history-label">{t.fileName}</span>
                            <span className="history-badge">Di Sampah</span>
                          </div>
                          <div className="history-time">Dihapus: {formatDate(t.trashedAt)}</div>
                          <div className="history-sheets">Versi tersimpan tetap tersedia untuk restore.</div>
                        </div>
                        <div className="history-item-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleRestoreTrashFile(t.fileId)}
                            title="Kembalikan file beserta semua versinya"
                            disabled={readOnly}
                          >
                            Pulihkan
                          </button>
                          <button
                            className="btn btn-outline btn-sm ee-btn-danger"
                            onClick={() => setConfirmPurgeFiles(t.fileId)}
                            title="Hapus file dan seluruh riwayatnya secara permanen"
                            disabled={readOnly}
                          >
                            Hapus Permanen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
      {confirmPurge && (
        <div className="overlay" onClick={() => setConfirmPurge(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Hapus Versi Permanen</h3>
              <button className="modal-close" onClick={() => setConfirmPurge(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 16 }}>
                Versi <b>v{confirmPurge.version}</b> ({formatDate(confirmPurge.createdAt)}) akan dihapus permanen dan tidak bisa dikembalikan.
              </p>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirmPurge(null)}>Batal</button>
                <button className="btn btn-danger btn-sm" onClick={handlePurgeVersion}>Ya, Hapus Permanen</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmPurgeFiles && (
        <div className="overlay" onClick={() => setConfirmPurgeFiles(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Hapus File Permanen</h3>
              <button className="modal-close" onClick={() => setConfirmPurgeFiles(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 16 }}>
                File ini beserta <b>seluruh riwayat versinya</b> akan dihapus permanen dan tidak bisa dikembalikan.
              </p>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirmPurgeFiles(null)}>Batal</button>
                <button className="btn btn-danger btn-sm" onClick={handlePurgeFile}>Ya, Hapus Permanen</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmPurgeAll && (
        <div className="overlay" onClick={() => setConfirmPurgeAll(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Hapus Semua Sampah</h3>
              <button className="modal-close" onClick={() => setConfirmPurgeAll(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 16 }}>
                Semua file di sampah beserta <b>seluruh riwayat versinya</b> akan dihapus permanen dan <b>tidak bisa dikembalikan</b>.
              </p>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirmPurgeAll(false)}>Batal</button>
                <button className="btn btn-danger btn-sm" onClick={handlePurgeAllTrash}>Ya, Hapus Semua</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmPurgeAllVersions && (
        <div className="overlay" onClick={() => setConfirmPurgeAllVersions(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Hapus Semua Versi</h3>
              <button className="modal-close" onClick={() => setConfirmPurgeAllVersions(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 16 }}>
                Semua versi backup file <b>{activeFile?.fileName}</b> akan dihapus permanen dan tidak bisa dipulihkan.
              </p>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirmPurgeAllVersions(false)}>Batal</button>
                <button className="btn btn-danger btn-sm" onClick={handlePurgeAllVersions}>Ya, Hapus Semua</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompare && (
        <Modal
          title="Perbandingan Data"
          onClose={() => setShowCompare(false)}
          width={980}
          footer={
            <button className="btn btn-primary" onClick={() => setShowCompare(false)}>Tutup</button>
          }
        >
          <div className="cmp-modal-body">
            <PerbandinganData tables={sheetsToTables(sheets)} title="Perbandingan Antar Periode" compact />
          </div>
        </Modal>
      )}
    </div>
  );
}