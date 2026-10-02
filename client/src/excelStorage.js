import * as XLSX from "xlsx-js-style";
import { bakeThemeColors } from "./excelImportUtil.js";
import { applyStylesManifest } from "./excelRawStyles.js";
import { removeDraftSheets } from "./excelDrafts.js";

const STORAGE_KEY = "sisnerling_imported_files";
const MAX_FILES = 20;

// ===== Penyimpanan tahan-quota (IndexedDB) =====
// localStorage terbatas ~5MB — file Excel yang diizinkan (hingga 10MB) pasti
// melebihi kuota dan rawan hilang saat refresh. IndexedDB dipakai sebagai
// penyimpanan utama untuk data file; localStorage hanya menjadi cache kilat /
// fallback agar API sinkron (loadFiles/saveFile) tetap bekerja cepat.
const IDB_NAME = "sisnerling-file-storage";
const IDB_STORE = "importedFiles";
const IDB_KEY = STORAGE_KEY;
// Versi 2: store "editorDrafts" (draft hasil edit per file) ditambahkan agar
// kedua modul (excelStorage & excelDrafts) memakai skema yang sama. Keduanya
// membuka versi 2 dan membuat store yang belum ada (idempoten) sehingga urutan
// pembukaan database tidak lagi menentukan store mana yang tercipta.
const IDB_VERSION = 2;

let dbPromise = null;
let memoryList = null; // cache serialisasi meta paling baru (sumber sinkron)
let hydrationPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB tidak tersedia"));
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
      if (!db.objectStoreNames.contains("editorDrafts")) {
        db.createObjectStore("editorDrafts");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbRead() {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbWrite(list) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(list, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbDelete() {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      })
  );
}

function loadFilesMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Persist daftar file ke localStorage (cache kilat) dengan fallback bertingkat
// bila quota penuh. Data lengkap tetap aman di IndexedDB.
function persistList(list) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return;
  } catch (_) { /* quota exceeded */ }
  // Fallback 1: strip images dari semua entry
  try {
    const slim = list.map((e) => {
      const { images, rawBase64, ...rest } = e;
      return rest;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    return;
  } catch (_) { /* still too large */ }
  // Fallback 2: simpan hanya entry terbaru tanpa gambar
  try {
    const latest = list[list.length - 1];
    if (latest) {
      const { images, rawBase64, ...latestSlim } = latest;
      localStorage.setItem(STORAGE_KEY, JSON.stringify([latestSlim]));
    }
    return;
  } catch (_) { /* still failing */ }
  // Fallback 3: bersihkan semua lalu coba entry minimal (data tetap aman di IDB)
  try {
    localStorage.removeItem(STORAGE_KEY);
    const latest = list[list.length - 1];
    if (latest) {
      const minimal = { id: latest.id, fileName: latest.fileName, savedAt: latest.savedAt, base64: "" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([minimal]));
    }
  } catch (_) {
    // Total failure — data tidak bisa disimpan ke localStorage
  }
}

function writeListSync(list) {
  memoryList = list;
  persistList(list);
  idbWrite(list).catch(() => {});
}

/**
 * Muat data file dari IndexedDB (sumber utama) dan sejajarkan dengan cache lokal.
 * Panggil sekali saat aplikasi dibuka — setelah resolve, loadFiles() akan
 * mengembalikan daftar lengkap dari IndexedDB.
 */
export function hydrateFiles() {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    const idbList = (await idbRead().catch(() => null)) || [];
    const lsList = loadFilesMeta();
    // Gabungkan per-file: copy dengan byte sebenarnya (rawBase64/base64)
    // lebih diutamakan daripada entry terdegradasi; jika sama-sama lengkap,
    // versi tersimpan terbaru yang menang. Ini menjaga file utuh meski
    // penulisan localStorage & IndexedDB tidak selalu sinkron.
    const merged = new Map();
    for (const e of idbList) merged.set(e.id, e);
    let touched = false;
    const isComplete = (e) => !!(e && (e.rawBase64 || (e.base64 && e.base64.length > 0)));
    for (const e of lsList) {
      const cur = merged.get(e.id);
      if (!cur) {
        merged.set(e.id, e);
        touched = true;
        continue;
      }
      const eComplete = isComplete(e);
      const cComplete = isComplete(cur);
      if (eComplete && !cComplete) {
        merged.set(e.id, e);
        touched = true;
      } else if (eComplete === cComplete) {
        const eTime = Date.parse(e.savedAt || "") || 0;
        const cTime = Date.parse(cur.savedAt || "") || 0;
        if (eTime > cTime) {
          merged.set(e.id, e);
          touched = true;
        }
      }
    }
    memoryList = Array.from(merged.values());
    if (touched) {
      persistList(memoryList);
      await idbWrite(memoryList).catch(() => {});
    }
    return memoryList;
  })();
  return hydrationPromise;
}

export function loadFiles() {
  try {
    const list = memoryList !== null ? memoryList : loadFilesMeta();
    if (!Array.isArray(list)) return [];
    return list.map((item) => {
      try {
        // Reload dari base64 — gunakan base64 mentah asli (rawBase64) bila
        // tersimpan, atau fallback ke base64 hasil XLSX.write (hasil rebuild).
        const b64 = item.rawBase64 || item.base64;
        if (!b64) return null;
        const wb = XLSX.read(b64, { type: "base64", cellDates: true, cellStyles: true });
        // XLSX.write membuang gambar saat penyimpanan, jadi gambar file asli
        // disimpan terpisah dan dipulihkan ke workbook setelah di-parse ulang.
        if (item.images) wb.__images = item.images;
        // Reader tidak mempertahankan border/font/alignment — pulihkan dari
        // manifest style yang tersimpan saat import agar hasil refresh konsisten.
        if (item.styles) {
          applyStylesManifest(wb, item.styles);
          wb.__stylesManifest = item.styles;
        }
        return { id: item.id, fileName: item.fileName, savedAt: item.savedAt, workbook: wb, sheetNames: wb.SheetNames, rawBase64: item.rawBase64 || "" };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveFile(fileEntry) {
  const list = (memoryList !== null ? memoryList : loadFilesMeta()).slice();
  const prior = list.find((f) => f.id === fileEntry.id);
  // Simpan base64 mentah dari file asli bila tersedia — lebih ringan &
  // lebih akurat daripada XLSX.write ulang (yang juga membuang gambar).
  // Bila tidak ada (file buatan user), serialisasi dari workbook.
  let base64;
  try {
    base64 = fileEntry.rawBase64 || XLSX.write(bakeThemeColors(fileEntry.workbook), { type: "base64", bookType: "xlsx" });
  } catch (_) {
    base64 = "";
  }
  const entry = {
    id: fileEntry.id,
    fileName: fileEntry.fileName,
    savedAt: new Date().toISOString(),
    base64: base64,
  };
  // JAGA byte ORIGINAL file asli: bila pemanggil tidak menyediakan rawBase64
  // (simpan otomatis dari grid editor), pertahankan rawBase64 yang SUDAH
  // tersimpan daripada menimpanya dengan hasil rebuild. Ini mencegah file
  // asli hilang/terkorupsi dan memastikan reload selalu me-parse data 1:1.
  const rawOriginal = fileEntry.rawBase64 || (prior && prior.rawBase64) || "";
  if (rawOriginal) entry.rawBase64 = rawOriginal;
  // Gambar/bentuk dari file asli (extractImages) ikut disimpan agar setelah
  // reload tampilan tetap lengkap meskipun XLSX.write tidak menulis gambar.
  // Rebuild editor tidak membawa gambar → pertahankan milik file asli.
  const imgs =
    fileEntry.workbook && fileEntry.workbook.__images && Object.keys(fileEntry.workbook.__images).length > 0
      ? fileEntry.workbook.__images
      : prior && prior.images;
  if (imgs && Object.keys(imgs).length > 0) entry.images = imgs;
  const styles = (fileEntry.workbook && fileEntry.workbook.__stylesManifest) || (prior && prior.styles);
  if (styles) entry.styles = styles;
  const exists = list.findIndex((f) => f.id === entry.id);
  if (exists >= 0) {
    list[exists] = entry;
  } else {
    list.push(entry);
  }
  if (list.length > MAX_FILES) list.splice(0, list.length - MAX_FILES);
  writeListSync(list);
}

export function removeFile(fileId) {
  const list = (memoryList !== null ? memoryList : loadFilesMeta()).filter((f) => f.id !== fileId);
  writeListSync(list);
  removeDraftSheets(fileId);
}

export function clearAllFiles() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* ignore */ }
  memoryList = [];
  idbDelete().catch(() => {});
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}