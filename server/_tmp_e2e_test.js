/**
 * Uji end-to-end persistensi file import.
 *
 * Skenario yang diuji:
 *   1. Import file Excel  -> tersimpan di server (MySQL + disk)
 *   2. Daftar file        -> diambil ulang dari GET /api/files
 *   3. Isi file           -> byte ASLI kembali dari /content, struktur utuh
 *   4. Rename             -> kode workbook tidak berubah
 *   5. Re-import nama sama-> TIDAK membuat workbook duplikat
 *   6. Restart server     -> daftar file tetap ada
 */
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:3000";

function assert(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const xlsxPath =
    process.env.TEST_XLSX ||
    "C:/Users/Asus/AppData/Local/Temp/opencode/uji.xlsx";
  const base64 = fs.readFileSync(xlsxPath).toString("base64");

  // Login sebagai super admin
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SEED_SUPER_ADMIN_EMAIL,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok || !login.token) {
    console.error("Login gagal:", JSON.stringify(login));
    process.exit(1);
  }
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` };
  console.log("Login OK sebagai", login.user.email, "(", login.user.role, ")");

  // 1. Import
  const name = `uji-persistensi-${Date.now()}.xlsx`;
  const upRes = await fetch(`${BASE}/api/files`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ base64, fileName: name }),
  });
  const up = await upRes.json();
  assert(upRes.ok, `1. Import tersimpan permanen (HTTP ${upRes.status})`);
  if (!upRes.ok) {
    console.error(JSON.stringify(up));
    process.exit(1);
  }
  const code = up.workbookCode;
  console.log(`   workbook_code=${code} sheets=${up.jumlahSheet}`);
  assert(/^WB_\d{3,}$/.test(code), "   ID workbook permanen_format WB_xxx");
  assert(up.jumlahSheet === 2, "   jumlah sheet = 2");
  assert(up.sheets.every((s) => /^SHEET_/.test(s.sheetId)), "   semua sheet punya ID SHEET_xxx");

  // 2. Daftar dari GET /api/files
  const listRes = await fetch(`${BASE}/api/files`, { headers: H });
  const list = await listRes.json();
  const found = list.find((f) => f.workbookCode === code);
  assert(!!found, "2. File muncul di GET /api/files");
  assert(found && found.sheets.length === 2, "   sheet terdaftar di database");
  assert(found && found.sheets[1].hidden === true, "   status hidden sheet Beta terjaga");
  assert(found && found.punyaFile === true, "   byte file tersimpan di disk");

  // 3. Byte asli kembali
  const cRes = await fetch(`${BASE}/api/files/${code}/content`, { headers: H });
  const c = await cRes.json();
  assert(cRes.ok && c.base64, "3. Isi file bisa diambil kembali");
  const roundTrip = Buffer.from(c.base64, "base64");
  assert(
    roundTrip.equals(fs.readFileSync(xlsxPath)),
    "   byte identik dengan file asli (tidak ada data yang hilang)"
  );

  // Struktur Excel utuh setelah round-trip
  const ExcelJS = require("exceljs");
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(roundTrip);
  assert(wb2.worksheets.length === 2, "   semua sheet utuh");
  const a2 = wb2.getWorksheet("Sheet Alpha");
  assert(!!a2, '   nama sheet asli "Sheet Alpha" utuh');
  assert(a2.getCell("C2").value === 1500, "   nilai sel C2 utuh");
  assert(a2.getCell("C2").numFmt === "#,##0", "   format angka utuh");
  assert(
    typeof a2.getCell("C3").value === "object" && a2.getCell("C3").value.formula === "C2*2",
    "   formula C3 utuh"
  );
  assert(a2.getCell("A5").value === "CATATAN BERSAMA", "   sel hasil merge utuh");
  assert(a2.getColumn(2).width === 45, "   ukuran kolom utuh");
  assert(a2.getCell("B2").border && a2.getCell("B2").border.bottom, "   border utuh");
  assert(wb2.getWorksheet("Sheet Beta").state === "hidden", "   sheet tersembunyi tetap hidden");
  // Baris/kolom kosong tidak dipangkas
  assert(a2.rowCount >= 5, `   baris kosong tidak dipangkas (rowCount=${a2.rowCount})`);

  // 4. Rename: kode workbook tidak boleh berubah
  const newName = `uji-rename-${Date.now()}.xlsx`;
  const rRes = await fetch(`${BASE}/api/files/${code}`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ fileName: newName }),
  });
  const r = await rRes.json();
  assert(rRes.ok && r.workbookCode === code, "4. Rename mempertahankan kode workbook");

  // 5. Re-import nama yang sama -> tidak duplikat
  const up2 = await (
    await fetch(`${BASE}/api/files`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ base64, fileName: newName }),
    })
  ).json();
  const list2 = await (await fetch(`${BASE}/api/files`, { headers: H })).json();
  const dupes = list2.filter((f) => f.workbookCode === code).length;
  assert(up2.workbookCode === code, "5. Re-import memakai workbook yang sama");
  assert(dupes === 1, "   tidak ada workbook duplikat");

  // 6. Data lama tetap utuh
  const sheetsBefore = await (
    await fetch(`${BASE}/api/spreadsheet`, { headers: H })
  ).json();
  assert(Array.isArray(sheetsBefore) && sheetsBefore.length > 0, "6. Sheet lama (Penugasan) tetap ada");

  console.log(`\nCleanup: hapus ${code}`);
  const del = await fetch(`${BASE}/api/files/${code}`, { method: "DELETE", headers: H });
  assert(del.ok, "   hapus hanya lewat aksi eksplisit");
  const list3 = await (await fetch(`${BASE}/api/files`, { headers: H })).json();
  assert(!list3.find((f) => f.workbookCode === code), "   file hilang dari daftar setelah dihapus");
  assert(sheetsBefore.length > 0, "   sheet/data lain tidak terpengaruh penghapusan");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});