/**
 * Uji anti-duplikasi sheet pada rantai import/publish.
 *
 * Skenario:
 *   1. Buat file 12 sheet (termasuk "READ ME").
 *   2. POST /api/files (import) 2x  -> jumlah sheet HARUS tetap 12.
 *   3. POST /api/import/workbook (publish) 2x -> baris spreadsheet utk file
 *      tsb HARUS tetap 12 (tidak jadi 24/36), tidak ada nama "(2)".
 *   4. Bandingkan daftar sheet workbook vs daftar spreadsheet (harus sama).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const ExcelJS = require("exceljs");
const BASE = process.env.BASE || "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL || "sa@mail.com";
const PASS = process.env.E2E_PASS || "sa123";

function assert(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
}

const SHEETS = [
  "READ ME",
  "PDB ADHB",
  "Penyusutan",
  "SUT (Rasio Penyediaan)",
  "Penyediaan",
  "Stok Kapital",
  "Aset Moneter",
  "Neraca Terpadu",
  "PDB vs PDN1",
  "Studi PDB",
  "Penduduk",
  "National Wealth",
];

async function makeWorkbook() {
  const wb = new ExcelJS.Workbook();
  SHEETS.forEach((name, i) => {
    const ws = wb.addWorksheet(name);
    ws.getCell("A1").value = `Judul ${name}`;
    ws.getCell("A2").value = "Kode";
    ws.getCell("B2").value = "Nama";
    ws.getCell("C2").value = "Nilai";
    ws.getCell("A3").value = `K${i}`;
    ws.getCell("B3").value = `Baris ${name}`;
    ws.getCell("C3").value = (i + 1) * 10;
  });
  const p = path.join(os.tmpdir(), `uji-dup-${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(p);
  return p;
}

async function main() {
  const xlsxPath = await makeWorkbook();
  const base64 = fs.readFileSync(xlsxPath).toString("base64");
  const fileName = `UJI DUP ${Date.now()}.xlsx`;
  const stem = fileName.replace(/\.[^.]+$/, "");

  const lr = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const login = await lr.json();
  if (!lr.ok || !login.token) {
    console.error("Login gagal:", JSON.stringify(login));
    process.exit(1);
  }
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` };
  console.log("Login OK:", login.user.email, "\n");

  let code = null;
  let createdSpreadsheetIds = [];

  try {
    // --- Import 2x via POST /api/files ---
    for (let n = 1; n <= 2; n++) {
      const r = await fetch(`${BASE}/api/files`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ base64, fileName }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`import #${n} gagal: ${JSON.stringify(j)}`);
      code = j.workbookCode;
      assert(j.jumlahSheet === 12, `import #${n}: jumlah sheet dilaporkan = 12 (dapat ${j.jumlahSheet})`);
    }

    const list = await (await fetch(`${BASE}/api/files`, { headers: H })).json();
    const wf = list.find((f) => f.workbookCode === code);
    assert(!!wf, "GET /api/files memuat workbook");
    assert(wf && wf.sheets.filter((s) => s.status !== "hilang").length === 12,
      `GET /api/files: sheet aktif = 12 (dapat ${wf ? wf.sheets.filter((s) => s.status !== "hilang").length : "?"})`);
    const dupWorkbooks = list.filter((f) => String(f.fileName || "").replace(/\.[^.]+$/, "") === stem).length;
    assert(dupWorkbooks === 1, `tidak ada workbook duplikat utk file (dapat ${dupWorkbooks})`);

    // --- Publish 2x via POST /api/import/workbook ---
    for (let n = 1; n <= 2; n++) {
      const r = await fetch(`${BASE}/api/import/workbook`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ base64, filename: fileName }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`publish #${n} gagal: ${JSON.stringify(j)}`);
    }

    const sp = await (await fetch(`${BASE}/api/spreadsheet`, { headers: H })).json();
    const rows = sp.filter((r) => String(r.sumber_file || "") === stem);
    createdSpreadsheetIds = rows.map((r) => r.id);
    assert(rows.length === 12, `setelah publish 2x: baris spreadsheet utk file = 12 (dapat ${rows.length})`);
    const names = rows.map((r) => String(r.nama || "")).sort();
    const expect = SHEETS.map((s) => `${stem}@${s}`).sort();
    assert(JSON.stringify(names) === JSON.stringify(expect),
      `nama sheet spreadsheet sama persis dgn Excel (tanpa "(2)")`);
    const withSuffix = rows.filter((r) => /\(\d+\)\s*$/.test(String(r.nama || "")));
    assert(withSuffix.length === 0, `tidak ada nama berakhiran "(2)" (dapat ${withSuffix.length})`);

    // --- workbook_sheets vs spreadsheet utk workbook ini ---
    const wf2 = (await (await fetch(`${BASE}/api/files`, { headers: H })).json())
      .find((f) => f.workbookCode === code);
    const active = wf2 ? wf2.sheets.filter((s) => s.status !== "hilang") : [];
    assert(active.length === rows.length,
      `jumlah sheet workbook (${active.length}) == jumlah baris spreadsheet (${rows.length})`);

    console.log(`\nINFO workbook_code=${code} stem="${stem}"`);

    // --- Re-import file DENGAN JUMLAH SHEET LEBIH SEDIKIT ---
    // Sheet sisa tidak boleh tetap 'aktif' (kalau tidak, tampak seperti duplikat).
    const wbSmall = new ExcelJS.Workbook();
    ["READ ME", "PDB ADHB", "Penyusutan"].forEach((name) => {
      const ws = wbSmall.addWorksheet(name);
      ws.getCell("A1").value = `Judul ${name}`;
    });
    const smallPath = path.join(os.tmpdir(), `uji-dup-small-${Date.now()}.xlsx`);
    await wbSmall.xlsx.writeFile(smallPath);
    const smallB64 = fs.readFileSync(smallPath).toString("base64");
    const rr = await fetch(`${BASE}/api/files`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ base64: smallB64, fileName }),
    });
    const rj = await rr.json();
    if (!rr.ok) throw new Error(`re-import kecil gagal: ${JSON.stringify(rj)}`);
    const wf3 = (await (await fetch(`${BASE}/api/files`, { headers: H })).json())
      .find((f) => f.workbookCode === code);
    assert(wf3 && wf3.sheets.length === 3,
      `re-import 3 sheet: sheet aktif = 3, sisa diarsipkan bukan diduplikasi (dapat ${wf3 ? wf3.sheets.length : "?"})`);
  } finally {
    console.log("\nCleanup…");
    if (code) {
      await fetch(`${BASE}/api/files/${code}`, { method: "DELETE", headers: H }).catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});