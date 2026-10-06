/**
 * Sumber data file Excel terimport.
 *
 * SEBELUMNYA daftar file hanya hidup di IndexedDB/localStorage browser, sehingga
 * hilang saat refresh dan tidak pernah ada di server. Sekarang SERVER adalah
 * sumber kebenaran:
 *
 *   - Daftar file  : GET /api/files (dari MySQL)
 *   - Byte asli    : tersimpan di disk server, diambil lewat /api/files/:code/content
 *   - IndexedDB    : hanya cache lokal agar buka file terasa cepat & tetap jalan
 *                     saat server sempat tidak terjangkau
 *
 * Kontrak export modul ini sengaja tidak berubah (loadFiles, saveFile,
 * removeFile, generateId, hydrateFiles, clearAllFiles) supaya halaman
 * File & Import, Spreadsheet, dan ExcelResult tidak perlu diubah strukturnya.
 *
 * ID file memakai kode permanen dari server (WB_001) bila tersedia. itu yang
 * dipakai draft, history, dan referensi antar-file — sehingga saat file yang
 * sama dibuka lagi, edit sebelumnya tetap menempel pada file yang benar.
 */
import * as XLSX from "xlsx-js-style";
import { bakeThemeColors } from "./excelImportUtil.js";
import { applyStylesManifest } from "./excelRawStyles.js";
import { removeDraftSheets } from "./excelDrafts.js";
import { api } from "./api.js";

const STORAGE_KEY = "sisnerling_imported_files";
// Cache lokal tidak lagi menjadi tempat penyimpanan utama, jadi batasnya
// cukup longgar: yang penting browser tidak menahan terlalu banyak base64.
const MAX_FILES = 40;

const IDB_NAME = "sisnerling-file-storage";
const IDB_STORE = "importedFiles";
const IDB_KEY = STORAGE_KEY;
const IDB_VERSION = 2;

let dbPromise = null;
let memoryList = null;
let hydrationPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB tidak tersedia"));
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains("editorDrafts")) db.createObjectStore("editorDrafts");
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
        const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(IDB_KEY);
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

// ===== Cache lokal =====
// localStorage hanya menyimpan entry TANPA byte (id + nama + tanggal) supaya
// tidak pernah kena kuota. Byte asli ada di IndexedDB dan, yang utama, di
// server. Failover degrade ke localStorage tidak lagi berarti kehilangan file.

function loadFilesMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistList(list) {
  if (typeof localStorage === "undefined") return;
  try {
    // Hanya metadata ringan — JANGAN pernah menulis base64 ke localStorage.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        list.map((e) => ({
          id: e.id,
          workbookCode: e.workbookCode || null,
          fileName: e.fileName,
          savedAt: e.savedAt,
        }))
      )
    );
  } catch (_) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (__) {
      /* abaikan */
    }
  }
}

function writeListSync(list) {
  memoryList = list;
  persistList(list);
  idbWrite(list).catch(() => {});
}

function parseWorkbookFromBase64(item) {
  const b64 = item.rawBase64 || item.base64;
  if (!b64) return null;
  const wb = XLSX.read(b64, { type: "base64", cellDates: true, cellStyles: true });
  // XLSX.write membuang gambar, jadi gambar file asli disimpan terpisah lalu
  // dipulihkan ke workbook setelah di-parse ulang.
  if (item.images) wb.__images = item.images;
  // Reader tidak mempertahankan border/font/alignment — pulihkan dari manifest
  // style tersimpan saat import agar hasil refresh tetap konsisten.
  if (item.styles) {
    applyStylesManifest(wb, item.styles);
    wb.__stylesManifest = item.styles;
  }
  return wb;
}

/**
 * Ubah satu item cache menjadi entry UI.
 *
 * Entry TIDAK selalu punya `workbook`: file yang baru dimuat dari server belum
 * diunduh byte-nya (lihat hydrateFiles) dan sengaja dibiarkan lazy. Halaman
 * yang hanya butuh daftar/metadata tetap bisa menampilkannya; halaman yang
 * membuka isi file memanggil ensureFileLoaded() lebih dulu.
 */
function entryFromItem(item) {
  const shell = {
    id: item.id,
    workbookCode: item.workbookCode || null,
    fileName: item.fileName,
    savedAt: item.savedAt,
    sizeBytes: item.sizeBytes || 0,
    jumlahSheet: item.jumlahSheet || (item.serverSheets ? item.serverSheets.length : 0),
    serverSheets: item.serverSheets || null,
    punyaFile: item.punyaFile !== false,
    reconstructed: item.reconstructed === true,
  };
  if (item.unregistered) shell.unregistered = true;
  if (!item.rawBase64 && !item.base64) return { ...shell, workbook: null, sheetNames: null, rawBase64: "" };
  try {
    const wb = parseWorkbookFromBase64(item);
    if (!wb) return null;
    return {
      ...shell,
      jumlahSheet: item.jumlahSheet || (wb.SheetNames ? wb.SheetNames.length : 0),
      workbook: wb,
      sheetNames: wb.SheetNames,
      rawBase64: item.rawBase64 || "",
    };
  } catch {
    // Byte rusak di cache: tetap tampilkan file-nya agar bisa diunduh ulang
    // dari server, jangan sampai hilang dari daftar.
    return { ...shell, workbook: null, sheetNames: null, rawBase64: "" };
  }
}

function allCachedItems() {
  return memoryList !== null ? memoryList : loadFilesMeta();
}

/**
 * Baca cache lokal dengan tries: memori → IndexedDB → localStorage.
 *
 * IndexedDB adalah satu-satunya cache yang menyimpan byte asli (localStorage
 * hanya metadata ringan), jadi ia harus dibaca agar file yang sudah pernah
 * dibuka tidak perlu diunduh ulang dari server setiap refresh.
 */
async function readCachedItems() {
  if (memoryList !== null) return memoryList;
  try {
    const fromIdb = await idbRead();
    if (Array.isArray(fromIdb) && fromIdb.length) {
      memoryList = fromIdb;
      return fromIdb;
    }
  } catch {
    /* IndexedDB tidak tersedia / dibuka gagal → lanjut ke metadata */
  }
  const meta = loadFilesMeta();
  memoryList = Array.isArray(meta) ? meta : [];
  return memoryList;
}

/**
 * Daftar file dalam bentuk yang dipakai UI.
 *
 * Entry yang byte-nya ada di cache lokal langsung di-parse. Entry yang hanya
 * ada di server TIDAK diunduh otomatis di sini (menghemat waktu & memori);
 * halamannya akan memanggil ensureFileLoaded() saat file itu benar-benar dibuka.
 */
export function loadFiles() {
  try {
    const items = allCachedItems();
    if (!Array.isArray(items)) return [];
    return items.map(entryFromItem).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Pastikan byte asli sebuah file ada di memori. Mengunduh dari server bila cache
 * lokal tidak punya. Mengembalikan entry file, atau null bila gagal dimuat.
 *
 * Dipanggil halaman Spreadsheet/ExcelResult sebelum membuka file, sehingga file
 * yang diimpor di browser lain (atau setelah restart backend) tetap bisa dibuka.
 */
export async function ensureFileLoaded(fileId) {
  const items = await readCachedItems();
  if (!Array.isArray(items)) return null;
  const idx = items.findIndex((e) => e.id === fileId);
  if (idx < 0) return null;

  // Sudah ada byte utuh di cache → cukup parse ulang.
  if (items[idx].rawBase64 || items[idx].base64) {
    const entry = entryFromItem(items[idx]);
    if (entry) return entry;
  }

  const code = items[idx].workbookCode;
  if (!code) return null;
  try {
    const res = await api.getFileContent(code);
    if (!res || !res.base64) return null;
    const next = items.slice();
    next[idx] = { ...next[idx], rawBase64: res.base64, base64: res.base64, sizeBytes: res.sizeBytes || next[idx].sizeBytes };
    writeListSync(next);
    return entryFromItem(next[idx]);
  } catch (_) {
    return null;
  }
}

/**
 * Pastikan byte SEMUA file sudah ada di memori.
 *
 * Dipakai halaman yang butuh referensi formula ANTAR-FILE (Spreadsheet dan
 * pratinjau Penugasan Admin). Setelah refresh, daftar file dari server sengaja
 * disimpan lazy (tanpa byte). File lain baru bisa dirujuk oleh rumus bila
 * byte-nya benar-benar dimuat — maka semua file yang belum punya byte diunduh
 * di sini. Mengembalikan daftar entry terbaru (yang sudah punya workbook).
 */
export async function ensureAllFilesLoaded() {
  const items = await readCachedItems();
  if (!Array.isArray(items)) return [];
  const missing = items.filter(
    (e) => e && e.workbookCode && !e.rawBase64 && !e.base64
  );
  for (const e of missing) {
    try {
      await ensureFileLoaded(e.id);
    } catch (_) {
      /* file individual gagal; file lain tetap dicoba */
    }
  }
  return loadFiles();
}

/**
 * Muat daftar file dari server dan selaraskan dengan cache lokal.
 *
 * Alur importance:
 *   1. GET /api/files  → daftar kanonik (dari MySQL)
 *   2. Gabungkan dengan cache lokal berdasarkan workbookCode / nama file
 *   3. File yang byte-nya belum ada TIDAK diunduh (dimuat saat dibuka)
 *
 * Ini yang membuat File & Import tetap berisi setelah refresh, logout/login,
 * dan restart backend — karena daftar berasal dari database, bukan dari browser.
 */
export function hydrateFiles() {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    // (selesai) — promise sengaja direset di bawah supaya pemuatan berikutnya
    // (mis. logout → login, atau kembali ke halaman File & Import) benar-benar
    // membaca ulang daftar terbaru dari database, bukan memakai hasil lama.
    let serverFiles = [];
    try {
      serverFiles = await api.getFiles();
    } catch (err) {
      // Server tidak terjangkau: pakai cache lokal agar UI tidak kosong total.
      // Daftar dari server akan diambil lagi saat halaman dibuka berikutnya.
      console.warn("[files] Gagal ambil daftar dari server, memakai cache lokal:", err && err.message);
      const cached = await readCachedItems();
      memoryList = Array.isArray(cached) ? cached : [];
      return memoryList;
    }

    const cached = await readCachedItems();
    const cachedByCode = new Map();
    const cachedByName = new Map();
    for (const e of Array.isArray(cached) ? cached : []) {
      if (e && e.workbookCode) cachedByCode.set(e.workbookCode, e);
      if (e && e.fileName) cachedByName.set(e.fileName, e);
    }

    const merged = [];
    for (const f of Array.isArray(serverFiles) ? serverFiles : []) {
      const hit = cachedByCode.get(f.workbookCode) || cachedByName.get(f.fileName);
      const item = {
        // ID lokal = kode permanen dari server (WB_001) supaya draft & history
        // yang sudah ada tetap menempel pada file yang sama setelah refresh.
        id: f.workbookCode,
        workbookCode: f.workbookCode,
        fileName: f.fileName,
        savedAt: f.tanggalImport || f.updatedAt || f.createdAt || null,
        sizeBytes: f.sizeBytes || 0,
        jumlahSheet: f.jumlahSheet || (f.sheets ? f.sheets.length : 0),
        serverSheets: f.sheets || null,
        punyaFile: f.punyaFile !== false,
        reconstructed: f.reconstructed === true,
      };
      // Pertahankan byte & gambar dari cache lokal bila ada (hemat unduhan).
      if (hit) {
        item.rawBase64 = hit.rawBase64;
        item.base64 = hit.base64;
        item.images = hit.images;
        item.styles = hit.styles;
      }
      merged.push(item);
    }

    // File yang masih ada di cache tapi belum terdaftar di server (mis. import
    // yang gagal saat disimpan ke server, atau file lama yang belum pernah
    // naik ke backend) tetap dipertahankan agar tidak hilang dari daftar.
    const knownNames = new Set(merged.map((m) => m.fileName));
    for (const e of Array.isArray(cached) ? cached : []) {
      if (!e || !e.fileName) continue;
      if (knownNames.has(e.fileName)) continue;
      merged.push({ ...e, unregistered: true });
    }

    memoryList = merged;
    writeListSync(merged);
    return merged;
  })();
  // Reset setelah selesai (baik sukses maupun gagal) agar pemanggilan
  // berikutnya mengambil daftar terbaru dari server. Selama pemuatan masih
  // berjalan, pemanggil bersamaan tetap berbagi promise yang sama.
  hydrationPromise
    .catch(() => {})
    .finally(() => {
      hydrationPromise = null;
    });
  return hydrationPromise;
}

/**
 * Simpan file ke server (permanen) dan segarkan daftar lokal.
 *
 * Ini dipanggil saat pengguna meng-import file. Byte asli dikirim apa adanya,
 * sehingga struktur Excel (sheet, formula, merge, format, gambar, baris/kolom
 * kosong) tersimpan utuh di server.
 */
export async function saveFileToServer(fileEntry) {
  const fileName = String(fileEntry.fileName || "").trim();
  let base64 = fileEntry.rawBase64 || fileEntry.base64 || "";
  if (!base64 && fileEntry.workbook) {
    // Workbook buatan user (bukan hasil import file) tidak punya byte asli,
    // jadi diserialisasi sekali untuk disimpan.
    try {
      base64 = XLSX.write(bakeThemeColors(fileEntry.workbook), { type: "base64", bookType: "xlsx" });
    } catch (_) {
      base64 = "";
    }
  }
  if (!base64) throw new Error("File tidak memiliki isi yang bisa disimpan");

  const res = await api.uploadFile({ base64, fileName });

  // Samarkan dengan cache lokal memakai kode dari server.
  const items = allCachedItems().slice();
  const prior = items.find((e) => e.id === fileEntry.id || e.fileName === fileName);
  const item = {
    id: res.workbookCode || fileEntry.id,
    workbookCode: res.workbookCode || null,
    fileName: res.fileName || fileName,
    savedAt: new Date().toISOString(),
    sizeBytes: res.sizeBytes || 0,
    jumlahSheet: res.jumlahSheet || 0,
    rawBase64: base64,
    base64,
  };
  if (fileEntry.workbook && fileEntry.workbook.__images && Object.keys(fileEntry.workbook.__images).length) {
    item.images = fileEntry.workbook.__images;
  }
  if (fileEntry.workbook && fileEntry.workbook.__stylesManifest) {
    item.styles = fileEntry.workbook.__stylesManifest;
  }

  const idx = items.findIndex((e) => e.id === item.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...item };
  } else if (prior) {
    items[items.indexOf(prior)] = { ...prior, ...item };
  } else {
    items.push(item);
  }
  if (items.length > MAX_FILES) items.splice(0, items.length - MAX_FILES);
  writeListSync(items);
  return item;
}

/**
 * Sinkronisasi edit Spreadsheet ke server.
 *
 * saveFile() dipanggil sangat sering (setiap commit sel, perpindahan file,
 * bahkan saat unload), jadi unggahannya DITUNDA (debounce) per file: hanya
 * request terakhir yang terkirim. Draft di IndexedDB tetap ditulis langsung
 * sehingga unload tidaklose data, dan flushSync() dipanggil saat pindah file
 * atau menutup tab untuk memaksa unggahan terakhir.
 */
const SYNC_DELAY_MS = 1200;
const pendingSync = new Map();

function scheduleServerSync(workbookCode, base64) {
  if (!workbookCode || !base64) return;
  const prev = pendingSync.get(workbookCode);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pendingSync.delete(workbookCode);
    pushContentToServer(workbookCode, base64);
  }, SYNC_DELAY_MS);
  pendingSync.set(workbookCode, { timer, base64 });
}

async function pushContentToServer(workbookCode, base64) {
  try {
    await api.saveFileContent(workbookCode, { base64 });
  } catch (err) {
    // Kegagalan unggah tidak boleh menghentikan editor: draft lokal sudah
    // tersimpan, dan percobaan berikutnya akan mengunggah ulang.
    console.warn("[files] Gagal menyimpan isi workbook ke server:", err && err.message);
  }
}

/**
 * Paksa unggahan terakhir yang masih tertunda (dipanggil sebelum pindah file,
 * publish, atau menutup halaman).
 */
export function flushSync() {
  for (const [code, entry] of pendingSync) {
    clearTimeout(entry.timer);
    pendingSync.delete(code);
    pushContentToServer(code, entry.base64);
  }
}

/**
 * Simpan hasil edit ke cache lokal DAN ke server.
 *
 * Cache lokal ditulis sinkron (agar aman untuk draft/undo), sedangkan
 * unggahan ke server didebounce lewat scheduleServerSync(). Kode workbook tidak
 * pernah berubah, jadi file yang sama tetap terhubung dengan File & Import,
 * Penugasan, draft, dan history.
 */
export function saveFile(fileEntry) {
  const list = allCachedItems().slice();
  const prior = list.find((f) => f.id === fileEntry.id);
  let base64 = fileEntry.rawBase64 || (prior && prior.rawBase64) || "";
  // File yang baru saja diunduh dari server belum punya byte tersimpan; serialisasi
  // dari workbook hasil edit agar perubahan benar-benar tersimpan.
  if (!base64 && fileEntry.workbook) {
    try {
      base64 = XLSX.write(bakeThemeColors(fileEntry.workbook), { type: "base64", bookType: "xlsx" });
    } catch (_) {
      base64 = "";
    }
  }
  const entry = {
    ...(prior || {}),
    id: fileEntry.id,
    workbookCode: (prior && prior.workbookCode) || fileEntry.workbookCode || null,
    fileName: fileEntry.fileName,
    savedAt: new Date().toISOString(),
    base64,
  };
  if (base64) entry.rawBase64 = base64;
  const imgs =
    fileEntry.workbook && fileEntry.workbook.__images && Object.keys(fileEntry.workbook.__images).length > 0
      ? fileEntry.workbook.__images
      : prior && prior.images;
  if (imgs && Object.keys(imgs).length > 0) entry.images = imgs;
  const styles = (fileEntry.workbook && fileEntry.workbook.__stylesManifest) || (prior && prior.styles);
  if (styles) entry.styles = styles;
  if (fileEntry.sizeBytes) entry.sizeBytes = fileEntry.sizeBytes;

  const idx = list.findIndex((f) => f.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  if (list.length > MAX_FILES) list.splice(0, list.length - MAX_FILES);
  writeListSync(list);

  // Unggah ke server secara tertunda. Hanya file yang sudah punya kode
  // permanen yang bisa disinkronkan; file hasil import baru sudah tersimpan
  // lewat saveFileToServer().
  scheduleServerSync(entry.workbookCode, base64);
}

/**
 * Hapus file. Permanen hanya terjadi bila server confirms (Super Admin +
 * konfirmasi di UI); cache lokal dibersihkan setelahnya.
 */
export async function removeFile(fileId, { skipServer = false } = {}) {
  const items = allCachedItems();
  const target = Array.isArray(items) ? items.find((f) => f.id === fileId) : null;
  if (!skipServer && target && target.workbookCode) {
    // Unggahan tertunda untuk file ini tidak perlu lagi (file akan dihapus).
    const pending = pendingSync.get(target.workbookCode);
    if (pending) {
      clearTimeout(pending.timer);
      pendingSync.delete(target.workbookCode);
    }
    await api.deleteFile(target.workbookCode);
  }
  const next = (Array.isArray(items) ? items : []).filter((f) => f.id !== fileId);
  writeListSync(next);
  removeDraftSheets(fileId);
  return next;
}

/**
 * Hapus seluruh cache lokal. Dipanggil saat akun dihapus. TIDAK menghapus
 * file di server — file milik server hanya bisa dihapus lewat aksi eksplisit
 * Super Admin (lihat removeFile).
 */
export function clearAllFiles() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* abaikan */
  }
  memoryList = [];
  idbDelete().catch(() => {});
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}