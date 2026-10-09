/**
 * Uji rantai yang dipakai klien kolaborasi:
 * publish xlsx -> respons memuat kolom -> access -> spreadsheet data
 * (kode/id/versi untuk pemetaan baris lokal<->server).
 */
const ExcelJS = require("exceljs");
const BASE = "http://localhost:3000";

async function main() {
  let fail = 0;
  const ok = (c, l, x) => {
    console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? "  (" + x + ")" : ""}`);
    if (!c) fail++;
  };
  const login = await (
    await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "superadmin@sisnerling.local", password: "bbp6KvQXkqmA1!" }),
    })
  ).json();
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DataCoba");
  const tag = Date.now().toString(36).toUpperCase();
  ws.addRow(["Kode", "Nama", "Jumlah", "Harga", "Tanggal", "Status", "Keterangan"]);
  ws.addRow([`PUB-1-${tag}`, "Barang Satu", 5, 20000, "2026-10-01", "Masuk", "uji"]);
  ws.addRow([`PUB-2-${tag}`, "Barang Dua", 3, 15000, "2026-10-02", "Pending", ""]);
  const buf = await wb.xlsx.writeBuffer();
  const fname = `UjiKolab-${Date.now()}.xlsx`;

  const pub = await (
    await fetch(`${BASE}/api/import/workbook`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ base64: Buffer.from(buf).toString("base64"), filename: fname }),
    })
  ).json();
  ok(pub.sheets && pub.sheets.length === 1, "publish 1 sheet", JSON.stringify(pub).slice(0, 500));
  const sh = pub.sheets[0];
  ok(Array.isArray(sh.kolom) && sh.kolom.length >= 6, "respons memuat kolom", (sh.kolom || []).map((k) => `${k.label}=${k.key}`).join(","));
  ok(sh.kolom.some((k) => k.key === "kode"), "kolom memuat kunci kode");

  const stem = fname.replace(/\.[^.]+$/, "");
  const acc = await (await fetch(`${BASE}/api/collab/files/${encodeURIComponent(stem)}/access`, { headers: H })).json();
  ok(acc.read && acc.write, "akses super_admin penuh", JSON.stringify(acc));

  const data = await (await fetch(`${BASE}/api/spreadsheet/${sh.sheetId}/data`, { headers: H })).json();
  const kodes = (data.data || []).map((r) => r.kode);
  ok(kodes.includes(`PUB-1-${tag}`) && kodes.includes(`PUB-2-${tag}`), "data sheet memuat baris publish", kodes.join(","));
  const r1 = data.data.find((r) => r.kode === `PUB-1-${tag}`);
  ok(r1 && r1.id && Number(r1.jumlah) === 5, "baris PUB-1 utuh (id+jumlah)");

  // Tautan balik: daftar spreadsheet memuat sumber_file + kolom.
  const list = await (await fetch(`${BASE}/api/spreadsheet`, { headers: H })).json();
  const found = (Array.isArray(list) ? list : []).find((s) => s.id === sh.sheetId);
  ok(found && found.sumber_file === stem, "spreadsheet.sumber_file = stem", found && found.sumber_file);
  console.log(fail ? `${fail} GAGAL` : "SEMUA UJI PUBLISH LULUS");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
