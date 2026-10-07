/**
 * Uji persistensi lintas restart backend.
 *
 * Men导入 file, me-restart server (proses baru, cache kosong), lalu memastikan
 * file & workbook asli masih terbaca. Ini meniru restart komputer/server.
 */
const fs = require("fs");
const BASE = "http://localhost:3000";
const XLSX = "C:/Users/Asus/AppData/Local/Temp/opencode/uji.xlsx";
const ExcelJS = require("exceljs");

function assert(c, label) {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}`);
  if (!c) process.exitCode = 1;
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SEED_SUPER_ADMIN_EMAIL,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    }),
  });
  const j = await r.json();
  if (!j.token) throw new Error("login gagal: " + JSON.stringify(j));
  return j.token;
}

async function main() {
  const phase = process.argv[2];
  const H0 = { "Content-Type": "application/json" };

  if (phase === "before") {
    const token = await login();
    const H = { ...H0, Authorization: `Bearer ${token}` };
    const up = await (
      await fetch(`${BASE}/api/files`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({
          base64: fs.readFileSync(XLSX).toString("base64"),
          fileName: "restart-test.xlsx",
        }),
      })
    ).json();
    console.log(JSON.stringify({ workbookCode: up.workbookCode }));
    fs.writeFileSync(
      "C:/Users/Asus/AppData/Local/Temp/opencode/_restart_code.txt",
      up.workbookCode
    );
    assert(!!up.workbookCode, "SEBELUM restart: file diimport");
    return;
  }

  if (phase === "after") {
    const code = fs
      .readFileSync("C:/Users/Asus/AppData/Local/Temp/opencode/_restart_code.txt", "utf8")
      .trim();
    const token = await login();
    const H = { ...H0, Authorization: `Bearer ${token}` };

    // Login ulang dari nol = simulasi logout → login.
    const list = await (await fetch(`${BASE}/api/files`, { headers: H })).json();
    const f = list.find((x) => x.workbookCode === code);
    assert(!!f, `SESUDAH restart: ${code} masih ada di GET /api/files`);
    assert(f && f.sheets.length === 2, "   2 sheet masih terdaftar");
    assert(f && f.punyaFile === true, "   byte file masih di disk");

    const c = await (await fetch(`${BASE}/api/files/${code}/content`, { headers: H })).json();
    assert(!!c.base64, "   workbook asli bisa diambil ulang");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(c.base64, "base64"));
    const a = wb.getWorksheet("Sheet Alpha");
    assert(wb.worksheets.length === 2, "   workbook asli: 2 sheet");
    assert(!!a, '   sheet asli "Sheet Alpha" tersedia');
    assert(a.getCell("C3").value.formula === "C2*2", "   formula antar sel utuh");
    assert(a.getCell("A5").value === "CATATAN BERSAMA", "   merge utuh");

    await fetch(`${BASE}/api/files/${code}`, { method: "DELETE", headers: H });
    console.log("   (file test dihapus)");
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});