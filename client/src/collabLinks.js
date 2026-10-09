// Pautan file lokal <-> sheet server untuk kolaborasi.
// Disimpan di localStorage: { [fileId]: { workbookKey, sheets: [{ sheetName, sheetId, kolom }] } }
const KEY = "sisnerling_collab_links";

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* penyimpanan penuh: abaikan */
  }
}

export function getCollabLink(fileId) {
  if (!fileId) return null;
  return loadAll()[fileId] || null;
}

// workbookKey = nama file tanpa ekstensi (sama dengan fileStem server:
// filename tanpa akhiran .ext).
export function fileStemOf(fileName) {
  return String(fileName || "").trim().replace(/\.[^.]+$/, "");
}

export function saveCollabLink(fileId, fileName, sheets) {
  if (!fileId) return null;
  const map = loadAll();
  map[fileId] = {
    workbookKey: fileStemOf(fileName),
    savedAt: new Date().toISOString(),
    sheets: (sheets || []).map((s) => ({
      sheetName: s.sheetName,
      sheetId: s.sheetId,
      kolom: Array.isArray(s.kolom) ? s.kolom : [],
    })),
  };
  saveAll(map);
  return map[fileId];
}

export function clearCollabLink(fileId) {
  if (!fileId) return;
  const map = loadAll();
  delete map[fileId];
  saveAll(map);
}
