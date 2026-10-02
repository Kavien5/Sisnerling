import * as XLSX from "xlsx-js-style";

const STORAGE_KEY = "sisnerling_file_history";
const TRASH_KEY = "sisnerling_file_trash";
const MAX_VERSIONS_PER_FILE = 25;

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Quota exceeded or serialization failed — ignore to avoid breaking the app
  }
}

/**
 * Simpan snapshot versi workbook ke riwayat untuk sebuah file.
 * Setiap pemanggilan mengapend versi baru (tidak menimpa yang lama).
 * workbook adalah objek SheetJS (XLSX.WorkBook).
 */
export function snapshotVersion({ fileId, fileName, workbook, label }) {
  const history = loadJson(STORAGE_KEY, {});
  const fileHistory = history[fileId] || { fileName, versions: [] };
  if (fileName) fileHistory.fileName = fileName;

  let base64 = "";
  try {
    base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  } catch (_) {
    return null;
  }

  const version = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    version: fileHistory.versions.length + 1,
    createdAt: new Date().toISOString(),
    label: label || "Simpan manual",
    base64,
    sheetNames: workbook && Array.isArray(workbook.SheetNames) ? workbook.SheetNames.slice() : [],
  };

  // Jangan menimpa versi lama — selalu push versi baru.
  fileHistory.versions.push(version);
  // Batasi jumlah versi agar localStorage tidak penuh (hapus yang paling lama).
  if (fileHistory.versions.length > MAX_VERSIONS_PER_FILE) {
    fileHistory.versions = fileHistory.versions.slice(fileHistory.versions.length - MAX_VERSIONS_PER_FILE);
  }
  history[fileId] = fileHistory;
  saveJson(STORAGE_KEY, history);
  return version;
}

/**
 * Ambil daftar versi untuk sebuah file (termasuk yang di-trash).
 * Mengembalikan array meta tanpa base64 untuk ringan di UI.
 */
export function listVersions(fileId) {
  const history = loadJson(STORAGE_KEY, {});
  const fileHistory = history[fileId];
  if (!fileHistory) return [];
  return (fileHistory.versions || []).map((v) => ({
    id: v.id,
    version: v.version,
    createdAt: v.createdAt,
    label: v.label,
    sheetNames: v.sheetNames || [],
    trashed: !!v.trashed,
  }));
}

/** Ambil satu versi lengkap (dengan workbook dingin yang siap dipakai). */
export function getVersion(fileId, versionId) {
  const history = loadJson(STORAGE_KEY, {});
  const fileHistory = history[fileId];
  if (!fileHistory) return null;
  const v = (fileHistory.versions || []).find((x) => x.id === versionId);
  if (!v) return null;
  try {
    const wb = XLSX.read(v.base64, { type: "base64", cellDates: true });
    return { id: v.id, version: v.version, createdAt: v.createdAt, label: v.label, workbook: wb, trashed: !!v.trashed };
  } catch (_) {
    return null;
  }
}

/**
 * Tandai sebuah file sebagai "dihapus" (soft delete). Urutan sejarah dipertahankan
 * sehingga file masih bisa dikembalikan. Memberi label khusus pada versi terakhir.
 */
export function trashFile(fileId, label) {
  const history = loadJson(STORAGE_KEY, {});
  const fileHistory = history[fileId];
  if (!fileHistory) return;
  const versions = fileHistory.versions || [];
  if (versions.length > 0) {
    const last = versions[versions.length - 1];
    versions[versions.length - 1] = { ...last, trashed: true, label: label || last.label };
  }
  history[fileId] = { ...fileHistory, trashed: true, versions };
  saveJson(STORAGE_KEY, history);

  // Catat di trash agar tetap terlihat meski sudah tidak di daftar file.
  const trash = loadJson(TRASH_KEY, []);
  if (!trash.some((t) => t.fileId === fileId)) {
    trash.unshift({ fileId, fileName: fileHistory.fileName, trashedAt: new Date().toISOString() });
  }
  saveJson(TRASH_KEY, trash);
}

/** Daftar item trash (file yang dilempar ke riwayat/trash). */
export function listTrashedFiles() {
  return loadJson(TRASH_KEY, []);
}

/** Pulihkan (restore) file yang di-trash sehingga aktif kembali. */
export function restoreTrashedFile(fileId) {
  const trash = loadJson(TRASH_KEY, []).filter((t) => t.fileId !== fileId);
  saveJson(TRASH_KEY, trash);
  const history = loadJson(STORAGE_KEY, {});
  const fileHistory = history[fileId];
  if (fileHistory) {
    const versions = fileHistory.versions || [];
    if (versions.length > 0) {
      const last = versions[versions.length - 1];
      versions[versions.length - 1] = { ...last, trashed: false };
    }
    history[fileId] = { ...fileHistory, trashed: false, versions };
    saveJson(STORAGE_KEY, history);
  }
  return restoreFileFromLastVersion(fileId);
}

/** Pulihkan SEMUA file yang ada di sampah. Mengembalikan daftar file yang berhasil dipulihkan. */
export function restoreAllTrash() {
  const trash = loadJson(TRASH_KEY, []);
  const ids = trash.map((t) => t.fileId);
  const restored = [];
  for (const id of ids) {
    const res = restoreTrashedFile(id);
    if (res) restored.push({ fileId: id, ...res });
  }
  return restored;
}

/** Hapus permanen SEMUA file di sampah beserta seluruh riwayatnya. Mengembalikan jumlah yang dihapus. */
export function purgeAllTrash() {
  const trash = loadJson(TRASH_KEY, []);
  const history = loadJson(STORAGE_KEY, {});
  for (const t of trash) delete history[t.fileId];
  saveJson(STORAGE_KEY, history);
  localStorage.removeItem(TRASH_KEY);
  return trash.length;
}

/** Hapus permanen riwayat sebuah file (dipakai saat Hapus Permanen pada trash). */
export function purgeFileHistory(fileId) {
  const history = loadJson(STORAGE_KEY, {});
  delete history[fileId];
  saveJson(STORAGE_KEY, history);
  const trash = loadJson(TRASH_KEY, []).filter((t) => t.fileId !== fileId);
  saveJson(TRASH_KEY, trash);
}

/** Hapus permanen satu versi tertentu dari riwayat. */
export function purgeVersion(fileId, versionId) {
  const history = loadJson(STORAGE_KEY, {});
  const fileHistory = history[fileId];
  if (!fileHistory) return;
  fileHistory.versions = (fileHistory.versions || []).filter((v) => v.id !== versionId);
  // Renumber versions
  fileHistory.versions = fileHistory.versions.map((v, i) => ({ ...v, version: i + 1 }));
  history[fileId] = fileHistory;
  saveJson(STORAGE_KEY, history);
}

/** Hapus permanen SEMUA versi milik sebuah file. */
export function purgeAllVersions(fileId) {
  const history = loadJson(STORAGE_KEY, {});
  const fileHistory = history[fileId];
  if (!fileHistory) return;
  history[fileId] = { ...fileHistory, versions: [] };
  saveJson(STORAGE_KEY, history);
}

/** Bangun ulang file dari versi terakhir yang tidak di-trash. Dipakai saat restore trash. */
export function restoreFileFromLastVersion(fileId) {
  const history = loadJson(STORAGE_KEY, {});
  const fileHistory = history[fileId];
  if (!fileHistory || !fileHistory.versions || fileHistory.versions.length === 0) return null;
  const candidates = fileHistory.versions.filter((v) => !v.trashed);
  const last = candidates[candidates.length - 1] || fileHistory.versions[fileHistory.versions.length - 1];
  if (!last) return null;
  try {
    const wb = XLSX.read(last.base64, { type: "base64", cellDates: true });
    return {
      fileName: fileHistory.fileName,
      savedAt: last.createdAt,
      workbook: wb,
    };
  } catch (_) {
    return null;
  }
}

/** Ambil nama file dari riwayat (untuk dipakai saat restore sebelum file ada di daftar). */
export function getHistoryFileName(fileId) {
  const history = loadJson(STORAGE_KEY, {});
  return history[fileId]?.fileName || null;
}
