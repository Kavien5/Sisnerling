const fs = require("fs");
const path = require("path");
const express = require("express");
const { logAudit } = require("./auditLog");
const ExcelJS = require("exceljs");

const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = process.env.NERACA_STATE_FILE
  ? path.resolve(process.env.NERACA_STATE_FILE)
  : path.join(DATA_DIR, "neraca_hutan.json");
const REGIONAL_SHEETS = ["Jati Jawa", "Rimba Jawa", "Rimba Luar Jawa"];

// Teks label dari sel Excel: mendukung string, angka, richText, hyperlink, dan
// hasil formula. String() biasa akan menghasilkan "[object Object]" untuk sel
// berformat (mis. label "NPV per stok akhir (Rp/m3)" pada workbook Timber).
function cellText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => (r && r.text) || "").join("");
    if (v.text !== undefined) return v.text === null ? "" : String(v.text);
    if (v.result !== undefined && v.result !== null) return String(v.result);
    if (v.hyperlink !== undefined) return String(v.hyperlink);
  }
  return String(v);
}

// Baris INPUT yang boleh diimpor dari Excel. Baris turunan (perubahanNeto,
// persediaanAkhir, laju pertumbuhan, seluruh Neraca Moneter, agregat Indonesia)
// TIDAK diimpor karena selalu dihitung ulang oleh engine agar konsisten.
const PHYSICAL_INPUT_ROWS = [
  { id: "persediaanAwal", label: "1. Persediaan Awal", satuan: "000 MÂ³" },
  { id: "pertumbuhan", label: "2. Pertumbuhan Alami", satuan: "000 MÂ³" },
  { id: "penanaman", label: "3. Penanaman (Reboisasi)", satuan: "000 MÂ³" },
  { id: "konversiKerusakan", label: "4. Konversi & Kerusakan", satuan: "000 MÂ³" },
  { id: "penebangan", label: "5. Penebangan (Produksi Kayu)", satuan: "000 MÂ³" },
];
const RENT_INPUT_ROWS = [{ id: "unitRent", label: "Unit Rent Kayu", satuan: "Rp / MÂ³" }];
const REGIONAL_ROW_SECTION = {
  persediaanAwal: "physical",
  pertumbuhan: "physical",
  penanaman: "physical",
  konversiKerusakan: "physical",
  penebangan: "physical",
  unitRent: "rent",
};

// Pemetaan label baris pada workbook LK Neraca Hutan asli (format lama) ke id
// baris input internal. "STOP" menandai mulai blok Neraca Moneter yang barisnya
// BERLABEL SAMA namun nilainya turunan, sehingga tidak boleh diimpor.
function classifyOriginalRow(label) {
  const s = cellText(label).trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.includes("neraca moneter")) return "STOP";
  if (s.includes("unit rent")) {
    if (s.includes("pertumbuhan")) return null;
    return "unitRent";
  }
  const m = s.match(/^(\d)\.\s*(.+)$/);
  if (m) {
    const rest = m[2];
    if (m[1] === "1" && rest.includes("persediaan awal")) return "persediaanAwal";
    if (m[1] === "2" && rest.includes("pertumbuhan")) return "pertumbuhan";
    if (m[1] === "3" && rest.includes("penanaman")) return "penanaman";
    if (m[1] === "4" && rest.includes("konversi")) return "konversiKerusakan";
    if (m[1] === "5" && rest.includes("penebangan")) return "penebangan";
  }
  return null;
}

// Pemetaan label KOMPONEN (kolom header pada layout tertranspose, mis. workbook
// LK Timber: tahun di kolom A, komponen di baris "Rincian"). Bergerak tanpa
// nomor urut, jadi dicocokkan berbasis kata kunci.
function classifyColumnLabel(label) {
  const s = cellText(label).trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.includes("unit rent")) return s.includes("pertumbuhan") ? null : "unitRent";
  // Workbook Timber: kolom hasil NPV dibagi stok akhir (Rp/m3) itulah Unit Rent
  // yang dipakai Tabel 3-nya (di sheet Jati Jawa kolom ini dilabeli "Unit Rent").
  if (s.includes("npv per stok")) return "unitRent";
  if (s.includes("resource rent")) return null;
  if (s.includes("persediaan akhir")) return null;
  if (s.includes("persediaan awal")) return "persediaanAwal";
  if (s.includes("pertumbuhan") || s.includes("growth")) {
    if (s.includes("laju") || s.includes("rate")) return null;
    return "pertumbuhan";
  }
  if (s.includes("penanaman") || s.includes("planting")) return "penanaman";
  if (s.includes("konversi") || s.includes("losses")) return "konversiKerusakan";
  if (s.includes("penebangan") || s.includes("harvest")) return "penebangan";
  return null;
}

// Pemetaan baris sheet "Data Penunjang" workbook LK asli (label di kolom B) ke id
// record internal. Hanya record yang dikenal aplikasi yang diimpor.
function matchPenunjangRecord(label, unit) {
  const s = cellText(label).trim().toLowerCase().replace(/\s+/g, " ");
  const u = cellText(unit).trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.includes("kebakaran")) {
    // Hanya baris LUAS kebakaran (Ha). Baris "Kebakaran" lain di sheet ini
    // adalah nilai kerugian (000 Rp / 000 M3) atau turunan (+ konversi, luar Jawa).
    if (u && u !== "ha") return null;
    if (!s.includes("luas kebakaran")) return null;
    if (s.includes("konversi") || s.includes("luar jawa")) return null;
    return "luas_kebakaran";
  }
  if (s.includes("realisasi reboisasi")) {
    if (u && u !== "ha") return null;
    return "reboisasi";
  }
  if (s.includes("produksi kayu bulat")) {
    if (u && u !== "m3") return null;
    return "produksi_kayu_bulat";
  }
  if (s.includes("rate of return") || s.includes("imbal hasil") || s.includes("govt bond")) {
    return "rate_of_return";
  }
  return null;
}

// Sheet "lebar" sumber Unit Rent / GOS per unit (Rp/MÂ³) untuk beberapa komoditas
// sekaligus (mis. sheet "GOS per unit" workbook LK Timber): nama komoditas ada di
// baris header per blok kolom, kolom Rp/MÂ³ berada di dalam blok tsb, dan daftar
// tahun berjalan di kolom A.
function detectWideUnitRent(ws, includeHidden) {
  const txt = cellText;
  const norm = (x) => txt(x).trim().replace(/\s+/g, " ").toLowerCase();

  const commodityCols = {};
  for (let r = 1; r <= Math.min(ws.rowCount, 3); r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      if (!includeHidden && ws.getColumn(col).hidden) return;
      const c = REGIONAL_SHEETS.find((s) => norm(cell.value) === s.toLowerCase());
      if (c && commodityCols[c] === undefined) commodityCols[c] = col;
    });
  }
  const entries = Object.entries(commodityCols).sort((a, b) => a[1] - b[1]);
  if (entries.length === 0) return null;

  const rentCol = {};
  for (let i = 0; i < entries.length; i++) {
    const [c, start] = entries[i];
    const end = i + 1 < entries.length ? entries[i + 1][1] : ws.columnCount + 1;
    for (let col = start; col < end; col++) {
      if (!includeHidden && ws.getColumn(col).hidden) continue;
      const h = `${norm(ws.getRow(1).getCell(col).value)} ${norm(ws.getRow(2).getCell(col).value)}`;
      if (h.includes("gos per unit") || h.includes("unit rent") || h.includes("rp/m3") || h.includes("rp / m3")) {
        rentCol[c] = col;
        break;
      }
    }
  }
  if (Object.keys(rentCol).length === 0) return null;

  const out = {};
  for (let r = 1; r <= ws.rowCount; r++) {
    if (!includeHidden && ws.getRow(r).hidden) continue;
    const m = txt(ws.getRow(r).getCell(1).value).trim().match(/^(\d{4})/);
    if (!m) continue;
    Object.entries(rentCol).forEach(([c, col]) => {
      const val = toNumber(ws.getRow(r).getCell(col).value);
      if (val === null) return;
      (out[c] = out[c] || {})[m[1]] = val;
    });
  }
  return Object.keys(out).length ? out : null;
}

function round2(val) {
  if (isNaN(val)) return 0;
  return Math.round(val * 100) / 100;
}

function round4(val) {
  if (isNaN(val)) return 0;
  return Math.round(val * 10000) / 10000;
}

function calculateRegionalSheet(sheetData) {
  const years = sheetData.years || [];
  if (years.length === 0) return sheetData;

  const phys = sheetData.physical || {};
  const rent = sheetData.rent || {};
  const mon = sheetData.monetary || {};

  phys.persediaanAwal = phys.persediaanAwal || {};
  phys.pertumbuhan = phys.pertumbuhan || {};
  phys.penanaman = phys.penanaman || {};
  phys.konversiKerusakan = phys.konversiKerusakan || {};
  phys.penebangan = phys.penebangan || {};
  phys.perubahanNeto = {};
  phys.persediaanAkhir = {};
  phys.lajuPertumbuhanAkhir = {};

  rent.unitRent = rent.unitRent || {};
  rent.pertumbuhanUnitRent = {};

  mon.persediaanAwal = mon.persediaanAwal || {};
  mon.pertumbuhan = {};
  mon.penanaman = {};
  mon.konversiKerusakan = {};
  mon.penebangan = {};
  mon.perubahanNeto = {};
  mon.revaluasi = {};
  mon.persediaanAkhir = {};
  mon.lajuPertumbuhanAkhir = {};

  sheetData.physical = phys;
  sheetData.rent = rent;
  sheetData.monetary = mon;

  for (let i = 0; i < years.length; i++) {
    const yr = years[i];
    const prevYr = i > 0 ? years[i - 1] : null;

    if (i > 0 && prevYr) {
      phys.persediaanAwal[yr] = phys.persediaanAkhir[prevYr] !== undefined ? phys.persediaanAkhir[prevYr] : 0;
    } else {
      phys.persediaanAwal[yr] = parseFloat(phys.persediaanAwal[yr]) || 0;
    }

    const awalFisik = parseFloat(phys.persediaanAwal[yr]) || 0;
    const tumbuhFisik = parseFloat(phys.pertumbuhan[yr]) || 0;
    const tanamFisik = parseFloat(phys.penanaman[yr]) || 0;
    const konversiFisik = parseFloat(phys.konversiKerusakan[yr]) || 0;
    const tebangFisik = parseFloat(phys.penebangan[yr]) || 0;

    const netoFisik = round2(tumbuhFisik + tanamFisik - konversiFisik - tebangFisik);
    phys.perubahanNeto[yr] = netoFisik;

    const akhirFisik = round2(awalFisik + netoFisik);
    phys.persediaanAkhir[yr] = akhirFisik;

    if (i > 0 && prevYr && phys.persediaanAkhir[prevYr]) {
      const prevAkhirFisik = phys.persediaanAkhir[prevYr];
      phys.lajuPertumbuhanAkhir[yr] = round4(((akhirFisik - prevAkhirFisik) / prevAkhirFisik) * 100);
    } else {
      phys.lajuPertumbuhanAkhir[yr] = 0;
    }

    const curRent = parseFloat(rent.unitRent[yr]) || 0;
    if (i > 0 && prevYr && rent.unitRent[prevYr]) {
      const prevRent = parseFloat(rent.unitRent[prevYr]) || 0;
      rent.pertumbuhanUnitRent[yr] = prevRent !== 0 ? round4(((curRent - prevRent) / prevRent) * 100) : 0;
    } else {
      rent.pertumbuhanUnitRent[yr] = 0;
    }

    if (i > 0 && prevYr) {
      mon.persediaanAwal[yr] = mon.persediaanAkhir[prevYr] !== undefined ? mon.persediaanAkhir[prevYr] : 0;
    } else if (mon.persediaanAwal[yr] === undefined || mon.persediaanAwal[yr] === null || mon.persediaanAwal[yr] === "") {
      mon.persediaanAwal[yr] = round2((awalFisik * curRent) / 1000000);
    } else {
      mon.persediaanAwal[yr] = parseFloat(mon.persediaanAwal[yr]) || 0;
    }

    const awalMoneter = parseFloat(mon.persediaanAwal[yr]) || 0;

    const tumbuhMoneter = round2((tumbuhFisik * curRent) / 1000000);
    const tanamMoneter = round2((tanamFisik * curRent) / 1000000);
    const konversiMoneter = round2((konversiFisik * curRent) / 1000000);
    const tebangMoneter = round2((tebangFisik * curRent) / 1000000);
    const netoMoneter = round2((netoFisik * curRent) / 1000000);

    mon.pertumbuhan[yr] = tumbuhMoneter;
    mon.penanaman[yr] = tanamMoneter;
    mon.konversiKerusakan[yr] = konversiMoneter;
    mon.penebangan[yr] = tebangMoneter;
    mon.perubahanNeto[yr] = netoMoneter;

    let reval = 0;
    if (i > 0 && prevYr && rent.unitRent[prevYr]) {
      const prevRent = parseFloat(rent.unitRent[prevYr]) || 0;
      reval = round2((awalFisik * (curRent - prevRent)) / 1000000);
    } else {
      reval = parseFloat(mon.revaluasi[yr]) || 0;
    }
    mon.revaluasi[yr] = reval;

    const akhirMoneter = round2(awalMoneter + netoMoneter + reval);
    mon.persediaanAkhir[yr] = akhirMoneter;

    if (i > 0 && prevYr && mon.persediaanAkhir[prevYr]) {
      const prevAkhirMon = mon.persediaanAkhir[prevYr];
      mon.lajuPertumbuhanAkhir[yr] = prevAkhirMon !== 0 ? round4(((akhirMoneter - prevAkhirMon) / prevAkhirMon) * 100) : 0;
    } else {
      mon.lajuPertumbuhanAkhir[yr] = 0;
    }
  }

  return sheetData;
}

function calculateNationalSheet(allSheets, years) {
  const jj = allSheets["Jati Jawa"];
  const rj = allSheets["Rimba Jawa"];
  const rlj = allSheets["Rimba Luar Jawa"];

  const indonesia = {
    name: "Indonesia",
    commodity: "Rekap Nasional",
    region: "Indonesia",
    years: [...years],
    physical: {
      persediaanAwal: {},
      pertumbuhan: {},
      penanaman: {},
      konversiKerusakan: {},
      penebangan: {},
      perubahanNeto: {},
      persediaanAkhir: {},
      lajuPertumbuhanAkhir: {},
    },
    rent: {
      unitRent: {},
      pertumbuhanUnitRent: {},
    },
    monetary: {
      persediaanAwal: {},
      pertumbuhan: {},
      penanaman: {},
      konversiKerusakan: {},
      penebangan: {},
      perubahanNeto: {},
      revaluasi: {},
      persediaanAkhir: {},
      lajuPertumbuhanAkhir: {},
    },
  };

  for (let i = 0; i < years.length; i++) {
    const yr = years[i];
    const prevYr = i > 0 ? years[i - 1] : null;

    const awal = round2((jj.physical.persediaanAwal[yr] || 0) + (rj.physical.persediaanAwal[yr] || 0) + (rlj.physical.persediaanAwal[yr] || 0));
    const tumbuh = round2((jj.physical.pertumbuhan[yr] || 0) + (rj.physical.pertumbuhan[yr] || 0) + (rlj.physical.pertumbuhan[yr] || 0));
    const tanam = round2((jj.physical.penanaman[yr] || 0) + (rj.physical.penanaman[yr] || 0) + (rlj.physical.penanaman[yr] || 0));
    const konversi = round2((jj.physical.konversiKerusakan[yr] || 0) + (rj.physical.konversiKerusakan[yr] || 0) + (rlj.physical.konversiKerusakan[yr] || 0));
    const tebang = round2((jj.physical.penebangan[yr] || 0) + (rj.physical.penebangan[yr] || 0) + (rlj.physical.penebangan[yr] || 0));
    const neto = round2((jj.physical.perubahanNeto[yr] || 0) + (rj.physical.perubahanNeto[yr] || 0) + (rlj.physical.perubahanNeto[yr] || 0));
    const akhir = round2((jj.physical.persediaanAkhir[yr] || 0) + (rj.physical.persediaanAkhir[yr] || 0) + (rlj.physical.persediaanAkhir[yr] || 0));

    indonesia.physical.persediaanAwal[yr] = awal;
    indonesia.physical.pertumbuhan[yr] = tumbuh;
    indonesia.physical.penanaman[yr] = tanam;
    indonesia.physical.konversiKerusakan[yr] = konversi;
    indonesia.physical.penebangan[yr] = tebang;
    indonesia.physical.perubahanNeto[yr] = neto;
    indonesia.physical.persediaanAkhir[yr] = akhir;

    if (i > 0 && prevYr && indonesia.physical.persediaanAkhir[prevYr]) {
      const prevAkhir = indonesia.physical.persediaanAkhir[prevYr];
      indonesia.physical.lajuPertumbuhanAkhir[yr] = round4(((akhir - prevAkhir) / prevAkhir) * 100);
    } else {
      indonesia.physical.lajuPertumbuhanAkhir[yr] = 0;
    }

    const awalMon = round2((jj.monetary.persediaanAwal[yr] || 0) + (rj.monetary.persediaanAwal[yr] || 0) + (rlj.monetary.persediaanAwal[yr] || 0));
    const tumbuhMon = round2((jj.monetary.pertumbuhan[yr] || 0) + (rj.monetary.pertumbuhan[yr] || 0) + (rlj.monetary.pertumbuhan[yr] || 0));
    const tanamMon = round2((jj.monetary.penanaman[yr] || 0) + (rj.monetary.penanaman[yr] || 0) + (rlj.monetary.penanaman[yr] || 0));
    const konversiMon = round2((jj.monetary.konversiKerusakan[yr] || 0) + (rj.monetary.konversiKerusakan[yr] || 0) + (rlj.monetary.konversiKerusakan[yr] || 0));
    const tebangMon = round2((jj.monetary.penebangan[yr] || 0) + (rj.monetary.penebangan[yr] || 0) + (rlj.monetary.penebangan[yr] || 0));
    const netoMon = round2((jj.monetary.perubahanNeto[yr] || 0) + (rj.monetary.perubahanNeto[yr] || 0) + (rlj.monetary.perubahanNeto[yr] || 0));
    const revalMon = round2((jj.monetary.revaluasi[yr] || 0) + (rj.monetary.revaluasi[yr] || 0) + (rlj.monetary.revaluasi[yr] || 0));
    const akhirMon = round2((jj.monetary.persediaanAkhir[yr] || 0) + (rj.monetary.persediaanAkhir[yr] || 0) + (rlj.monetary.persediaanAkhir[yr] || 0));

    indonesia.monetary.persediaanAwal[yr] = awalMon;
    indonesia.monetary.pertumbuhan[yr] = tumbuhMon;
    indonesia.monetary.penanaman[yr] = tanamMon;
    indonesia.monetary.konversiKerusakan[yr] = konversiMon;
    indonesia.monetary.penebangan[yr] = tebangMon;
    indonesia.monetary.perubahanNeto[yr] = netoMon;
    indonesia.monetary.revaluasi[yr] = revalMon;
    indonesia.monetary.persediaanAkhir[yr] = akhirMon;

    if (i > 0 && prevYr && indonesia.monetary.persediaanAkhir[prevYr]) {
      const prevAkhirMon = indonesia.monetary.persediaanAkhir[prevYr];
      indonesia.monetary.lajuPertumbuhanAkhir[yr] = round4(((akhirMon - prevAkhirMon) / prevAkhirMon) * 100);
    } else {
      indonesia.monetary.lajuPertumbuhanAkhir[yr] = 0;
    }

    if (akhir > 0) {
      indonesia.rent.unitRent[yr] = round2((akhirMon * 1000000) / akhir);
    } else {
      indonesia.rent.unitRent[yr] = 0;
    }
  }

  indonesia.rent.pertumbuhanUnitRent = {};
  for (let i = 0; i < years.length; i++) {
    const yr = years[i];
    const prevYr = i > 0 ? years[i - 1] : null;
    if (i > 0 && prevYr && indonesia.rent.unitRent[prevYr]) {
      const prevRent = indonesia.rent.unitRent[prevYr];
      const curRent = indonesia.rent.unitRent[yr];
      indonesia.rent.pertumbuhanUnitRent[yr] = prevRent !== 0 ? round4(((curRent - prevRent) / prevRent) * 100) : 0;
    } else {
      indonesia.rent.pertumbuhanUnitRent[yr] = 0;
    }
  }

  allSheets.Indonesia = indonesia;
  return indonesia;
}

function recalculateAll(data) {
  const sheets = data.sheets;
  const years = data.years;

  REGIONAL_SHEETS.forEach((sh) => {
    if (sheets[sh]) calculateRegionalSheet(sheets[sh]);
  });

  calculateNationalSheet(sheets, years);

  return data;
}

function getInitialSpreadsheetData() {
  const years = [
    "2014", "2015", "2016", "2017", "2018",
    "2019", "2020", "2021", "2022", "2023", "2024",
  ];

  const data = {
    meta: {
      title: "Sistem Pengolahan & Input Neraca Fisik & Moneter Hutan (Sisnerling)",
      version: "2.0.0",
      description: "Spreadsheet input data & pengolahan otomatis dengan formula di belakang layar.",
    },
    years,
    sheets: {
      "Jati Jawa": {
        name: "Jati Jawa",
        commodity: "Kayu Jati",
        region: "Pulau Jawa",
        years: [...years],
        physical: {
          persediaanAwal: { 2014: 108342.5 },
          pertumbuhan: {
            2014: 4912.4, 2015: 4945.1, 2016: 4980.2, 2017: 5012.8, 2018: 5030.5,
            2019: 5045.2, 2020: 5062.1, 2021: 5074.8, 2022: 5082.3, 2023: 5090.1, 2024: 5096.8,
          },
          penanaman: {
            2014: 25.4, 2015: 22.1, 2016: 18.9, 2017: 17.2, 2018: 16.5,
            2019: 15.8, 2020: 15.2, 2021: 14.8, 2022: 14.5, 2023: 14.2, 2024: 14.1,
          },
          konversiKerusakan: {
            2014: 412.3, 2015: 450.8, 2016: 480.2, 2017: 510.6, 2018: 540.2,
            2019: 570.4, 2020: 600.1, 2021: 625.3, 2022: 648.5, 2023: 668.2, 2024: 686.8,
          },
          penebangan: {
            2014: 445.6, 2015: 430.2, 2016: 420.5, 2017: 415.3, 2018: 410.2,
            2019: 408.5, 2020: 405.1, 2021: 402.4, 2022: 400.1, 2023: 397.8, 2024: 395.5,
          },
        },
        rent: {
          unitRent: {
            2014: 142500, 2015: 145752, 2016: 148200, 2017: 151400, 2018: 154800,
            2019: 158200, 2020: 161500, 2021: 165200, 2022: 169100, 2023: 173400, 2024: 178200,
          },
        },
        monetary: {
          persediaanAwal: { 2014: 15438.8 },
        },
      },
      "Rimba Jawa": {
        name: "Rimba Jawa",
        commodity: "Kayu Rimba",
        region: "Pulau Jawa",
        years: [...years],
        physical: {
          persediaanAwal: { 2014: 435120.4 },
          pertumbuhan: {
            2014: 17120.5, 2015: 17250.2, 2016: 17400.1, 2017: 17550.8, 2018: 17680.4,
            2019: 17800.2, 2020: 17920.5, 2021: 18010.2, 2022: 18090.5, 2023: 18150.2, 2024: 18205.3,
          },
          penanaman: {
            2014: 85.2, 2015: 72.4, 2016: 60.1, 2017: 48.5, 2018: 39.2,
            2019: 31.4, 2020: 25.1, 2021: 20.4, 2022: 17.8, 2023: 15.6, 2024: 14.2,
          },
          konversiKerusakan: {
            2014: 380.5, 2015: 410.2, 2016: 445.6, 2017: 480.1, 2018: 510.4,
            2019: 535.8, 2020: 558.2, 2021: 575.4, 2022: 588.6, 2023: 595.4, 2024: 600.2,
          },
          penebangan: {
            2014: 520.1, 2015: 505.4, 2016: 490.2, 2017: 475.6, 2018: 460.1,
            2019: 448.2, 2020: 435.6, 2021: 425.1, 2022: 418.4, 2023: 412.5, 2024: 408.1,
          },
        },
        rent: {
          unitRent: {
            2014: 34500, 2015: 35800, 2016: 37200, 2017: 38900, 2018: 40500,
            2019: 42100, 2020: 43800, 2021: 45600, 2022: 47500, 2023: 49600, 2024: 51800,
          },
        },
        monetary: {
          persediaanAwal: { 2014: 15011.7 },
        },
      },
      "Rimba Luar Jawa": {
        name: "Rimba Luar Jawa",
        commodity: "Kayu Rimba",
        region: "Luar Jawa",
        years: [...years],
        physical: {
          persediaanAwal: { 2014: 4215800.0 },
          pertumbuhan: {
            2014: 25100.0, 2015: 24800.0, 2016: 24500.0, 2017: 24200.0, 2018: 23950.0,
            2019: 23750.0, 2020: 23600.0, 2021: 23500.0, 2022: 23420.0, 2023: 23350.0, 2024: 23297.3,
          },
          penanaman: {
            2014: 6800.0, 2015: 6950.0, 2016: 7100.0, 2017: 7250.0, 2018: 7380.0,
            2019: 7480.0, 2020: 7550.0, 2021: 7600.0, 2022: 7640.0, 2023: 7670.0, 2024: 7699.3,
          },
          konversiKerusakan: {
            2014: 145000.0, 2015: 138000.0, 2016: 130000.0, 2017: 122000.0, 2018: 115000.0,
            2019: 109000.0, 2020: 104000.0, 2021: 100500.0, 2022: 98000.0, 2023: 96200.0, 2024: 95017.5,
          },
          penebangan: {
            2014: 46800.0, 2015: 47500.0, 2016: 48400.0, 2017: 49500.0, 2018: 50600.0,
            2019: 51500.0, 2020: 52300.0, 2021: 53000.0, 2022: 53600.0, 2023: 54100.0, 2024: 54503.7,
          },
        },
        rent: {
          unitRent: {
            2014: 28500, 2015: 29800, 2016: 31200, 2017: 32600, 2018: 34100,
            2019: 35800, 2020: 37500, 2021: 39200, 2022: 41000, 2023: 43100, 2024: 45200,
          },
        },
        monetary: {
          persediaanAwal: { 2014: 120150.3 },
        },
      },
      "Data Penunjang": {
        name: "Data Penunjang & Parameter",
        commodity: "Parameter Makro & Fisik",
        region: "Nasional",
        years: [...years],
        records: [
          {
            id: "luas_kebakaran",
            name: "Luas Kebakaran Hutan Indonesia",
            satuan: "Ha",
            values: {
              2014: 44090, 2015: 2611411, 2016: 438360, 2017: 165484, 2018: 510564,
              2019: 1649258, 2020: 296942, 2021: 358867, 2022: 204894, 2023: 1161193, 2024: 130955,
            },
          },
          {
            id: "reboisasi",
            name: "Realisasi Reboisasi (Penanaman)",
            satuan: "Ha",
            values: {
              2014: 158200, 2015: 162400, 2016: 171500, 2017: 185200, 2018: 198400,
              2019: 210500, 2020: 225400, 2021: 238900, 2022: 247500, 2023: 252100, 2024: 257098,
            },
          },
          {
            id: "produksi_kayu_bulat",
            name: "Produksi Kayu Bulat Indonesia",
            satuan: "M3",
            values: {
              2014: 24500000, 2015: 25200000, 2016: 26100000, 2017: 27300000, 2018: 28500000,
              2019: 29400000, 2020: 30100000, 2021: 30800000, 2022: 31400000, 2023: 31800000, 2024: 32071074,
            },
          },
          {
            id: "rate_of_return",
            name: "Tingkat Imbal Hasil (Govt Bond Rate - CPI)",
            satuan: "%",
            values: {
              2014: 4.12, 2015: 4.35, 2016: 4.2, 2017: 3.95, 2018: 4.45,
              2019: 4.1, 2020: 3.75, 2021: 3.6, 2022: 3.85, 2023: 3.9, 2024: 3.95,
            },
          },
        ],
      },
    },
  };

  return recalculateAll(data);
}

let state = null;

const DEFAULT_DATASET_NAME = "Baseline (Acuan BPS)";

function save() {
  if (!state) return;
  state.meta = state.meta || {};
  state.meta.updatedAt = new Date().toISOString();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function newDatasetId() {
  return "ds_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function makeDataset(name, source, data, extra) {
  const now = new Date().toISOString();
  return { id: newDatasetId(), name, source, createdAt: now, updatedAt: now, data, ...(extra || {}) };
}

// Normalisasi state: dukung format lama (single { years, sheets }) -> multi-dataset.
function normalizeState(raw) {
  if (raw && Array.isArray(raw.datasets) && raw.datasets.length) {
    raw.activeDatasetId = raw.datasets.some((d) => d.id === raw.activeDatasetId)
      ? raw.activeDatasetId
      : raw.datasets[0].id;
    raw.datasets.forEach((d) => {
      if (!d.data || !Array.isArray(d.data.years) || !d.data.sheets) {
        d.data = getInitialSpreadsheetData();
      }
      recalculateAll(d.data);
    });
    return raw;
  }
  if (raw && raw.sheets && raw.years) {
    const legacy = { meta: raw.meta || {}, years: raw.years, sheets: raw.sheets };
    const ds = makeDataset(DEFAULT_DATASET_NAME, "baseline", legacy);
    return { meta: raw.meta || {}, activeDatasetId: ds.id, datasets: [ds] };
  }
  return null;
}

function freshState() {
  const ds = makeDataset(DEFAULT_DATASET_NAME, "baseline", getInitialSpreadsheetData());
  return {
    meta: { title: "Sistem Pengolahan & Input Neraca Fisik & Moneter Hutan (Sisnerling)" },
    activeDatasetId: ds.id,
    datasets: [ds],
  };
}

function loadOrInit() {
  if (state) return state;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      const normalized = normalizeState(raw);
      if (normalized) {
        state = normalized;
        return state;
      }
    }
  } catch (err) {
    console.error("Gagal memuat neraca_hutan.json, menginisialisasi ulang:", err.message);
  }
  state = freshState();
  save();
  return state;
}

function datasetList() {
  const s = loadOrInit();
  return s.datasets.map((d) => ({
    id: d.id,
    name: d.name,
    source: d.source,
    sourceFilename: d.sourceFilename || null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    years: (d.data && d.data.years) || [],
    includeHidden: d.includeHidden,
  }));
}

function activeDataset() {
  const s = loadOrInit();
  return s.datasets.find((d) => d.id === s.activeDatasetId) || s.datasets[0];
}

function getDataset(id) {
  if (!id) return activeDataset();
  const dataset = loadOrInit().datasets.find((d) => d.id === id);
  if (!dataset) {
    const err = new Error("Dataset tujuan tidak ditemukan!");
    err.status = 404;
    throw err;
  }
  return dataset;
}

function activeData() {
  return activeDataset().data;
}

function getNeracaCellValue(cell) {
  if (
    !cell ||
    !cell.datasetId ||
    !cell.sheet ||
    !cell.section ||
    !cell.row ||
    !cell.year
  ) {
    const err = new Error("Identitas sel neraca yang akan dipulihkan tidak lengkap.");
    err.status = 400;
    throw err;
  }
  const ds = getDataset(cell.datasetId);
  const sheetObj = ds.data.sheets[cell.sheet];
  if (!sheetObj) {
    const err = new Error(`Sheet "${cell.sheet}" tidak ditemukan pada dataset yang akan dipulihkan.`);
    err.status = 404;
    throw err;
  }
  if (cell.section === "data_penunjang") {
    if (cell.sheet !== "Data Penunjang") {
      const err = new Error("Sheet data penunjang pada snapshot tidak valid.");
      err.status = 400;
      throw err;
    }
    const record = (sheetObj.records || []).find((item) => item.id === cell.row);
    if (!record || !ds.data.years.includes(String(cell.year))) {
      const err = new Error("Sel neraca yang akan dipulihkan tidak ditemukan.");
      err.status = 404;
      throw err;
    }
    return record.values[cell.year] ?? 0;
  }
  if (
    !REGIONAL_SHEETS.includes(cell.sheet) ||
    REGIONAL_ROW_SECTION[cell.row] !== cell.section ||
    !ds.data.years.includes(String(cell.year))
  ) {
    const err = new Error("Sel neraca yang akan dipulihkan tidak valid.");
    err.status = 400;
    throw err;
  }
  return sheetObj[cell.section]?.[cell.row]?.[cell.year] ?? 0;
}

function readNeracaCellValues(cells) {
  if (!Array.isArray(cells) || !cells.length) {
    const err = new Error("Snapshot perubahan neraca tidak valid.");
    err.status = 400;
    throw err;
  }
  return cells.map((cell) => ({ ...cell, value: getNeracaCellValue(cell) }));
}

function applyNeracaCellValues(cells) {
  const current = readNeracaCellValues(cells);
  if (cells.some((cell) => !Number.isFinite(Number(cell.value)))) {
    const err = new Error("Nilai pada snapshot neraca tidak valid.");
    err.status = 400;
    throw err;
  }
  const datasets = new Map();
  cells.forEach((cell) => {
    const ds = getDataset(cell.datasetId);
    if (!datasets.has(ds.id)) datasets.set(ds.id, ds);
    const sheetObj = ds.data.sheets[cell.sheet];
    if (cell.section === "data_penunjang") {
      const record = sheetObj.records.find((item) => item.id === cell.row);
      record.values[cell.year] = Number(cell.value);
    } else {
      if (!sheetObj[cell.section][cell.row]) sheetObj[cell.section][cell.row] = {};
      sheetObj[cell.section][cell.row][cell.year] = Number(cell.value);
    }
  });
  datasets.forEach((ds) => {
    recalculateAll(ds.data);
    ds.updatedAt = new Date().toISOString();
  });
  save();
  return current;
}

// Response lengkap ke klien: data dataset aktif + daftar dataset.
function neracaResponse() {
  const data = activeData();
  return {
    ...data,
    activeDatasetId: loadOrInit().activeDatasetId,
    datasets: datasetList(),
  };
}

function selectDataset(id) {
  const s = loadOrInit();
  if (!s.datasets.some((d) => d.id === id)) {
    const err = new Error("Dataset tidak ditemukan!");
    err.status = 404;
    throw err;
  }
  s.activeDatasetId = id;
  save();
  return s;
}

function renameDataset(id, name) {
  const s = loadOrInit();
  const ds = s.datasets.find((d) => d.id === id);
  if (!ds) {
    const err = new Error("Dataset tidak ditemukan!");
    err.status = 404;
    throw err;
  }
  const clean = String(name || "").trim();
  if (!clean) {
    const err = new Error("Nama dataset tidak boleh kosong!");
    err.status = 400;
    throw err;
  }
  ds.name = clean.slice(0, 120);
  ds.updatedAt = new Date().toISOString();
  save();
  return s;
}

function deleteDataset(id) {
  const s = loadOrInit();
  if (s.datasets.length <= 1) {
    const err = new Error("Minimal harus ada satu dataset. Dataset terakhir tidak dapat dihapus.");
    err.status = 400;
    throw err;
  }
  const idx = s.datasets.findIndex((d) => d.id === id);
  if (idx === -1) {
    const err = new Error("Dataset tidak ditemukan!");
    err.status = 404;
    throw err;
  }
  s.datasets.splice(idx, 1);
  if (s.activeDatasetId === id) s.activeDatasetId = s.datasets[0].id;
  save();
  return s;
}

function addYear(year) {
  const ds = activeDataset();
  const data = ds.data;
  let target = year === undefined || year === null ? "" : String(year).trim();
  if (!target) {
    const lastYear = parseInt(data.years[data.years.length - 1], 10);
    target = String(lastYear + 1);
  }
  if (data.years.includes(target)) {
    const err = new Error(`Tahun ${target} sudah ada di dalam tabel!`);
    err.status = 400;
    throw err;
  }

  data.years.push(target);
  data.years.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  REGIONAL_SHEETS.forEach((shName) => {
    const sh = data.sheets[shName];
    if (!sh) return;
    sh.years = [...data.years];
    const prevYear = data.years[data.years.length - 2];
    sh.physical.pertumbuhan[target] = sh.physical.pertumbuhan[prevYear] || 0;
    sh.physical.penanaman[target] = sh.physical.penanaman[prevYear] || 0;
    sh.physical.konversiKerusakan[target] = sh.physical.konversiKerusakan[prevYear] || 0;
    sh.physical.penebangan[target] = sh.physical.penebangan[prevYear] || 0;
    sh.rent.unitRent[target] = Math.round((sh.rent.unitRent[prevYear] || 100000) * 1.03);
  });

  const dp = data.sheets["Data Penunjang"];
  if (dp && dp.records) {
    dp.years = [...data.years];
    const prevYear = data.years[data.years.length - 2];
    dp.records.forEach((r) => {
      r.values[target] = r.values[prevYear] || 0;
    });
  }

  recalculateAll(data);
  ds.updatedAt = new Date().toISOString();
  save();
  return data;
}

function updateCell({ datasetId, sheet, section, row, year, value }) {
  const ds = getDataset(datasetId);
  const data = ds.data;
  const sheetObj = data.sheets[sheet];
  if (!sheetObj) {
    const err = new Error(`Sheet "${sheet}" tidak ditemukan!`);
    err.status = 404;
    throw err;
  }

  const numVal = parseFloat(value);
  const cleanVal = isNaN(numVal) ? 0 : numVal;

  if (section === "data_penunjang") {
    const rec = (sheetObj.records || []).find((r) => r.id === row);
    if (rec) rec.values[year] = cleanVal;
  } else {
    if (!sheetObj[section]) sheetObj[section] = {};
    if (!sheetObj[section][row]) sheetObj[section][row] = {};
    sheetObj[section][row][year] = cleanVal;
  }

  recalculateAll(data);
  ds.updatedAt = new Date().toISOString();
  save();
  return data;
}

function resetData() {
  const ds = activeDataset();
  ds.data = getInitialSpreadsheetData();
  ds.updatedAt = new Date().toISOString();
  save();
  return ds.data;
}

function buildCsv(data, targetSheet) {
  const sh = data.sheets[targetSheet];
  if (!sh) return null;

  const years = data.years;
  const lines = [];

  lines.push('"SISNERLING - TABEL PENGOLAHAN DAN INPUT NERACA HUTAN"');
  lines.push(`"Sheet: ${targetSheet} | Komoditas: ${sh.commodity || ""} | Wilayah: ${sh.region || ""}"`);
  lines.push(`"Tanggal Unduh: ${new Date().toLocaleString("id-ID")}"`);
  lines.push("");

  lines.push(`"I. NERACA FISIK (000 M3)",${years.map((y) => `"${y}"`).join(",")}`);
  const physRows = [
    { label: "1. Persediaan Awal", key: "persediaanAwal" },
    { label: "2. Pertumbuhan", key: "pertumbuhan" },
    { label: "3. Penanaman", key: "penanaman" },
    { label: "4. Konversi & Kerusakan", key: "konversiKerusakan" },
    { label: "5. Penebangan", key: "penebangan" },
    { label: "6. Perubahan Neto [fx]", key: "perubahanNeto" },
    { label: "7. Persediaan Akhir [fx]", key: "persediaanAkhir" },
    { label: "Laju Pertumbuhan (%) [fx]", key: "lajuPertumbuhanAkhir" },
  ];
  physRows.forEach((r) => {
    const vals = years.map((y) => (sh.physical && sh.physical[r.key] ? sh.physical[r.key][y] || 0 : 0));
    lines.push(`"${r.label}",${vals.join(",")}`);
  });

  lines.push("");
  lines.push(`"II. UNIT RENT (Rp/M3)",${years.map((y) => `"${y}"`).join(",")}`);
  lines.push(`"Unit Rent",${years.map((y) => (sh.rent && sh.rent.unitRent ? sh.rent.unitRent[y] || 0 : 0)).join(",")}`);
  lines.push(`"Pertumbuhan Unit Rent (%) [fx]",${years.map((y) => (sh.rent && sh.rent.pertumbuhanUnitRent ? sh.rent.pertumbuhanUnitRent[y] || 0 : 0)).join(",")}`);

  lines.push("");
  lines.push(`"III. NERACA MONETER (Miliar Rp)",${years.map((y) => `"${y}"`).join(",")}`);
  const monRows = [
    { label: "1. Persediaan Awal [fx]", key: "persediaanAwal" },
    { label: "2. Pertumbuhan [fx]", key: "pertumbuhan" },
    { label: "3. Penanaman [fx]", key: "penanaman" },
    { label: "4. Konversi & Kerusakan [fx]", key: "konversiKerusakan" },
    { label: "5. Penebangan [fx]", key: "penebangan" },
    { label: "6. Perubahan Neto [fx]", key: "perubahanNeto" },
    { label: "7. Revaluasi [fx]", key: "revaluasi" },
    { label: "8. Persediaan Akhir [fx]", key: "persediaanAkhir" },
    { label: "Laju Pertumbuhan Nilai (%) [fx]", key: "lajuPertumbuhanAkhir" },
  ];
  monRows.forEach((r) => {
    const vals = years.map((y) => (sh.monetary && sh.monetary[r.key] ? sh.monetary[r.key][y] || 0 : 0));
    lines.push(`"${r.label}",${vals.join(",")}`);
  });

  return lines.join("\r\n");
}

function sheetKind(name) {
  const n = String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
  const regional = REGIONAL_SHEETS.find((s) => s.toLowerCase() === n);
  if (regional) return { kind: "regional", sheet: regional };
  if (n === "data penunjang") return { kind: "penunjang", sheet: "Data Penunjang" };
  return null;
}

// Ubah nilai sel Excel (number | string | objek formula) menjadi angka atau null.
function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object") {
    if (v.result !== undefined && v.result !== null) return toNumber(v.result);
    if (Array.isArray(v.richText)) return toNumber(v.richText.map((t) => t.text).join(""));
    return null;
  }
  const cleaned = String(v)
    .replace(/[^\d.,\-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Bangun workbook template berisi baris INPUT (bukan baris fx) tiap sheet.
function buildTemplateWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SISNERLING";
  const years = data.years;
  const setupCols = (ws, widths) => {
    ws.columns.forEach((col, i) => {
      col.width = widths[i] || 14;
    });
  };

  REGIONAL_SHEETS.forEach((name) => {
    const sh = data.sheets[name] || {};
    const ws = wb.addWorksheet(name);
    ws.addRow(["ID", "Komponen / Indikator", "Satuan", ...years]);
    PHYSICAL_INPUT_ROWS.forEach((r) => {
      const series = (sh.physical && sh.physical[r.id]) || {};
      ws.addRow([r.id, r.label, r.satuan, ...years.map((y) => (series[y] !== undefined ? series[y] : 0))]);
    });
    RENT_INPUT_ROWS.forEach((r) => {
      const series = (sh.rent && sh.rent[r.id]) || {};
      ws.addRow([r.id, r.label, r.satuan, ...years.map((y) => (series[y] !== undefined ? series[y] : 0))]);
    });
    setupCols(ws, [22, 38, 10, ...years.map(() => 14)]);
  });

  const dp = data.sheets["Data Penunjang"];
  if (dp && dp.records) {
    const ws = wb.addWorksheet("Data Penunjang");
    ws.addRow(["ID", "Indikator Parameter", "Satuan", ...years]);
    dp.records.forEach((rec) => {
      ws.addRow([rec.id, rec.name, rec.satuan, ...years.map((y) => (rec.values[y] !== undefined ? rec.values[y] : 0))]);
    });
    setupCols(ws, [26, 40, 10, ...years.map(() => 14)]);
  }

  return wb;
}

// Buat dataset BARU dari workbook Excel. Dataset lama TIDAK diubah sama sekali.
// options.includeHidden === false -> sheet/baris/kolom tersembunyi DILEWATI.
// Default true (sertakan data tersembunyi) agar data tetap lengkap.
// options._skipSave === true -> parse saja, jangan push/save (dipakai reimport).
async function createDatasetFromImport(buffer, name, options = {}) {
  const includeHidden = !(options && options.includeHidden === false);
  const skipSave = !!(options && options._skipSave);
  const base = getInitialSpreadsheetData();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (err) {
    const e = new Error("File tidak dapat dibaca. Pastikan berformat .xlsx yang valid.");
    e.status = 400;
    throw e;
  }

  const updates = [];
  const yearSet = new Set();
  const matchedSheets = [];
  const allSheets = [];
  const wideRent = {};
  const recordIds = new Set((base.sheets["Data Penunjang"].records || []).map((rec) => rec.id));

  const hiddenRow = (ws, r) => !includeHidden && ws.getRow(r).hidden;
  const hiddenCol = (ws, c) => !includeHidden && ws.getColumn(c).hidden;

  const collectYears = (ws, rowIdx) => {
    const years = {};
    let last = 0;
    const row = ws.getRow(rowIdx);
    for (let c = 1; c <= ws.columnCount; c++) {
      const raw = row.getCell(c).value;
      const t = cellText(raw).trim();
      if (/^\d{4}$/.test(t)) {
        const y = parseInt(t, 10);
        // Blok tahun hanya berlaku selama berurutan; begitu berbeda, itu tabel
        // kedua pada sheet yang sama dan TIDAK boleh menimpa tabel utama.
        if (last && y !== last + 1) break;
        last = y;
        if (!hiddenCol(ws, c)) years[c] = t;
      } else if (last && t) {
        break;
      }
    }
    return years;
  };

  const findRowByLabel = (ws, label, maxRows) => {
    for (let r = 1; r <= Math.min(ws.rowCount, maxRows); r++) {
      const a = ws.getRow(r).getCell(1).value;
      if (a !== null && a !== undefined && cellText(a).trim().toLowerCase() === label) return r;
    }
    return 0;
  };

  wb.eachSheet((ws) => {
    allSheets.push(ws.name);
    if (!includeHidden && ws.state && ws.state !== "visible") return;

    // Sumber Unit Rent "lebar" (mis. sheet "GOS per unit") bisa berasal dari sheet
    // apa pun, jadi dideteksi lebih dulu sebelum filter nama sheet.
    const wide = detectWideUnitRent(ws, includeHidden);
    if (wide) {
      Object.entries(wide).forEach(([c, series]) => {
        const t = (wideRent[c] = wideRent[c] || {});
        Object.entries(series).forEach(([y, v]) => {
          if (t[y] === undefined) t[y] = v;
        });
      });
    }

    const info = sheetKind(ws.name);
    if (!info) return;

    const local = [];

    // --- Layout A: template SISNERLING (kolom A berisi ID) ---
    let templateHeader = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
      const a = ws.getRow(r).getCell(1).value;
      if (a !== null && a !== undefined && cellText(a).trim().toLowerCase() === "id") {
        templateHeader = r;
        break;
      }
    }

    if (templateHeader) {
      const yearCols = collectYears(ws, templateHeader);
      for (let r = templateHeader + 1; r <= ws.rowCount; r++) {
        if (hiddenRow(ws, r)) continue;
        const row = ws.getRow(r);
        const rawId = row.getCell(1).value;
        const id = cellText(rawId).trim();
        if (!id) continue;
        if (info.kind === "regional") {
          const section = REGIONAL_ROW_SECTION[id];
          if (!section) continue;
          Object.entries(yearCols).forEach(([col, year]) => {
            const val = toNumber(row.getCell(Number(col)).value);
            if (val === null) return;
            local.push({ section, row: id, year, value: val });
          });
        } else {
          if (!recordIds.has(id)) continue;
          Object.entries(yearCols).forEach(([col, year]) => {
            const val = toNumber(row.getCell(Number(col)).value);
            if (val === null) return;
            local.push({ section: "data_penunjang", row: id, year, value: val });
          });
        }
      }
    }

    // --- Layout B: workbook LK Neraca Hutan asli (label teks di kolom A,
    //     tahun pada baris header "Perincian"/"Rincian"). Baris Neraca Moneter
    //     diabaikan karena berlabel sama namun turunan. ---
    if (local.length === 0 && info.kind === "regional") {
      const headRow =
        findRowByLabel(ws, "perincian", 12) ||
        findRowByLabel(ws, "rincian", 12) ||
        findRowByLabel(ws, "komponen", 12);
      if (headRow) {
        const yearCols = collectYears(ws, headRow);
        let stop = false;
        for (let r = headRow + 1; r <= ws.rowCount && !stop; r++) {
          if (hiddenRow(ws, r)) continue;
          const raw = ws.getRow(r).getCell(1).value;
          const label = cellText(raw).trim();
          if (!label) continue;
          const kind = classifyOriginalRow(label);
          if (kind === "STOP") { stop = true; continue; }
          if (!kind) continue;
          const section = REGIONAL_ROW_SECTION[kind];
          if (!section) continue;
          Object.entries(yearCols).forEach(([col, year]) => {
            const val = toNumber(ws.getRow(r).getCell(Number(col)).value);
            if (val === null) return;
            local.push({ section, row: kind, year, value: val });
          });
        }
      }
    }

    // --- Layout C: tertranspose (tahun di kolom A, komponen di baris header),
    //     mis. workbook LK Timber. Diproses PER BLOK: Tabel 1 (fisik), Tabel 2
    //     (Unit Rent), Tabel 3 (Neraca Moneter) dilewati karena turunan. ---
    if (local.length === 0 && info.kind === "regional") {
      const findTitleRow = (headRow) => {
        for (let r = headRow - 1; r >= Math.max(1, headRow - 4); r--) {
          const tA = cellText(ws.getRow(r).getCell(1).value);
          if (tA && /tabel\s*\d/i.test(tA)) return r;
        }
        return 0;
      };
      // Kelompokkan baris header per blok tabel (satu judul bisa punya dua
      // baris header identik, mis. "Tahun" berulang pada workbook Timber).
      const headerRows = {};
      const blocks = {};
      for (let r = 1; r <= ws.rowCount; r++) {
        const a = ws.getRow(r).getCell(1).value;
        const h = cellText(a).trim().toLowerCase();
        if (h !== "rincian" && h !== "perincian" && h !== "tahun") continue;
        headerRows[r] = true;
        const titleRow = findTitleRow(r);
        const key = titleRow || r;
        if (!blocks[key]) {
          blocks[key] = { title: "", titleRow, headerRows: [] };
          if (titleRow) {
            blocks[key].title = cellText(ws.getRow(titleRow).getCell(1).value).toLowerCase();
          }
        }
        blocks[key].headerRows.push(r);
      }

      let physicalDone = false;
      Object.values(blocks).forEach((block) => {
        if (block.title.includes("moneter")) return;

        const compCols = {};
        const collectHeaders = (rowIdx) => {
          ws.getRow(rowIdx).eachCell({ includeEmpty: false }, (cell, col) => {
            if (hiddenCol(ws, col)) return;
            const id = classifyColumnLabel(cell.value);
            if (id && REGIONAL_ROW_SECTION[id]) compCols[col] = id;
          });
        };
        block.headerRows.forEach(collectHeaders);
        // Label judul kadang memuat nama kolom (mis. "Unit Rent" di baris judul
        // Tabel 2 workbook Timber, sedangkan baris header-nya "NPV per stok akhir").
        if (block.titleRow) collectHeaders(block.titleRow);
        if (!Object.keys(compCols).length) return;

        const hasPhysical = Object.keys(compCols).some((c) => compCols[c] !== "unitRent");
        if (physicalDone && hasPhysical) return;

        const ownHeaders = {};
        block.headerRows.forEach((hr) => { ownHeaders[hr] = true; });
        for (let r = Math.min(...block.headerRows) + 1; r <= ws.rowCount; r++) {
          if (hiddenRow(ws, r)) continue;
          const rawA = ws.getRow(r).getCell(1).value;
          const aStr = cellText(rawA).trim();
          if (/^\d{4}$/.test(aStr)) {
            Object.entries(compCols).forEach(([col, id]) => {
              const val = toNumber(ws.getRow(r).getCell(Number(col)).value);
              if (val === null) return;
              local.push({ section: REGIONAL_ROW_SECTION[id], row: id, year: aStr, value: val });
            });
            continue;
          }
          if (ownHeaders[r]) continue; // baris header ganda di blok yang sama
          break; // baris lain = blok/teks berikutnya
        }
        if (hasPhysical) physicalDone = true;
      });
    }

    // --- Layout D: sheet "Data Penunjang" workbook LK asli (label di kolom B,
    //     header tahun berisi 4 digit pada baris awal). ---
    if (local.length === 0 && info.kind === "penunjang") {
      let headRow = 0;
      for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
        if (Object.keys(collectYears(ws, r)).length >= 3) {
          headRow = r;
          break;
        }
      }
      if (headRow) {
        const yearCols = collectYears(ws, headRow);
        const dpBest = new Map();
        for (let r = headRow + 1; r <= ws.rowCount; r++) {
          if (hiddenRow(ws, r)) continue;
          const a = ws.getRow(r).getCell(1).value;
          const b = ws.getRow(r).getCell(2).value;
          const label = `${cellText(a)} ${cellText(b)}`;
          const unit = ws.getRow(r).getCell(5).value;
          const id = matchPenunjangRecord(label, unit);
          if (!id) continue;
          const prio = id === "luas_kebakaran" && /total/.test(label.toLowerCase()) ? 2 : 1;
          Object.entries(yearCols).forEach(([col, year]) => {
            const val = toNumber(ws.getRow(r).getCell(Number(col)).value);
            if (val === null || val < 0) return;
            const key = `${id}|${year}`;
            const prev = dpBest.get(key);
            if (!prev || prio > prev.prio) {
              dpBest.set(key, { section: "data_penunjang", row: id, year, value: val, prio });
            }
          });
        }
        dpBest.forEach(({ prio, ...entry }) => local.push(entry));
      }
    }

    if (local.length === 0) return;
    matchedSheets.push(ws.name);
    local.forEach((u) => {
      yearSet.add(u.year);
      updates.push({ sheet: info.sheet, ...u });
    });
  });

  Object.values(wideRent).forEach((series) => {
    Object.keys(series).forEach((y) => yearSet.add(y));
  });

  if (matchedSheets.length === 0) {
    const found = allSheets.length ? allSheets.slice(0, 10).join(", ") : "(tidak ada sheet)";
    console.log(`[neraca-import] GAGAL "${name}": sheet ditemukan -> ${found}`);
    const e = new Error(
      `Tidak ada data yang dikenali. Sheet di file Anda: ${found}. Gunakan file dari tombol "Template Excel", atau workbook LK Neraca Hutan asli (sheet: Jati Jawa, Rimba Jawa, Rimba Luar Jawa, Data Penunjang).`
    );
    e.status = 400;
    throw e;
  }

  const years = yearSet.size
    ? Array.from(yearSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    : [...base.years];

  // Scaffold lengkap (semua sheet ada), nilai diambil hanya dari file.
  const sheets = {};
  REGIONAL_SHEETS.forEach((shName) => {
    const m = base.sheets[shName];
    sheets[shName] = {
      name: shName,
      commodity: m.commodity,
      region: m.region,
      years: [...years],
      physical: {},
      rent: {},
      monetary: {},
    };
  });
  const dpMeta = base.sheets["Data Penunjang"];
  sheets["Data Penunjang"] = {
    name: "Data Penunjang",
    commodity: dpMeta.commodity,
    region: dpMeta.region,
    years: [...years],
    records: dpMeta.records.map((r) => ({ id: r.id, name: r.name, satuan: r.satuan, values: {} })),
  };

  let cells = 0;
  updates.forEach((u) => {
    const sh = sheets[u.sheet];
    if (!sh) return;
    if (u.section === "data_penunjang") {
      const rec = (sh.records || []).find((r) => r.id === u.row);
      if (rec) {
        rec.values[u.year] = u.value;
        cells += 1;
      }
    } else {
      if (!sh[u.section]) sh[u.section] = {};
      if (!sh[u.section][u.row]) sh[u.section][u.row] = {};
      sh[u.section][u.row][u.year] = u.value;
      cells += 1;
    }
  });

  // Unit Rent dari sheet "lebar" (mis. "GOS per unit") hanya dipakai sebagai
  // cadangan bila sheet regional itu sendiri tidak memiliki Unit Rent.
  Object.entries(wideRent).forEach(([shName, series]) => {
    const sh = sheets[shName];
    if (!sh) return;
    if (Object.keys(sh.rent.unitRent || {}).length > 0) return;
    sh.rent.unitRent = sh.rent.unitRent || {};
    Object.entries(series).forEach(([y, v]) => {
      if (sh.rent.unitRent[y] === undefined) {
        sh.rent.unitRent[y] = v;
        cells += 1;
      }
    });
  });

  const imported = { meta: base.meta, years, sheets };
  recalculateAll(imported);

  // Dump MENTAH semua cell dari semua sheet (termasuk nilai formula cached)
  // agar pengguna bisa melihat isi file Excel apa adanya di tab "Import Mentah".
  const rawSheets = [];
  wb.eachSheet((ws) => {
    if (!includeHidden && ws.state && ws.state !== "visible") return;
    const cells = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const raw = cell.value;
        if (raw === null || raw === undefined || raw === "") return;
        let v = null;
        let t = "text";
        if (typeof raw === "number") { v = raw; t = "number"; }
        else if (raw instanceof Date) { v = raw.toISOString().slice(0, 10); t = "date"; }
        else if (raw && typeof raw === "object") {
          if (raw.formula !== undefined || raw.sharedFormula !== undefined) {
            v = toNumber(raw.result);
            t = v !== null ? "formula" : "formula-empty";
          } else if (Array.isArray(raw.richText)) {
            v = raw.richText.map((x) => x.text || "").join("");
          } else if (raw.text !== undefined) { v = raw.text; }
          else if (raw.hyperlink !== undefined) { v = raw.hyperlink; t = "link"; }
          else { v = cellText(raw); }
        } else { v = String(raw); }
        if (v === null || v === "" || v === undefined) {
          if (t !== "formula-empty") return;
          v = "";
        }
        cells.push({ r, c, v, t });
      });
    });
    rawSheets.push({
      name: ws.name,
      state: ws.state || "visible",
      rowCount: ws.rowCount,
      colCount: ws.columnCount,
      cells,
    });
  });

  const s = loadOrInit();
  const label = String(name || "Import Excel").trim().slice(0, 120) || "Import Excel";
  const ds = makeDataset(label, "import", {
    ...imported,
    rawSheets,
  }, {
    includeHidden,
    sourceBase64: options.sourceBase64 || null,
    sourceFilename: name || null,
  });
  if (!skipSave) {
    s.datasets.push(ds);
    s.activeDatasetId = ds.id;
    save();
  }

  console.log(
    `[neraca-import] OK "${name}": ${cells} sel, ${matchedSheets.length} sheet (${matchedSheets.join(", ")}), hidden=${includeHidden ? "disertakan" : "dilewati"}`
  );
  return { dataset: ds, stats: { sheets: matchedSheets.length, cells, years, includeHidden } };
}

// Re-parse dataset aktif dari file Excel asli yang tersimpan, dengan mode
// includeHidden baru. Mengganti data di tempat (tidak membuat dataset baru).
async function reimportActiveDataset(includeHidden) {
  const s = loadOrInit();
  const ds = s.datasets.find((d) => d.id === s.activeDatasetId);
  if (!ds) {
    const err = new Error("Dataset aktif tidak ditemukan!");
    err.status = 404;
    throw err;
  }
  if (!ds.sourceBase64) {
    const err = new Error(
      "Dataset ini tidak memiliki file Excel asli tersimpan (dataset baseline). Import file Excel terlebih dahulu, lalu ubah toggle."
    );
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(String(ds.sourceBase64).replace(/^data:.*;base64,/, ""), "base64");
  const { dataset: newDs, stats } = await createDatasetFromImport(buffer, ds.sourceFilename || ds.name, {
    includeHidden,
    sourceBase64: ds.sourceBase64,
    _skipSave: true,
  });
  // Ganti data dataset lama dengan hasil reparse, pertahankan id & nama.
  ds.data = newDs.data;
  ds.includeHidden = includeHidden;
  ds.sourceFilename = newDs.sourceFilename;
  ds.updatedAt = new Date().toISOString();
  s.activeDatasetId = ds.id;
  save();
  console.log(
    `[neraca-reimport] OK "${ds.name}": ${stats.cells} sel, hidden=${includeHidden ? "disertakan" : "dilewati"}`
  );
  return { stats };
}

function createNeracaRouter({ onChange } = {}) {
  const router = express.Router();
  const notifyChange = (action) => {
    if (onChange) onChange({ action, updatedAt: new Date().toISOString() });
  };
  const logActivity = (req, action, description, recordId = null) => {
    return logAudit({
      userId: req.user.id,
      action,
      module: "neraca",
      description,
      recordId,
      req,
    });
  };

  router.get("/", (_req, res) => {
    res.json(neracaResponse());
  });

  router.post("/cell", async (req, res) => {
    const { updates, datasetId, sheet, section, row, year, value } = req.body || {};
    if (Array.isArray(updates) && updates.length > 0) {
      try {
        const updatesByDataset = new Map();
        updates.forEach((update) => {
          const targetId = update.datasetId || datasetId || activeDataset().id;
          if (!updatesByDataset.has(targetId)) updatesByDataset.set(targetId, []);
          updatesByDataset.get(targetId).push(update);
        });

        const oldCells = [];
        const newCells = [];
        updatesByDataset.forEach((datasetUpdates, targetId) => {
          const ds = getDataset(targetId);
          const data = ds.data;
          datasetUpdates.forEach((u) => {
            const sh = data.sheets[u.sheet];
            if (!sh) return;
            const numVal = parseFloat(u.value);
            const cleanVal = isNaN(numVal) ? 0 : numVal;
            const cell = {
              datasetId: targetId,
              sheet: u.sheet,
              section: u.section,
              row: u.row,
              year: String(u.year),
            };
            oldCells.push({ ...cell, value: getNeracaCellValue(cell) });
            newCells.push({ ...cell, value: cleanVal });
            if (u.section === "data_penunjang") {
              const rec = (sh.records || []).find((r) => r.id === u.row);
              if (rec) rec.values[u.year] = cleanVal;
            } else {
              if (!sh[u.section]) sh[u.section] = {};
              if (!sh[u.section][u.row]) sh[u.section][u.row] = {};
              sh[u.section][u.row][u.year] = cleanVal;
            }
          });
          recalculateAll(data);
          ds.updatedAt = new Date().toISOString();
        });
        save();
        notifyChange("cell");
        await logAudit({
          userId: req.user.id,
          action: "edit",
          module: "neraca",
          description: `Mengubah ${updates.length} nilai pada Input & Pengolahan Neraca Hutan`,
          oldData: { cells: oldCells },
          newData: { cells: newCells },
          req,
        });
        return res.json({
          message: "Seluruh data berhasil diperbarui dan formulasi dihitung ulang!",
          ...neracaResponse(),
        });
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    }
    if (!sheet || !section || !row || !year) {
      return res.status(400).json({ error: "Parameter sheet, section, row, dan year wajib diisi!" });
    }
    try {
      const cell = {
        datasetId: datasetId || activeDataset().id,
        sheet,
        section,
        row,
        year: String(year),
      };
      const oldValue = getNeracaCellValue(cell);
      updateCell({ datasetId, sheet, section, row, year, value });
      notifyChange("cell");
      await logAudit({
        userId: req.user.id,
        action: "edit",
        module: "neraca",
        description: `Mengubah nilai pada Input & Pengolahan Neraca Hutan (${sheet})`,
        oldData: { cells: [{ ...cell, value: oldValue }] },
        newData: { cells: [{ ...cell, value: getNeracaCellValue(cell) }] },
        req,
      });
      res.json({ message: "Sel berhasil diperbarui dan formulasi dihitung ulang!", ...neracaResponse() });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post("/tahun", async (req, res) => {
    try {
      const data = addYear(req.body ? req.body.year : undefined);
      notifyChange("year");
      await logActivity(req, "update", `Menambahkan tahun ${data.years[data.years.length - 1]} pada Input & Pengolahan Neraca Hutan`);
      res.json({
        message: `Tahun ${data.years[data.years.length - 1]} berhasil ditambahkan ke seluruh tabel!`,
        ...neracaResponse(),
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post("/reset", async (req, res) => {
    resetData();
    notifyChange("reset");
    await logActivity(req, "clean", "Mengembalikan angka dataset aktif Neraca Hutan ke baseline BPS");
    res.json({
      message: "Angka dataset aktif dikembalikan ke baseline acuan BPS!",
      ...neracaResponse(),
    });
  });

  // ---- Manajemen dataset ----
  router.get("/datasets", (_req, res) => {
    const s = loadOrInit();
    res.json({ activeDatasetId: s.activeDatasetId, datasets: datasetList() });
  });

  router.post("/datasets/select", async (req, res) => {
    try {
      selectDataset((req.body || {}).id);
      notifyChange("dataset-selected");
      await logActivity(req, "update", "Mengganti dataset aktif Input & Pengolahan Neraca Hutan");
      res.json({ message: "Dataset aktif diganti.", ...neracaResponse() });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post("/datasets/rename", async (req, res) => {
    try {
      renameDataset((req.body || {}).id, (req.body || {}).name);
      notifyChange("dataset-renamed");
      await logActivity(req, "update", "Mengubah nama dataset Input & Pengolahan Neraca Hutan");
      res.json({ message: "Nama dataset diperbarui.", ...neracaResponse() });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.delete("/datasets/:id", async (req, res) => {
    try {
      deleteDataset(req.params.id);
      notifyChange("dataset-deleted");
      await logActivity(req, "delete", "Menghapus dataset Input & Pengolahan Neraca Hutan");
      res.json({ message: "Dataset dihapus.", ...neracaResponse() });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.get("/export/csv", (req, res) => {
    const data = activeData();
    const targetSheet = req.query.sheet || "Indonesia";
    const csv = buildCsv(data, targetSheet);
    if (csv === null) return res.status(404).send("Sheet tidak ditemukan");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Neraca_${String(targetSheet).replace(/\s+/g, "_")}.csv"`
    );
    res.send(csv);
  });

  router.get("/template", async (_req, res, next) => {
    try {
      const data = activeData();
      const wb = buildTemplateWorkbook(data);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", 'attachment; filename="Template_Neraca_Hutan.xlsx"');
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      next(err);
    }
  });

  router.post("/import", async (req, res) => {
    try {
      const { base64, filename, includeHidden } = req.body || {};
      if (!base64) return res.status(400).json({ error: "File Excel tidak ditemukan!" });
      const buffer = Buffer.from(String(base64).replace(/^data:.*;base64,/, ""), "base64");
      const { stats } = await createDatasetFromImport(buffer, filename || "Import Excel", {
        includeHidden: includeHidden !== false,
        sourceBase64: base64,
      });
      notifyChange("dataset-imported");
      await logActivity(req, "import", `Mengimpor dataset "${filename || "file.xlsx"}" ke Input & Pengolahan Neraca Hutan`);
      res.json({
        message:
          `Dataset baru dibuat dari "${filename || "file.xlsx"}" (${stats.cells} sel, ${stats.sheets} sheet` +
          `${stats.includeHidden ? ", termasuk data tersembunyi" : ", data tersembunyi dilewati"}). Data lama tidak diubah.`,
        ...neracaResponse(),
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Re-parse dataset aktif dari file Excel asli dengan mode includeHidden baru.
  router.post("/reimport-hidden", async (req, res) => {
    try {
      const includeHidden = (req.body || {}).includeHidden !== false;
      const { stats } = await reimportActiveDataset(includeHidden);
      notifyChange("dataset-reimported");
      await logActivity(req, "update", "Memperbarui dataset Neraca Hutan dari file Excel sumber");
      res.json({
        message:
          `Dataset diperbarui: ${stats.cells} sel` +
          `${includeHidden ? ", data tersembunyi DISERTAKAN" : ", data tersembunyi DILEWATI"}.`,
        ...neracaResponse(),
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = {
  createNeracaRouter,
  recalculateAll,
  getInitialSpreadsheetData,
  buildTemplateWorkbook,
  createDatasetFromImport,
  readNeracaCellValues,
  applyNeracaCellValues,
  classifyOriginalRow,
  classifyColumnLabel,
  matchPenunjangRecord,
  detectWideUnitRent,
};
