/**
 * Uji backend kolaborasi Fase 1:
 *  1. Dua pengguna membuka file yang sama (socket join + presence).
 *  2. A edit sel -> B menerima via socket (tanpa refresh).
 *  3. Dua pengguna edit sel SAMA (stale base_versi -> 409 + current).
 *  4. Dua pengguna edit sel BERBEDA (keduanya tersimpan).
 *  5. Batch autosave + revisi (buat, daftar, pulihkan).
 *  6. Viewer mencoba edit -> 403.
 *  7. Tanpa akses: REST 403 + socket join ditolak.
 *  8. Validasi backend: kolom rumus terkunci, status invalid -> 400.
 */
const { io } = require("socket.io-client");
const BASE = "http://localhost:3000";
const TAG = `collab${Date.now().toString(36)}`;

let failures = 0;
function assert(cond, label, extra) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
  if (!cond) failures++;
}

const api = async (method, path, token, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch { /* non-json */ }
  return { status: res.status, json };
};

const login = async (email, password) => {
  const r = await api("POST", "/api/auth/login", null, { email, password });
  if (r.status !== 200 || !r.json.token) throw new Error(`Login gagal ${email}: ${JSON.stringify(r.json)}`);
  return r.json;
};

function waitEvent(sock, ev, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout menunggu ${ev}`)), timeout);
    sock.once(ev, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

async function main() {
  // --- 0. Login super_admin & siapkan akun uji ---
  const admin = await login("superadmin@sisnerling.local", "bbp6KvQXkqmA1!");
  const HA = admin.token;
  console.log("Login OK sebagai", admin.user.email);
  const H = (t) => t;

  const mkUser = async (nama, email) => {
    let r = await api("POST", "/api/admin/users", HA, { nama, email, password: "Rahasia123!", role: "user" });
    if (r.status === 409) {
      const l = await api("POST", "/api/auth/login", null, { email, password: "Rahasia123!" });
      return l.json;
    }
    if (r.status !== 201) throw new Error(`Buat user gagal: ${JSON.stringify(r.json)}`);
    return (await login(email, "Rahasia123!"));
  };
  const editor = await mkUser(`Editor ${TAG}`, `editor-${TAG}@test.local`);
  const viewer = await mkUser(`Viewer ${TAG}`, `viewer-${TAG}@test.local`);
  const outsider = await mkUser(`Luar ${TAG}`, `luar-${TAG}@test.local`);

  // --- 1. Buat sheet + 2 baris data ---
  const shName = `Kolab ${TAG}`;
  let r = await api("POST", "/api/spreadsheet", HA, { nama: shName });
  assert(r.status === 201, "1a. Buat sheet", `HTTP ${r.status}`);
  const listSheets = await api("GET", "/api/spreadsheet", HA);
  const sheet = listSheets.json.find((s) => s.nama === shName);
  assert(!!sheet, "1b. Sheet terdaftar", `id=${sheet && sheet.id}`);
  const sheetId = sheet.id;
  const wbKey = sheet.sumber_file || `sheet#${sheetId}`;

  const mkRow = async (kode, nama, jumlah) => {
    const rr = await api("POST", "/api/data", HA, {
      kode: `${kode}-${TAG}`, nama, jumlah, harga: 10000, status: "Pending", sheet_id: sheetId,
    });
    if (rr.status !== 201) throw new Error(`Buat baris gagal: ${JSON.stringify(rr.json)}`);
    return rr.json.id;
  };
  const rowA = await mkRow("KOL-A", "Baris A", 10);
  const rowB = await mkRow("KOL-B", "Baris B", 20);
  assert(!!rowA && !!rowB, "1c. Dua baris data dibuat");

  // --- 2. Berbagi akses ---
  r = await api("POST", `/api/collab/files/${encodeURIComponent(wbKey)}/shares`, HA, { user_id: editor.user.id, peran: "editor" });
  assert(r.status === 201, "2a. Share editor", `HTTP ${r.status}`);
  r = await api("POST", `/api/collab/files/${encodeURIComponent(wbKey)}/shares`, HA, { user_id: viewer.user.id, peran: "viewer" });
  assert(r.status === 201, "2b. Share viewer", `HTTP ${r.status}`);
  r = await api("GET", `/api/collab/files/${encodeURIComponent(wbKey)}/access`, H(editor.token));
  assert(r.json.read && r.json.write && r.json.level === "editor", "2c. Akses editor", JSON.stringify(r.json));
  r = await api("GET", `/api/collab/files/${encodeURIComponent(wbKey)}/access`, H(viewer.token));
  assert(r.json.read && !r.json.write && r.json.level === "viewer", "2d. Akses viewer", JSON.stringify(r.json));

  // --- 3. Socket: dua pengguna join + presence ---
  const sockA = io(BASE, { path: "/socket.io", auth: { token: HA } });
  const sockB = io(BASE, { path: "/socket.io", auth: { token: editor.token } });
  const joinA = await new Promise((res) => sockA.emit("join-file", { workbook_key: wbKey }, res));
  assert(joinA.ok, "3a. Admin join-file", JSON.stringify(joinA.access || joinA));
  const joinB = await new Promise((res) => sockB.emit("join-file", { workbook_key: wbKey }, res));
  assert(joinB.ok, "3b. Editor join-file");
  // Tunggu event presence yang memuat 2 pengguna (abaikan broadcast basi).
  let presence = null;
  for (let i = 0; i < 5; i++) {
    presence = await waitEvent(sockA, "presence").catch(() => null);
    if (presence && presence.users.length === 2) break;
  }
  assert(presence.users.length === 2, "3c. Presence 2 pengguna", JSON.stringify(presence.users.map((u) => u.nama)));

  // --- 4. A edit sel -> B menerima cell-applied ---
  const appliedP = waitEvent(sockB, "cell-applied");
  r = await api("PUT", "/api/collab/cells", HA, { row_id: rowA, col_key: "jumlah", value: 42, base_versi: 1 });
  assert(r.status === 200 && r.json.row.jumlah === 42 && r.json.row.versi === 2, "4a. Admin edit jumlah=42 (v2)", `HTTP ${r.status}`);
  // Catatan: REST tidak broadcast; broadcast via socket cell-op diuji di 4c.
  const opAck = await new Promise((res) =>
    sockA.emit("cell-op", { op_id: "op-1", row_id: rowB, col_key: "nama", value: "Baris B Updated", base_versi: 1 }, res)
  );
  assert(opAck.ok, "4b. Socket cell-op tersimpan", JSON.stringify(opAck.row || opAck));
  const applied = await appliedP;
  // applied pertama yang tiba bisa dari op mana pun; pastikan salah satunya cocok
  console.log(`   cell-applied diterima B: row=${applied.row.id} col=${applied.col_key}`);
  assert([rowA, rowB].includes(applied.row.id), "4c. B menerima cell-applied real-time");

  // --- 5. Konflik: dua pengguna edit sel SAMA ---
  // Editor memegang versi basi (v1) sementara versi berjalan = v2.
  r = await api("PUT", "/api/collab/cells", H(editor.token), { row_id: rowA, col_key: "jumlah", value: 99, base_versi: 1 });
  assert(r.status === 409 && r.json.current && Number(r.json.current.jumlah) === 42, "5a. Stale write ditolak 409 + nilai terkini", `HTTP ${r.status}`);
  // Tulis dengan versi benar berhasil.
  r = await api("PUT", "/api/collab/cells", H(editor.token), { row_id: rowA, col_key: "jumlah", value: 50, base_versi: 2 });
  assert(r.status === 200 && r.json.row.versi === 3, "5b. Write versi benar tersimpan (v3)", `HTTP ${r.status}`);

  // --- 6. Sel BERBEDA bersamaan (batch) ---
  r = await api("PUT", "/api/collab/cells/batch", H(editor.token), {
    ops: [
      { op_id: "b1", row_id: rowA, col_key: "keterangan", value: "ket-A", base_versi: 3 },
      { op_id: "b2", row_id: rowB, col_key: "keterangan", value: "ket-B", base_versi: 2 },
    ],
  });
  const okAll = r.status === 200 && r.json.results.every((x) => x.saved);
  assert(okAll, "6a. Batch 2 sel berbeda tersimpan", `HTTP ${r.status}`);
  // Batch campuran: satu konflik, satu sukses.
  r = await api("PUT", "/api/collab/cells/batch", H(editor.token), {
    ops: [
      { op_id: "c1", row_id: rowA, col_key: "keterangan", value: "stale", base_versi: 1 },
      { op_id: "c2", row_id: rowB, col_key: "jumlah", value: 77, base_versi: 3 },
    ],
  });
  const c1 = r.json.results.find((x) => x.op_id === "c1");
  const c2 = r.json.results.find((x) => x.op_id === "c2");
  assert(c1.conflict && c2.saved, "6b. Batch parsial: konflik + sukses", JSON.stringify(r.json.results.map((x) => ({ op: x.op_id, saved: !!x.saved, conflict: !!x.conflict }))));

  // --- 7. Viewer mencoba edit -> 403; baca tetap boleh ---
  r = await api("PUT", "/api/collab/cells", H(viewer.token), { row_id: rowA, col_key: "jumlah", value: 1, base_versi: 4 });
  assert(r.status === 403, "7a. Viewer edit ditolak 403", `HTTP ${r.status}`);
  r = await api("GET", `/api/collab/files/${encodeURIComponent(wbKey)}/shares`, H(viewer.token));
  assert(r.status === 200 && Array.isArray(r.json), "7b. Viewer boleh melihat daftar akses");

  // --- 8. Tanpa akses: REST 403 + socket join ditolak ---
  r = await api("GET", `/api/collab/files/${encodeURIComponent(wbKey)}/shares`, H(outsider.token));
  assert(r.status === 403, "8a. Tanpa akses: daftar share 403", `HTTP ${r.status}`);
  r = await api("PUT", "/api/collab/cells", H(outsider.token), { row_id: rowA, col_key: "jumlah", value: 1 });
  assert(r.status === 403, "8b. Tanpa akses: tulis sel 403", `HTTP ${r.status}`);
  const sockX = io(BASE, { path: "/socket.io", auth: { token: outsider.token } });
  const joinX = await new Promise((res) => sockX.emit("join-file", { workbook_key: wbKey }, res));
  assert(!joinX.ok, "8c. Tanpa akses: socket join ditolak", JSON.stringify(joinX));
  sockX.close();

  // --- 9. Validasi backend ---
  r = await api("PUT", "/api/collab/cells", HA, { row_id: rowA, col_key: "total", value: 5, base_versi: 4 });
  assert(r.status === 400, "9a. Kolom hitungan (total) ditolak 400", `HTTP ${r.status}`);
  r = await api("PUT", "/api/collab/cells", HA, { row_id: rowA, col_key: "status", value: "Ngawur", base_versi: 4 });
  assert(r.status === 400, "9b. Status invalid ditolak 400", `HTTP ${r.status}`);
  r = await api("PUT", "/api/collab/cells", HA, { row_id: 999999999, col_key: "nama", value: "x" });
  assert(r.status === 404, "9c. Baris tak ada 404", `HTTP ${r.status}`);

  // --- 10. Revisi: buat, daftar, pulihkan ---
  r = await api("POST", `/api/collab/sheets/${sheetId}/revisions`, HA, {});
  assert(r.status === 201 && r.json.versi_no === 1, "10a. Revisi v1 dibuat", `HTTP ${r.status}`);
  await api("PUT", "/api/collab/cells", HA, { row_id: rowA, col_key: "nama", value: "Berubah Setelah Revisi", base_versi: 4 });
  r = await api("GET", `/api/collab/sheets/${sheetId}/revisions`, H(editor.token));
  assert(r.status === 200 && r.json.length >= 1, "10b. Editor boleh membaca daftar revisi");
  const revId = r.json[r.json.length - 1].id;
  r = await api("POST", `/api/collab/revisions/${revId}/pulihkan`, HA, {});
  assert(r.status === 200, "10c. Pulihkan revisi", `HTTP ${r.status} ${JSON.stringify(r.json)}`);
  const check = await api("GET", "/api/data?page=1&perPage=100", HA);
  const restored = check.json.data.find((d) => d.id === rowA);
  assert(restored && restored.nama !== "Berubah Setelah Revisi", "10d. Nilai kembali ke revisi");

  sockA.close();
  sockB.close();
  console.log(failures === 0 ? "\nSEMUA UJI LULUS" : `\n${failures} UJI GAGAL`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
