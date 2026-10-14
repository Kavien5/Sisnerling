// Fase 1 Task 3: isi katalog inventaris logis + backfill nilai dari workbook.
// Sumber: server/scripts/lib/analyzer.js + curation.js (kurasi batch-2).
// Idempoten: men-truncate tabel inventaris_* lalu isi ulang.
// Cakupan: F3 (Hutan) + F4 (Mineral & Energi). F1/F2 (batch-1) menyusul.

const path = require("path");
const ExcelJS = require("exceljs");
const dbm = require(path.join(__dirname, "..", "db.js"));
const A = require("./lib/analyzer.js");
const { SEMANTIC, SPLITS, SPLIT_NAMES } = require("./lib/curation.js");

const QUAL = /(\[(\d+)\])?(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_. ]*?))!\$?([A-Z]{1,3})\$?(\d{1,7})(?::\$?([A-Z]{1,3})\$?(\d{1,7}))?/g;
const BARE = /(?<![A-Za-z0-9_])(\$?[A-Z]{1,3}\$?\d{1,7})(?::(\$?[A-Z]{1,3}\$?\d{1,7}))?/g;

function expandRefs(formula, sheetName) {
  const out = [];
  if (!formula) return out;
  let s = formula.replace(QUAL, (m, br, ext, q1, q2, c1, r1, c2, r2) => {
    if (ext || (q1 && q1[0] === "[")) return " ";
    const sh = (q1 || q2 || "").trim();
    if (!sh) return " ";
    const a = A.colNum(c1), b = r1 | 0;
    const a2 = c2 ? A.colNum(c2) : a, b2 = r2 ? r2 | 0 : b;
    if ((Math.abs((a2 - a) + 1) * Math.abs((b2 - b) + 1)) <= 4000) {
      for (let cc = Math.min(a, a2); cc <= Math.max(a, a2); cc++) for (let rr = Math.min(b, b2); rr <= Math.max(b, b2); rr++) out.push([sh, rr, cc]);
    } else out.push([sh, b, a], [sh, b2, a2]);
    return " ";
  });
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, " (");
  s.replace(BARE, (m, r1, r2) => {
    const g = (t) => { const mm = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/.exec(t); return mm ? [A.colNum(mm[1]), mm[2] | 0] : null; };
    const p1 = g(r1); if (!p1) return " ";
    const p2 = r2 ? g(r2) : p1; if (!p2) return " ";
    if ((Math.abs(p2[0] - p1[0]) + 1) * (Math.abs(p2[1] - p1[1]) + 1) <= 4000) {
      for (let cc = Math.min(p1[0], p2[0]); cc <= Math.max(p1[0], p2[0]); cc++) for (let rr = Math.min(p1[1], p2[1]); rr <= Math.max(p1[1], p2[1]); rr++) out.push([sheetName, rr, cc]);
    } else out.push([sheetName, p1[1], p1[0]], [sheetName, p2[1], p2[0]]);
    return " ";
  });
  return out;
}

function buildReverse(wb) {
  const rev = new Map();
  wb.eachSheet((ws) => {
    const { grid, maxR, maxC } = A.buildGrid(ws);
    for (const key of Object.keys(grid)) {
      const c = grid[key];
      let formula = c.formula;
      if (c.kind === "formula" && formula == null && c.master) formula = A.masterFormula(grid, c.master);
      if (formula == null) continue;
      for (const [sh, rr, cc] of expandRefs(formula, ws.name)) {
        const k = sh + "!" + rr + "_" + cc;
        let set = rev.get(k);
        if (!set) { set = new Set(); rev.set(k, set); }
        set.add(ws.name + "!" + c.a1);
      }
    }
  });
  return rev;
}

const YEAR_RE = /^((?:19|20)\d{2})(\*+)?$/;
function parseYear(v) {
  const t = String(v == null ? "" : v).trim();
  const m = YEAR_RE.exec(t);
  return m ? { y: +m[1], label: t, status: m[2] ? (m[2].length === 1 ? "sementara" : "sangat_sementara") : "tetap" } : null;
}

function sheetYearMap(grid, maxC) {
  const rows = [];
  for (let r = 1; r <= 14; r++) {
    let count = 0;
    const sel = {};
    for (let c = 1; c <= maxC; c++) {
      const cc = grid[r + "," + c];
      const year = parseYear(cc && cc.result != null ? cc.result : (cc ? cc.text : null));
      if (year) { sel[c] = year; count++; }
    }
    if (count >= 2) rows.push({ r, count, sel });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows.length ? rows[0].sel : {};
}

function blockMeta(grid, r1, r2, maxC, yearMap) {
  const colm = {};
  for (let c = 1; c <= maxC; c++) {
    let filled = 0, numeric = 0, text = 0;
    for (let r = r1; r <= r2; r++) {
      const cc = grid[r + "," + c];
      if (!cc) continue;
      filled++;
      if (A.isNumLike(cc)) numeric++;
      if (A.isTexty(cc)) text++;
    }
    colm[c] = { filled, numeric, text };
  }
  let firstTextCol = maxC + 1;
  for (let c = 1; c <= maxC; c++) if (colm[c].text >= 2) { firstTextCol = c; break; }
  const numbering = [];
  if (firstTextCol <= maxC) {
    for (let c = 1; c < firstTextCol; c++) { const m = colm[c]; if (m.numeric >= 2 && m.numeric >= m.text) numbering.push(c); }
  }
  let dataCols = [];
  for (let c = 1; c <= maxC; c++) {
    if (numbering.includes(c)) continue;
    const m = colm[c];
    if (m.filled >= 2 && m.numeric >= 2 && m.numeric >= m.text) dataCols.push(c);
  }
  if (!dataCols.length) {
    for (let c = 1; c <= maxC; c++) { if (numbering.includes(c)) continue; if (colm[c].numeric >= 1) dataCols.push(c); }
  }
  const allText = dataCols.length === 0;
  let axis = "tunggal", c1 = null, c2 = null, tc1 = null, tc2 = null;
  if (allText) {
    axis = "teks";
  } else {
    c1 = dataCols[0]; c2 = dataCols[dataCols.length - 1];
    const years = dataCols.map((c) => yearMap[c]).filter(Boolean);
    if (years.length) {
      axis = "tahun";
      tc1 = Math.min(...years.map((y) => y.y));
      tc2 = Math.max(...years.map((y) => y.y));
    }
  }
  return { allText, dataCols, c1, c2, axis, tc1, tc2 };
}

function encodeValue(c) {
  if (c == null) return null;
  let r = c.result;
  if (r === undefined) r = c.text;
  if (r instanceof Date) return { $date: r.toISOString() };
  if (typeof r === "number") return { num: r };
  const s = r == null ? "" : String(r);
  if (s === "") return null;
  if (c.kind === "bool") return { bool: r };
  return { txt: s };
}

function tipeOf(str) {
  if (str.includes("formula tapi input manual")) return "formula_tapi_input_manual";
  if (str.includes("hasil formulasi")) return "hasil_formulasi";
  return "input_manual";
}

const PERAN = {
  F3: {
    primary: ["Jati Jawa", "Rimba Jawa", "Rimba Luar Jawa", "Indonesia", "Rekap Hutan Indonesia"],
    parameter: ["Data Penunjang"],
    induk: ["Rekap Hutan Indonesia", "Hutan Indonesia"],
  },
  F4: {
    primary: ["Oil", "Gas", "Coal", "Gold", "Silver", "Copper", "Tin", "Nickel", "Bauxite"],
    parameter: ["Lakin", "Conversion Factor", "Harga Acuan", "Bond"],
    dokumentasi: ["Home", "Notes"],
  },
};

function parseRange(range) {
  const mm = /^([A-Z]{1,3})(\d+)\.\.([A-Z]{1,3})(\d+)$/.exec(range || "");
  if (!mm) return null;
  const r = +mm[2];
  if (r !== +mm[4]) return null;
  return { row: r, c1: A.colNum(mm[1]), c2: A.colNum(mm[3]) };
}

async function main() {
  await dbm.initDatabase();
  const pool = dbm.pool;
  console.log("Schema applied. Truncating inventory tables...");
  await pool.query("SET FOREIGN_KEY_CHECKS=0");
  for (const t of ["nilai_variabel_revisi", "nilai_variabel", "inventaris_cell_map", "inventaris_dependensi", "inventaris_variabel", "inventaris_tabel", "inventaris_sheet", "inventaris_file", "dim_tahun"]) {
    await pool.query("TRUNCATE TABLE ??", [t]);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS=1");

  let fileSeq = 0, sheetSeq = 0, tabelSeq = 0, varSeq = 0;
  const sheetIdsByName = {};
  const cellVar = new Map(); // `sh|r|c` -> varSeq (per file, dibersihkan antar file)

  const INSERT = async (table, cols, rows, chunk = 400) => {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      const qmarks = part.map((r) => "(" + r.map(() => "?").join(",") + ")").join(",");
      await pool.query(`INSERT INTO ${table} (${cols}) VALUES ${qmarks}`, [].concat(...part));
    }
  };

  for (const f of A.FILES) {
    console.log("PROCESS", f.code, f.nama);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f.abs);
    const rev = buildReverse(wb);
    fileSeq++;
    const wkey = { F3: "sisnerling-statistical:neraca-hutan", F4: "sisnerling-statistical:neraca-mineral-energi" }[f.code];
    await INSERT("inventaris_file", "id,kode,nama,workbook_key,source_file,urutan", [[fileSeq, f.code, f.nama, wkey, f.abs, fileSeq]]);

    for (const ws of wb.worksheets) {
      const { grid, maxR, maxC } = A.buildGrid(ws);
      const yearMap = sheetYearMap(grid, maxC);
      const blks = SPLITS[ws.name] || A.blocks(grid, maxR, maxC);
      const rows = A.analyzeSheet(ws, SPLITS[ws.name]);
      sheetSeq++;
      sheetIdsByName[ws.name] = sheetSeq;
      const pSet = PERAN[f.code] || {};
      const peran = Object.keys(pSet).find((k) => pSet[k].includes(ws.name)) || null;
      await INSERT("inventaris_sheet", "id,file_id,nama,urutan,peran,stat_sheet_id", [[sheetSeq, fileSeq, ws.name, ws.id, peran, ws.id]]);

      const splitCustom = !!SPLITS[ws.name];
      const perTabel = [];
      const cellBatch = [];
      const cur2 = SPLIT_NAMES[ws.name] || {};
      const names = SEMANTIC[ws.name] || {};

      for (let bi = 0; bi < blks.length; bi++) {
        const [r1, r2] = blks[bi];
        const meta = blockMeta(grid, r1, r2, maxC, yearMap);
        const blockRows = rows.filter((r) => r.block === bi);
        const curated = splitCustom ? cur2[r1] : names[r1];
        const name = curated || "T" + (bi + 1) + " (R" + r1 + "-R" + r2 + ")";
        const sv = curated ? "kurasi" : "otomatis";
        const jenis = meta.allText ? "teks" : (name.toLowerCase().includes("helper") ? "helper" : "data");
        const nCell = blockRows.reduce((s, r) => s + r.n, 0);
        tabelSeq++;
        await INSERT("inventaris_tabel", "id,sheet_id,blok_no,nama,r1,r2,c1,c2,axis,tahun_c1,tahun_c2,jenis,n_cell", [[tabelSeq, sheetSeq, bi + 1, name, r1, r2, meta.c1, meta.c2, meta.axis, meta.tc1, meta.tc2, jenis, nCell]]);

        for (const r of blockRows) {
          varSeq++;
          const tipe = tipeOf(r.tipe);
          const jnv = r.range === "(teks)" ? "teks" : "angka";
          const label = String(r.label || "(kosong)").slice(0, 255);
          await INSERT("inventaris_variabel",
            "id,tabel_id,row_no,nama,jenis_nilai,tipe,n_sel,isian_sample,rule_pengisian,refer_keluar,status_verifikasi",
            [[varSeq, tabelSeq, r.row, label, jnv, tipe, r.n, r.sample, (r.rule.length ? r.rule.join("; ") : null), (r.otherSheets.length ? JSON.stringify(r.otherSheets) : null), sv]]);

          const rg = parseRange(r.range);
          if (!rg) continue;
          for (let cc = rg.c1; cc <= rg.c2; cc++) {
            cellVar.set(ws.name + "|" + rg.row + "|" + cc, varSeq);
            cellBatch.push([varSeq, sheetSeq, rg.row, cc, "data"]);
          }
        }
      }
      await INSERT("inventaris_cell_map", "variabel_id,sheet_id,row_no,col_no,pos", cellBatch);
    }
    console.log("  vars so far:", varSeq, "| cells:", cellVar.size);

    // Dependensi (per file: rev dikaitkan ke variabel via cellVar)
    const depBatches = [];
    const depSeen = new Set();
    const direfer = new Map();
    for (const [key, varSeq2] of cellVar) {
      const [sh, rr, cc] = key.split("|");
      const k = sh + "!" + rr + "_" + cc;
      const set = rev.get(k);
      if (!set) continue;
      for (const ref of set) {
        const m = /^([^!]+)!(?:'?)([A-Z]{1,3})(\d+)$/.exec(ref.replace(/'/g, ""));
        if (!m) continue;
        const refSh = m[1];
        const toVar = cellVar.get(refSh + "|" + m[3] + "|" + A.colNum(m[2]));
        if (toVar && toVar !== varSeq2) {
          const dk = varSeq2 + "|" + toVar + "|" + refSh + "!" + m[2] + m[3];
          if (depSeen.has(dk)) continue;
          depSeen.add(dk);
          depBatches.push([varSeq2, toVar, refSh + "!" + m[2] + m[3]]);
          direfer.set(varSeq2, (direfer.get(varSeq2) || 0) + 1);
        }
      }
    }
    if (depBatches.length) {
      await INSERT("inventaris_dependensi", "dari_variabel_id,ke_variabel_id,src_cell,via_rule", depBatches.map((d) => [d[0], d[1], d[2], 1]));
    }
    if (direfer.size) {
      const ids = [...direfer.keys()];
      const cases = ids.map((id) => `WHEN ${id} THEN ${direfer.get(id)}`).join(" ");
      await pool.query(`UPDATE inventaris_variabel SET sel_direfer = CASE id ${cases} END WHERE id IN (${ids.join(",")})`);
    }
    cellVar.clear();
  }

  // ---- Backfill nilai per sel (grid) ----
  console.log("Backfill nilai...");
  const nilaiBatch = [];
  let nilaiCount = 0;
  const readSel = new Map(); // sh|r|c -> {sheetId,varId}
  const [cm] = await pool.query(`SELECT cm.variabel_id, s.nama AS sh, cm.row_no, cm.col_no FROM inventaris_cell_map cm JOIN inventaris_sheet s ON s.id = cm.sheet_id`);
  for (const r of cm) readSel.set(r.sh + "|" + r.row_no + "|" + r.col_no, r.variabel_id);

  for (const f of A.FILES) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f.abs);
    const sheetYear = {};
    for (const ws of wb.worksheets) {
      const { grid, maxR, maxC } = A.buildGrid(ws);
      sheetYear[ws.name] = sheetYearMap(grid, maxC);
    }
    for (const ws of wb.worksheets) {
      const ym = sheetYear[ws.name];
      const { grid } = A.buildGrid(ws);
      for (const key of Object.keys(grid)) {
        const varId = readSel.get(ws.name + "|" + key.replace(",", "|"));
        if (varId == null) continue;
        const c = grid[key];
        const v = encodeValue(c);
        if (v == null) continue;
        const rowNo = c.row, colNo = c.col;
        const yr = ym[colNo] || null;
        const statusA = yr ? yr.status : null;
        const tahunLabel = yr ? yr.label : null;
        const num = typeof v.num === "number" ? v.num : null;
        nilaiCount++;
        nilaiBatch.push([varId, yr ? yr.y : null, null, tahunLabel, statusA, null, JSON.stringify(v), num, null, null, 1]);
        if (nilaiBatch.length >= 1000) { await INSERT("nilai_variabel", "variabel_id,tahun,periode,tahun_label,status_angka,pos,nilai,nilai_num,satuan,sumber,hasil_final", nilaiBatch); nilaiBatch.length = 0; }
      }
    }
  }
  if (nilaiBatch.length) await INSERT("nilai_variabel", "variabel_id,tahun,periode,tahun_label,status_angka,pos,nilai,nilai_num,satuan,sumber,hasil_final", nilaiBatch);

  // dim_tahun
  const dimRows = [];
  for (let y = 1990; y <= 2024; y++) dimRows.push([y, String(y), "tetap"]);
  await INSERT("dim_tahun", "tahun,tahun_label,status", dimRows);

  const stats = {};
  await pool.query("SELECT tipe, COUNT(*) c FROM inventaris_variabel GROUP BY tipe").then(([r]) => { r.forEach((x) => (stats[x.tipe] = x.c)); });
  const [nVar] = await pool.query("SELECT COUNT(*) c FROM inventaris_variabel");
  const [nTbl] = await pool.query("SELECT COUNT(*) c FROM inventaris_tabel");
  const [nCell] = await pool.query("SELECT COUNT(*) c FROM inventaris_cell_map");
  const [nDep] = await pool.query("SELECT COUNT(*) c FROM inventaris_dependensi");
  const [nNilai] = await pool.query("SELECT COUNT(*) c FROM nilai_variabel");
  console.log("DONE");
  console.log("  inventaris_variabel:", nVar[0].c, JSON.stringify(stats));
  console.log("  inventaris_tabel:", nTbl[0].c, "| inventaris_cell_map:", nCell[0].c, "| dependensi:", nDep[0].c, "| nilai_variabel:", nNilai[0].c);
  process.exit(0);
}

main().catch((e) => { console.error("ERR", e.stack || e.message); process.exit(1); });