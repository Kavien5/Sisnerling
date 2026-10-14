// Generator inventaris .md dari dua workbook sumber (F3 Hutan + F4 Mineral-Energi).
// Menghasilkan satu baris per variabel (baris logis) dengan kolom:
//   nama file | nama sheet | nama tabel | nama variabel | isian | rule pengisian
//   | tipe | akan direfer oleh rumus/file apa
// Tipe dipadatkan menjadi SATU nilai per variabel dengan prioritas:
//   formula tapi input manual  >  hasil formulasi  >  input manual
// Jalankan: node server/scripts/build-inventaris-md.js

const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const A = require("./lib/analyzer.js");
const { SEMANTIC, SPLITS, SPLIT_NAMES } = require("./lib/curation.js");

const OUT = path.join(__dirname, "..", "..", "_analisis", "inventaris-sisnerling.md");

const QUAL = /(\[(\d+)\])?(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_. ]*?))!\$?([A-Z]{1,3})\$?(\d{1,7})(?::\$?([A-Z]{1,3})\$?(\d{1,7}))?/g;
const BARE = /(?<![A-Za-z0-9_])(\$?[A-Z]{1,3}\$?\d{1,7})(?::(\$?[A-Z]{1,3}\$?\d{1,7}))?/g;

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}

function expandRefs(formula, sheetName) {
  const out = [];
  if (!formula) return out;
  let s = formula.replace(QUAL, (m, br, ext, q1, q2, c1, r1, c2, r2) => {
    if (ext || (q1 && q1[0] === "[")) return " ";
    const sh = (q1 || q2 || "").trim();
    if (!sh) return " ";
    const a = A.colNum(c1), b = r1 | 0;
    const a2 = c2 ? A.colNum(c2) : a, b2 = r2 ? r2 | 0 : b;
    if (Math.abs(a2 - a + 1) * Math.abs(b2 - b + 1) <= 4000) {
      for (let cc = Math.min(a, a2); cc <= Math.max(a, a2); cc++)
        for (let rr = Math.min(b, b2); rr <= Math.max(b, b2); rr++) out.push([sh, rr, cc]);
    } else out.push([sh, b, a], [sh, b2, a2]);
    return " ";
  });
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, " (");
  s.replace(BARE, (m, r1, r2) => {
    const g = (t) => {
      const mm = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/.exec(t);
      return mm ? [A.colNum(mm[1]), mm[2] | 0] : null;
    };
    const p1 = g(r1);
    if (!p1) return " ";
    const p2 = r2 ? g(r2) : p1;
    if (!p2) return " ";
    if ((Math.abs(p2[0] - p1[0]) + 1) * (Math.abs(p2[1] - p1[1]) + 1) <= 4000) {
      for (let cc = Math.min(p1[0], p2[0]); cc <= Math.max(p1[0], p2[0]); cc++)
        for (let rr = Math.min(p1[1], p2[1]); rr <= Math.max(p1[1], p2[1]); rr++) out.push([sheetName, rr, cc]);
    } else out.push([sheetName, p1[1], p1[0]], [sheetName, p2[1], p2[0]]);
    return " ";
  });
  return out;
}

function buildReverse(wb) {
  const rev = new Map();
  wb.eachSheet((ws) => {
    const { grid } = A.buildGrid(ws);
    for (const key of Object.keys(grid)) {
      const c = grid[key];
      let f = c.formula;
      if (c.kind === "formula" && f == null && c.master) f = A.masterFormula(grid, c.master);
      if (f == null) continue;
      for (const [sh, rr, cc] of expandRefs(f, ws.name)) {
        const k = sh + "!" + rr + "_" + cc;
        let set = rev.get(k);
        if (!set) { set = new Set(); rev.set(k, set); }
        set.add(ws.name + "!" + c.a1);
      }
    }
  });
  return rev;
}

function parseRange(range) {
  const mm = /^([A-Z]{1,3})(\d+)\.\.([A-Z]{1,3})(\d+)$/.exec(range || "");
  if (!mm) return null;
  const r = +mm[2];
  if (r !== +mm[4]) return null;
  return { row: r, c1: A.colNum(mm[1]), c2: A.colNum(mm[3]) };
}

function tipeTunggal(str) {
  if (str.includes("formula tapi input manual")) return "formula tapi input manual";
  if (str.includes("hasil formulasi")) return "hasil formulasi";
  return "input manual";
}

function incomingOf(rev, sheet, r, c1, c2) {
  const bySheet = new Map();
  const seen = new Set();
  for (let cc = c1; cc <= c2; cc++) {
    const set = rev.get(sheet + "!" + r + "_" + cc);
    if (!set) continue;
    for (const ref of set) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const sh = ref.slice(0, ref.indexOf("!"));
      bySheet.set(sh, (bySheet.get(sh) || 0) + 1);
    }
  }
  return bySheet;
}

function isianCell(r) {
  if (r.range === "(teks)") return `(teks) (n=${r.n})`;
  const s = `${r.range} (n=${r.n})`;
  return r.sample ? `${s} contoh: ${r.sample}` : s;
}

async function main() {
  const lines = [];
  lines.push("# Inventaris Lengkap Variabel Excel → Database");
  lines.push("");
  lines.push("> Sumber: `server/storage/templates/neraca-hutan.xlsx` (F3) dan `neraca-mineral-energi.xlsx` (F4).");
  lines.push("> Digenerate otomatis oleh `server/scripts/build-inventaris-md.js` (idempoten, jalankan ulang bila file sumber berubah).");
  lines.push("");
  lines.push(`Tanggal generate: ${new Date().toISOString().slice(0, 10)}.`);
  lines.push("");
  lines.push("## 0. Legenda kolom & tipe");
  lines.push("");
  lines.push("`nama file | nama sheet | nama tabel | nama variabel | isian | rule pengisian | tipe | akan direfer oleh rumus/file apa`");
  lines.push("");
  lines.push("| Tipe (satu nilai per variabel) | Arti | Perlakuan di website/DB |");
  lines.push("|---|---|---|");
  lines.push("| `input manual` | Diketik langsung; label/parameter; tidak ada rumus, atau rumus literal | Kolom input teks/angka |");
  lines.push("| `hasil formulasi` | Dihitung dari cell lain DI DALAM dua file ini (termasuk antar-sheet & shared formula) | Kolom generated / service hitung, JANGAN jadi input |");
  lines.push("| `formula tapi input manual` | Nilainya dari luar dua file ini (file/publikasi lain) walau ada rumus literal | Wajib jadi input manual / API impor di website |");
  lines.push("");
  lines.push("Kolom **Akan direfer oleh**: `<sheet (n sel)>` = sheet yang memakai variabel ini (downstream); setelah `->` = sheet KELUAR yang dirujuk variabel ini. `--` bila tidak ada.");
  lines.push("");

  const fileSummaries = [];
  const allSections = [];

  for (const f of A.FILES) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f.abs);
    const rev = buildReverse(wb);
    const fileRows = [];
    let idx = 0;

    for (const ws of wb.worksheets) {
      idx++;
      const { grid, maxR, maxC } = A.buildGrid(ws);
      const dim = maxR > 0 ? `A1:${colLetter(maxC)}${maxR}` : "kosong";
      const blks = SPLITS[ws.name] || A.blocks(grid, maxR, maxC);
      const rows = A.analyzeSheet(ws, SPLITS[ws.name]);
      const cur2 = SPLIT_NAMES[ws.name] || {};
      const names = SEMANTIC[ws.name] || {};

      const tableRows = [];
      const perBlok = [];
      const refKeluarAll = new Set();

      for (let bi = 0; bi < blks.length; bi++) {
        const [r1, r2] = blks[bi];
        const curated = cur2[r1] || names[r1];
        const name = (curated || "T" + (bi + 1)) + ` [R${r1}-R${r2}]`;
        const blockRows = rows.filter((r) => r.block === bi);
        let nIn = 0, nHasil = 0, nFim = 0;
        const refKeluarBlok = new Set();

        for (const r of blockRows) {
          const tipe = r.range === "(teks)" ? "input manual" : tipeTunggal(r.tipe);
          if (tipe === "hasil formulasi") nHasil++;
          else if (tipe === "formula tapi input manual") nFim++;
          else nIn++;
          r.otherSheets.forEach((s) => { refKeluarBlok.add(s); refKeluarAll.add(s); });

          const rg = parseRange(r.range);
          let incoming = "";
          if (rg) {
            const bySheet = incomingOf(rev, ws.name, rg.row, rg.c1, rg.c2);
            if (bySheet.size)
              incoming = [...bySheet.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([sh, c]) => `${sh} (${c} sel)`)
                .join(", ");
          }
          if (!incoming) incoming = "--";
          const keluar = r.otherSheets.length ? r.otherSheets.join(", ") : "";
          const refCol = keluar ? `${incoming} -> ${keluar}` : incoming;

          const rule = r.range === "(teks)"
            ? "tanpa rumus (nilai diketik)"
            : (r.rule.length ? r.rule.join("; ") : "tanpa rumus (nilai diketik)");
          const label = `${A.esc(r.label || "(kosong)")} \`R${r.row}\``;

          tableRows.push(
            `| ${A.esc(f.nama)} | ${A.esc(ws.name)} | ${A.esc(name)} | ${label} | ${A.esc(isianCell(r))} | ${A.esc(rule)} | ${tipe} | ${A.esc(refCol)} |`
          );
        }
        perBlok.push({ name, count: blockRows.length, nIn, nHasil, nFim, refKeluar: [...refKeluarBlok] });
      }

      fileRows.push({ sheet: ws.name, dim, blocks: blks.length, vars: tableRows.length, rows: tableRows, perBlok });

      allSections.push(`## ${f.code} -- ${f.nama}`);
      allSections.push("");
      allSections.push(`### ${f.code}.${idx} Sheet ${ws.name} (${dim}) -- ${tableRows.length} variabel`);
      allSections.push("");
      if (!tableRows.length) {
        allSections.push("_(tidak ada variabel/baris data)_");
        allSections.push("");
      } else {
        allSections.push("| Nama File | Nama Sheet | Nama Tabel | Nama Variabel | Isian | Rule Pengisian | Tipe | Akan direfer oleh rumus/file apa |");
        allSections.push("|---|---|---|---|---|---|---|---|");
        tableRows.forEach((l) => allSections.push(l));
        allSections.push("");
      }
    }

    fileSummaries.push({
      code: f.code, nama: f.nama,
      sheets: fileRows.length,
      vars: fileRows.reduce((s, x) => s + x.vars, 0),
      input: fileRows.reduce((s, x) => s + x.perBlok.reduce((a, b) => a + b.nIn, 0), 0),
      hasil: fileRows.reduce((s, x) => s + x.perBlok.reduce((a, b) => a + b.nHasil, 0), 0),
      fim: fileRows.reduce((s, x) => s + x.perBlok.reduce((a, b) => a + b.nFim, 0), 0),
      rows: fileRows,
    });
    console.log("DONE", f.code, "sheets:", fileRows.length, "vars:", fileSummaries[fileSummaries.length - 1].vars);
  }

  // Ringkasan
  const sum = [];
  sum.push("## 1. File sumber");
  sum.push("");
  sum.push("| Kode | Nama file | Jumlah sheet | Variabel | Input | Hasil formulasi | Formula tapi input manual |");
  sum.push("|---|---|---:|---:|---:|---:|---:|");
  for (const fs2 of fileSummaries)
    sum.push(`| ${fs2.code} | ${A.esc(fs2.nama)} | ${fs2.sheets} | ${fs2.vars} | ${fs2.input} | ${fs2.hasil} | ${fs2.fim} |`);
  const tot = fileSummaries.reduce((a, x) => ({ v: a.v + x.vars, i: a.i + x.input, h: a.h + x.hasil, f: a.f + x.fim }), { v: 0, i: 0, h: 0, f: 0 });
  sum.push(`| **TOTAL** |  | **${fileSummaries.reduce((a, x) => a + x.sheets, 0)}** | **${tot.v}** | **${tot.i}** | **${tot.h}** | **${tot.f}** |`);
  sum.push("");
  sum.push("## 2. Ringkasan sheet → blok tabel logis");
  sum.push("");
  sum.push("| File | Sheet | Dimensi | Blok tabel | Variabel | Input | Hasil formulasi | FIM | Refer keluar |");
  sum.push("|---|---|---|---:|---:|---:|---:|---:|---|");
  for (const fs2 of fileSummaries)
    for (const r of fs2.rows) {
      const nIn = r.perBlok.reduce((a, b) => a + b.nIn, 0);
      const nHasil = r.perBlok.reduce((a, b) => a + b.nHasil, 0);
      const nFim = r.perBlok.reduce((a, b) => a + b.nFim, 0);
      const keluar = [...new Set(r.perBlok.flatMap((b) => b.refKeluar))];
      sum.push(`| ${fs2.code} | ${A.esc(r.sheet)} | ${r.dim} | ${r.blocks} | ${r.vars} | ${nIn} | ${nHasil} | ${nFim} | ${A.esc(keluar.join(", ") || "--")} |`);
    }
  sum.push("");

  const out = [
    ...lines,
    ...sum,
    ...allSections,
  ].join("\n");
  fs.writeFileSync(OUT, out, "utf8");
  const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(0);
  console.log(`WROTE ${OUT} (${kb} KB)  TOTAL variabel: ${tot.v} (input ${tot.i}, hasil ${tot.h}, FIM ${tot.f})`);
}

main().catch((e) => { console.error("ERR", e.stack || e.message); process.exit(1); });
