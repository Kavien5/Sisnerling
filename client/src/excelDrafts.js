// ===== Draft hasil edit per file (IndexedDB) =====
//
// Hasil edit grid editor (tata letak, isi sel, dan RUMUS — termasuk referensi
// antar-file) disimpan sebagai "draft" per file-id. Byte ASLI file hasil import
// (rawBase64) TIDAK pernah disentuh; draft hanya lapisan edit yang ditaruh di
// atasnya saat file dibuka kembali. Dengan ini referensi antar-file bertahan
// saat refresh / pindah halaman / buka-tutup aplikasi (IndexedDB tahan-quota),
// sementara kebenaran struktur file asli tetap terjaga.

const IDB_NAME = "sisnerling-file-storage";
const IDB_STORE = "editorDrafts";
const IDB_VERSION = 2;
const DEBOUNCE_MS = 900;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB tidak tersedia"));
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
      if (!db.objectStoreNames.contains("importedFiles")) {
        db.createObjectStore("importedFiles");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Tulis debounced agar mengetik/scroll tidak tersendat oleh serialisasi besar.
const pendingWrites = new Map(); // fileId -> { timeout, sheets }

export function saveDraftSheets(fileId, sheets) {
  if (!fileId) return;
  const prev = pendingWrites.get(fileId);
  if (prev) {
    clearTimeout(prev.timeout);
    pendingWrites.delete(fileId);
  }
  // Referensi grid immutable (React) — aman ditahan lalu diserialisasi saat menulis.
  const timeout = setTimeout(() => {
    pendingWrites.delete(fileId);
    writeToDB(fileId, sheets).catch((err) => {
      console.error("[excelDrafts] Gagal menyimpan draft spreadsheet:", err);
    });
  }, DEBOUNCE_MS);
  pendingWrites.set(fileId, { timeout, sheets });
}

function writeToDB(fileId, sheets) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put({ id: fileId, sheets, savedAt: new Date().toISOString() }, fileId);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error("Penyimpanan draft dibatalkan"));
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("Gagal menyimpan draft"));
        };
      })
  );
}

export function flushDraftSheets(fileId, sheets) {
  if (!fileId) return Promise.resolve();
  const pending = pendingWrites.get(fileId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingWrites.delete(fileId);
  }
  return writeToDB(fileId, sheets || (pending && pending.sheets));
}

export function loadDraftSheets(fileId) {
  return new Promise((resolve) => {
    if (!fileId) return resolve(null);
    openDB()
      .then((db) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(fileId);
        req.onsuccess = () => {
          db.close();
          const rec = req.result;
          resolve(rec && Array.isArray(rec.sheets) && rec.sheets.length > 0 ? rec.sheets : null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      })
      .catch(() => resolve(null));
  });
}

export function removeDraftSheets(fileId) {
  if (!fileId) return;
  const prev = pendingWrites.get(fileId);
  if (prev) {
    clearTimeout(prev.timeout);
    pendingWrites.delete(fileId);
  }
  openDB()
    .then((db) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(fileId);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    })
    .catch(() => {});
}