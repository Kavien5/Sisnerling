import React from "react";
import { api } from "../api.js";
import { canEditData } from "../auth.js";
import Logo from "../components/Logo.jsx";
import TimberLogo from "../components/TimberLogo.jsx";
import { useToast } from "../components/Toast.jsx";
import {
  IconAlert,
  IconCheck,
  IconCoins,
  IconRotate,
  IconTable,
} from "../components/Icons.jsx";
import "./InputPengolahanNeraca.css";
import "./HasilPengolahanNeraca.css";

const SHEETS = [
  { name: "Jati Jawa", kind: "regional", region: "Pulau Jawa", rateLabel: "Discount Rate" },
  { name: "Rimba Jawa", kind: "regional", region: "Pulau Jawa", rateLabel: "Government Bond-Inflasi" },
  { name: "Rimba Luar Jawa", kind: "regional", region: "Luar Jawa", rateLabel: "Government Bond-Inflasi" },
  { name: "Rekap JJ", kind: "recapRegional", source: "Jati Jawa", region: "Pulau Jawa" },
  { name: "Rekap RJ", kind: "recapRegional", source: "Rimba Jawa", region: "Pulau Jawa" },
  { name: "Rekap RLJ", kind: "recapRegional", source: "Rimba Luar Jawa", region: "Luar Jawa" },
  { name: "Rekap", kind: "recapNational", region: "Indonesia" },
];

const REGIONAL_SHEETS = SHEETS.filter((sheet) => sheet.kind === "regional").map((sheet) => sheet.name);
const REGIONAL_YEARS = Array.from({ length: 17 }, (_, index) => 2008 + index);
const NATIONAL_YEARS = Array.from({ length: 35 }, (_, index) => 1990 + index);
const DISPLAY_YEARS = [2020, 2021, 2022, 2023, 2024];

const FIELDS = [
  "persediaanAwal",
  "pertumbuhan",
  "penanaman",
  "konversiKerusakan",
  "penebangan",
  "bondRate",
  "gos",
  "moneterAwal",
  "moneterPertumbuhan",
  "moneterPenanaman",
  "moneterKerusakan",
  "moneterPenebangan",
  "moneterRevaluasi",
  "moneterAkhir",
];

const EMPTY_VALUES = FIELDS.reduce((acc, field) => {
  acc[field] = 0;
  return acc;
}, {});

const numberFormatter = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

function num(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round(value) {
  return Math.round(num(value) * 1e6) / 1e6;
}

function formatNumber(value) {
  return Number.isFinite(num(value)) ? numberFormatter.format(num(value)) : "—";
}

function discountFactor(rate, years) {
  if (!Number.isFinite(years) || years <= 0) return 0;
  if (rate === 0) return 1;
  return (1 / years) * ((1 - Math.pow(1 + rate, -years)) / rate);
}

function physicalFromValues(values, previous) {
  const persediaanAkhir = round(
    values.persediaanAwal +
      values.pertumbuhan +
      values.penanaman -
      values.konversiKerusakan -
      values.penebangan
  );
  return {
    persediaanAwal: num(values.persediaanAwal),
    pertumbuhan: num(values.pertumbuhan),
    penanaman: num(values.penanaman),
    konversiKerusakan: num(values.konversiKerusakan),
    penebangan: num(values.penebangan),
    persediaanAkhir,
    perkiraanCadangan: values.penebangan > 0 ? persediaanAkhir / values.penebangan : 0,
    lajuPersediaanAkhir:
      previous && previous.fisik.persediaanAkhir
        ? (persediaanAkhir / previous.fisik.persediaanAkhir) * 100 - 100
        : 0,
  };
}

function calculateRegional(valuesByYear) {
  const rows = [];
  REGIONAL_YEARS.forEach((year, index) => {
    const values = valuesByYear.get(year) || EMPTY_VALUES;
    const previous = index > 0 ? rows[index - 1] : null;
    const fisik = physicalFromValues(values, previous);
    const resourceRent = (num(values.gos) * fisik.penebangan) / 1e6;
    const umurCadangan = fisik.perkiraanCadangan;
    const faktorDiskon = discountFactor(num(values.bondRate), umurCadangan);
    const npv = resourceRent * umurCadangan * faktorDiskon;
    const npvPerStok = fisik.persediaanAkhir > 0 ? (npv / fisik.persediaanAkhir) * 1e6 : 0;
    const skala = npvPerStok / 1e6;
    const nilaiFisikSebelumnya = previous ? previous.values : EMPTY_VALUES;
    const stokFisikSebelumnya = previous ? previous.fisik.persediaanAkhir : 0;
    const moneter = previous
      ? {
          persediaanAwal: previous.npv.npv,
          pertumbuhan: num(nilaiFisikSebelumnya.pertumbuhan) * skala,
          penanaman: num(nilaiFisikSebelumnya.penanaman) * skala,
          konversiKerusakan: num(nilaiFisikSebelumnya.konversiKerusakan) * skala,
          penebangan: num(nilaiFisikSebelumnya.penebangan) * skala,
          revaluasi:
            ((npvPerStok - previous.npv.npvPerStok) * num(nilaiFisikSebelumnya.persediaanAwal)) /
            1e6,
          stokAkhir: npv,
          unitRent: stokFisikSebelumnya > 0 ? (npv / stokFisikSebelumnya) * 1000 : 0,
        }
      : {
          persediaanAwal: 0,
          pertumbuhan: 0,
          penanaman: 0,
          konversiKerusakan: 0,
          penebangan: 0,
          revaluasi: 0,
          stokAkhir: 0,
          unitRent: 0,
        };
    moneter.cek = round(
      moneter.persediaanAwal +
        moneter.pertumbuhan +
        moneter.penanaman -
        moneter.konversiKerusakan -
        moneter.penebangan +
        moneter.revaluasi -
        moneter.stokAkhir
    );
    rows.push({
      year,
      values,
      fisik,
      npv: {
        bondRate: num(values.bondRate),
        gos: num(values.gos),
        resourceRent,
        umurCadangan,
        faktorDiskon,
        npv,
        npvPerStok,
      },
      moneter,
    });
  });
  return rows;
}

function calculateNational(valuesByYear, regionalRows) {
  const rows = [];
  NATIONAL_YEARS.forEach((year, index) => {
    const previous = index > 0 ? rows[index - 1] : null;
    if (year >= 2008) {
      const offset = year - 2008;
      const sum = (pick) => REGIONAL_SHEETS.reduce((total, sheet) => total + num(pick(regionalRows[sheet][offset])), 0);
      const fisik = {
        persediaanAwal: sum((row) => row.fisik.persediaanAwal),
        pertumbuhan: sum((row) => row.fisik.pertumbuhan),
        penanaman: sum((row) => row.fisik.penanaman),
        konversiKerusakan: sum((row) => row.fisik.konversiKerusakan),
        penebangan: sum((row) => row.fisik.penebangan),
        persediaanAkhir: sum((row) => row.fisik.persediaanAkhir),
        perkiraanCadangan: sum((row) => row.fisik.persediaanAkhir) / Math.max(sum((row) => row.fisik.penebangan), 1e-9),
        lajuPersediaanAkhir:
          previous && previous.fisik.persediaanAkhir
            ? (sum((row) => row.fisik.persediaanAkhir) / previous.fisik.persediaanAkhir) * 100 - 100
            : 0,
      };
      const moneter = {
        persediaanAwal: sum((row) => row.moneter.persediaanAwal),
        pertumbuhan: sum((row) => row.moneter.pertumbuhan),
        penanaman: sum((row) => row.moneter.penanaman),
        konversiKerusakan: sum((row) => row.moneter.konversiKerusakan),
        penebangan: sum((row) => row.moneter.penebangan),
        revaluasi: sum((row) => row.moneter.revaluasi),
        stokAkhir: sum((row) => row.moneter.stokAkhir),
        unitRent: 0,
      };
      rows.push({ year, valuesByYear: null, fisik, moneter, historical: false });
      return;
    }
    const values = valuesByYear.get(year);
    const fisik = physicalFromValues(values || EMPTY_VALUES, previous);
    const source = values || EMPTY_VALUES;
    const moneter = {
      persediaanAwal: num(source.moneterAwal),
      pertumbuhan: num(source.moneterPertumbuhan),
      penanaman: num(source.moneterPenanaman),
      konversiKerusakan: num(source.moneterKerusakan),
      penebangan: num(source.moneterPenebangan),
      revaluasi: num(source.moneterRevaluasi),
      stokAkhir: 0,
      unitRent: 0,
    };
    moneter.stokAkhir = round(
      moneter.persediaanAwal +
        moneter.pertumbuhan +
        moneter.penanaman -
        moneter.konversiKerusakan -
        moneter.penebangan +
        moneter.revaluasi
    );
    rows.push({ year, valuesByYear: values, fisik, moneter, historical: true });
  });
  return rows;
}

const PHYSICAL_INPUT_COLUMNS = [
  { key: "persediaanAwal", label: "Persediaan Awal" },
  { key: "pertumbuhan", label: "Pertumbuhan" },
  { key: "penanaman", label: "Penanaman" },
  { key: "konversiKerusakan", label: "Konversi & Kerusakan" },
  { key: "penebangan", label: "Penebangan" },
];

const PHYSICAL_FORMULA_COLUMNS = [
  { key: "persediaanAkhir", label: "Persediaan Akhir" },
  { key: "perkiraanCadangan", label: "Perkiraan Cadangan" },
  { key: "lajuPersediaanAkhir", label: "Laju Persediaan Akhir" },
];

const NPV_INPUT_COLUMNS = [
  { key: "bondRate", label: "Discount Rate" },
  { key: "gos", label: "GOS per unit (Rp/m3)" },
];

const NPV_FORMULA_COLUMNS = [
  { key: "resourceRent", label: "Resource Rent (miliar Rp)" },
  { key: "umurCadangan", label: "Umur Cadangan" },
  { key: "faktorDiskon", label: "Discount Factor" },
  { key: "npv", label: "NPV (miliar Rp)" },
  { key: "npvPerStok", label: "NPV per Stok Akhir (Rp/m3)" },
];

const MONETARY_FORMULA_COLUMNS = [
  { key: "persediaanAwal", label: "Persediaan Awal" },
  { key: "pertumbuhan", label: "Pertumbuhan" },
  { key: "penanaman", label: "Penanaman" },
  { key: "konversiKerusakan", label: "Konversi & Kerusakan" },
  { key: "penebangan", label: "Penebangan" },
  { key: "revaluasi", label: "Revaluasi" },
  { key: "stokAkhir", label: "Stok Akhir" },
  { key: "unitRent", label: "Unit Rent (ribu Rp/m3)" },
];

const RECAP_PHYSICAL_ROWS = [
  { label: "1. Persediaan awal", get: (row) => row.fisik.persediaanAwal },
  { label: "2. Penambahan", get: (row) => row.fisik.pertumbuhan + row.fisik.penanaman },
  { label: "Pertumbuhan", get: (row) => row.fisik.pertumbuhan },
  { label: "Penanaman", get: (row) => row.fisik.penanaman },
  { label: "3.Pengurangan", get: (row) => row.fisik.konversiKerusakan + row.fisik.penebangan },
  { label: "Kerusakan", get: (row) => row.fisik.konversiKerusakan },
  { label: "Penebangan", get: (row) => row.fisik.penebangan },
  { label: "4. Persediaan akhir", get: (row) => row.fisik.persediaanAkhir },
];

const RECAP_MONETARY_ROWS = [
  { label: "1. Persediaan awal", get: (row) => row.moneter.persediaanAwal },
  { label: "2. Penambahan", get: (row) => row.moneter.pertumbuhan + row.moneter.penanaman },
  { label: "Pertumbuhan", get: (row) => row.moneter.pertumbuhan },
  { label: "Penanaman", get: (row) => row.moneter.penanaman },
  { label: "3.Pengurangan", get: (row) => row.moneter.konversiKerusakan + row.moneter.penebangan },
  { label: "Kerusakan", get: (row) => row.moneter.konversiKerusakan },
  { label: "Penebangan", get: (row) => row.moneter.penebangan },
  { label: "4. Revaluasi", get: (row) => row.moneter.revaluasi },
  { label: "5. Persediaan akhir", get: (row) => row.moneter.stokAkhir },
];

function InputCell({ value, editable, onChange, title }) {
  if (!editable) return <td className="cell-input" title={title}>{formatNumber(value)}</td>;
  return (
    <td className="cell-input" title={title || "Input manual"}>
      <input
        type="number"
        step="any"
        value={value === 0 ? "" : String(value)}
        onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
      />
    </td>
  );
}

function FormulaCell({ value, title }) {
  return (
    <td className="cell-formula" title={title || "Dihitung otomatis (fx)"}>
      {formatNumber(value)} <span className="fx-tag">fx</span>
    </td>
  );
}

function Panel({ icon, title, description, children }) {
  return (
    <section className="hpn-panel">
      <div className="hpn-panel-heading">
        <div className="hpn-panel-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="hpn-table-wrap">{children}</div>
    </section>
  );
}

export default function HasilPengolahanNeraca({ user }) {
  const toast = useToast();
  const canEdit = canEditData(user);
  const [allRecords, setAllRecords] = React.useState([]);
  const recordsRef = React.useRef(allRecords);
  const [activeSheet, setActiveSheet] = React.useState(SHEETS[0].name);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [saveError, setSaveError] = React.useState("");
  const [lastSavedAt, setLastSavedAt] = React.useState(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [dirty, setDirty] = React.useState(() => new Set());
  const pendingSaves = React.useRef(new Map());
  const autosaveTimer = React.useRef(null);
  const savingRef = React.useRef(false);

  const setRecords = React.useCallback((updater) => {
    const next = typeof updater === "function" ? updater(recordsRef.current) : updater;
    recordsRef.current = next;
    setAllRecords(next);
    return next;
  }, []);

  const flushPending = React.useCallback(async () => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (savingRef.current) return;
    const entries = [...pendingSaves.current.values()];
    if (!entries.length) return;

    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    let failed = 0;
    let savedCount = 0;
    let latestUpdatedAt = null;

    for (const entry of entries) {
      if (!pendingSaves.current.has(entry.key)) continue;
      try {
        const saved = await api.saveTimberHasil(entry.sheet, entry.year, entry.values);
        setRecords((prev) =>
          prev.map((item) =>
            item.sheet === entry.sheet && Number(item.year) === entry.year
              ? { ...item, values: saved.values, updatedAt: saved.updatedAt }
              : item
          )
        );
        setDirty((prev) => {
          const next = new Set(prev);
          next.delete(entry.key);
          return next;
        });
        pendingSaves.current.delete(entry.key);
        latestUpdatedAt = saved.updatedAt || latestUpdatedAt;
        savedCount += 1;
      } catch {
        failed += 1;
      }
    }

    if (latestUpdatedAt) setLastSavedAt(latestUpdatedAt);
    setSaving(false);
    savingRef.current = false;
    if (failed) {
      const message = `${failed} perubahan belum tersimpan. Periksa MySQL lalu klik "Simpan Perubahan".`;
      setSaveError(message);
      toast(message, "error");
    } else if (savedCount) {
      toast(`${savedCount} perubahan tersimpan di database.`, "success");
    }
  }, [setRecords, toast]);

  const scheduleAutosave = React.useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      flushPending();
    }, 400);
  }, [flushPending]);

  React.useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (pendingSaves.current.size) flushPending();
    };
  }, [flushPending]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .getTimberHasil()
      .then((response) => {
        if (!active) return;
        if (!Array.isArray(response.rows)) {
          throw new Error("Format data hasil Timber dari server tidak valid.");
        }
        setRecords(response.rows);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Gagal memuat hasil pengolahan Timber.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, setRecords]);

  const valuesBySheet = React.useMemo(() => {
    const result = new Map();
    allRecords.forEach((record) => {
      const sheet = String(record.sheet || "");
      const year = Number(record.year);
      if (!result.has(sheet)) result.set(sheet, new Map());
      result.get(sheet).set(year, { ...EMPTY_VALUES, ...(record.values || {}) });
    });
    return result;
  }, [allRecords]);

  const regionalRows = React.useMemo(() => {
    const result = {};
    REGIONAL_SHEETS.forEach((sheet) => {
      result[sheet] = calculateRegional(valuesBySheet.get(sheet) || new Map());
    });
    return result;
  }, [valuesBySheet]);

  const nationalRows = React.useMemo(
    () => calculateNational(valuesBySheet.get("Rekap") || new Map(), regionalRows),
    [valuesBySheet, regionalRows]
  );

  const activeMeta = SHEETS.find((sheet) => sheet.name === activeSheet) || SHEETS[0];
  const activeRows =
    activeMeta.kind === "regional"
      ? regionalRows[activeSheet]
      : activeMeta.kind === "recapRegional"
        ? regionalRows[activeMeta.source]
        : nationalRows;
  const activeVisibleRows = activeRows.filter((row) => DISPLAY_YEARS.includes(row.year));
  const latest = activeVisibleRows[activeVisibleRows.length - 1];
  const dirtyCount = dirty.size;

  const handleCellChange = (sheet, year, field, rawValue) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;

    const yearValue = Number(year);
    const key = `${sheet}:${yearValue}`;
    const prev = recordsRef.current;
    const index = prev.findIndex(
      (record) => record.sheet === sheet && Number(record.year) === yearValue
    );
    const current =
      index >= 0
        ? prev[index]
        : { sheet, year: yearValue, values: { ...EMPTY_VALUES }, updatedAt: null };
    const next = {
      ...current,
      values: { ...current.values, [field]: value },
    };
    const nextRecords =
      index >= 0
        ? [...prev.slice(0, index), next, ...prev.slice(index + 1)]
        : [...prev, next];

    setRecords(nextRecords);
    pendingSaves.current.set(key, { key, sheet, year: yearValue, values: next.values });
    setDirty((previous) => new Set(previous).add(key));
    setSaveError("");
    scheduleAutosave();
  };

  const renderRegional = () => (
    <>
      <Panel
        icon={<IconTable size={17} />}
        title={`Tabel 1. Neraca Fisik ${activeSheet} (000m3)`}
        description="Sel putih diisi manual. Persediaan akhir, perkiraan cadangan, dan laju dihitung otomatis."
      >
        <table className="spreadsheet-grid timber-grid">
          <thead>
            <tr>
              <th>Tahun</th>
              {PHYSICAL_INPUT_COLUMNS.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              {PHYSICAL_FORMULA_COLUMNS.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeVisibleRows.map((row) => (
              <tr key={`fisik-${row.year}`}>
                <th scope="row">{row.year}</th>
                {PHYSICAL_INPUT_COLUMNS.map((column) => (
                  <InputCell
                    key={column.key}
                    value={row.values[column.key]}
                    editable={canEdit}
                    onChange={(value) => handleCellChange(activeSheet, row.year, column.key, value)}
                  />
                ))}
                {PHYSICAL_FORMULA_COLUMNS.map((column) => (
                  <FormulaCell key={column.key} value={row.fisik[column.key]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel
        icon={<IconCoins size={17} />}
        title={`Tabel 2. Penghitungan NPV ${activeSheet}`}
        description="Discount rate dan GOS per unit diisi manual; resource rent, discount factor, dan NPV memakai rumus."
      >
        <table className="spreadsheet-grid timber-grid">
          <thead>
            <tr>
              <th>Tahun</th>
              <th>{activeMeta.rateLabel}</th>
              {NPV_INPUT_COLUMNS.slice(1).map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              {NPV_FORMULA_COLUMNS.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeVisibleRows.map((row) => (
              <tr key={`npv-${row.year}`}>
                <th scope="row">{row.year}</th>
                {NPV_INPUT_COLUMNS.map((column) => (
                  <InputCell
                    key={column.key}
                    value={row.values[column.key]}
                    editable={canEdit}
                    onChange={(value) => handleCellChange(activeSheet, row.year, column.key, value)}
                  />
                ))}
                {NPV_FORMULA_COLUMNS.map((column) => (
                  <FormulaCell key={column.key} value={row.npv[column.key]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel
        icon={<IconCoins size={17} />}
        title={`Tabel 3. Neraca Moneter ${activeSheet} (miliar Rp)`}
        description="Nilai moneter diturunkan dari neraca fisik dan NPV per stok akhir sesuai relasi workbook."
      >
        <table className="spreadsheet-grid timber-grid">
          <thead>
            <tr>
              <th>Tahun</th>
              {MONETARY_FORMULA_COLUMNS.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>Cek</th>
            </tr>
          </thead>
          <tbody>
            {activeVisibleRows.map((row) => (
              <tr key={`moneter-${row.year}`}>
                <th scope="row">{row.year}</th>
                {MONETARY_FORMULA_COLUMNS.map((column) => (
                  <FormulaCell key={column.key} value={row.moneter[column.key]} />
                ))}
                <FormulaCell value={row.moneter.cek} />
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );

  const renderRecapTable = (rows, years, historical) => {
    const physicalEditable = (row, year, get) => {
      const definition = RECAP_PHYSICAL_ROWS.find((item) => item.get === get);
      const field = definition ? definition.label : "";
      const key =
        field.includes("Persediaan awal")
          ? "persediaanAwal"
          : field.includes("Pertumbuhan")
            ? "pertumbuhan"
            : field.includes("Penanaman")
              ? "penanaman"
              : field.includes("Kerusakan")
                ? "konversiKerusakan"
                : field.includes("Penebangan")
                  ? "penebangan"
                  : null;
      const record = valuesBySheet.get("Rekap")?.get(year);
      return key && record ? record[key] : 0;
    };
    return (
      <>
        <Panel
          icon={<IconTable size={17} />}
          title={`I. Neraca Fisik ${activeSheet} (000 M3)`}
          description="Rekap per tahun. Baris turunan memakai rumus; sel putih pada tahun historis bisa diisi manual."
        >
          <table className="spreadsheet-grid recap-grid">
            <thead>
              <tr>
                <th>Perincian</th>
                {years.map((year) => (
                  <th key={year}>{year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECAP_PHYSICAL_ROWS.map((definition) => (
                <tr key={`fisik-${definition.label}`}>
                  <th scope="row">{definition.label}</th>
                  {rows.map((row, index) => {
                    const editable = historical && row.historical &&
                      ["1. Persediaan awal", "Pertumbuhan", "Penanaman", "Kerusakan", "Penebangan"].includes(definition.label);
                    return editable ? (
                      <InputCell
                        key={row.year}
                        value={physicalEditable(row, row.year, definition.get)}
                        editable={canEdit}
                        onChange={(value) => handleCellChange("Rekap", row.year, {
                          "1. Persediaan awal": "persediaanAwal",
                          Pertumbuhan: "pertumbuhan",
                          Penanaman: "penanaman",
                          Kerusakan: "konversiKerusakan",
                          Penebangan: "penebangan",
                        }[definition.label], value)}
                      />
                    ) : (
                      <FormulaCell key={row.year} value={definition.get(row)} />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          icon={<IconCoins size={17} />}
          title={`III. Neraca Moneter ${activeSheet} (miliar Rp)`}
          description="Rekap moneter per tahun. Tahun 2008 ke atas diturunkan dari sheet regional."
        >
          <table className="spreadsheet-grid recap-grid">
            <thead>
              <tr>
                <th>Perincian</th>
                {years.map((year) => (
                  <th key={year}>{year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECAP_MONETARY_ROWS.map((definition) => (
                <tr key={`moneter-${definition.label}`}>
                  <th scope="row">{definition.label}</th>
                  {rows.map((row) => {
                    const editable = historical && row.historical;
                    const key = {
                      "1. Persediaan awal": "moneterAwal",
                      Pertumbuhan: "moneterPertumbuhan",
                      Penanaman: "moneterPenanaman",
                      Kerusakan: "moneterKerusakan",
                      Penebangan: "moneterPenebangan",
                      "4. Revaluasi": "moneterRevaluasi",
                    }[definition.label];
                    const record = valuesBySheet.get("Rekap")?.get(row.year);
                    return editable && key ? (
                      <InputCell
                        key={row.year}
                        value={record ? record[key] : 0}
                        editable={canEdit}
                        onChange={(value) => handleCellChange("Rekap", row.year, key, value)}
                      />
                    ) : (
                      <FormulaCell key={row.year} value={definition.get(row)} />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </>
    );
  };

  const renderRecapRegional = () =>
    renderRecapTable(
      activeRows
        .filter((row) => DISPLAY_YEARS.includes(row.year))
        .map((row) => ({ ...row, historical: false })),
      DISPLAY_YEARS,
      false
    );

  const renderRecapNational = () =>
    renderRecapTable(
      nationalRows.filter((row) => DISPLAY_YEARS.includes(row.year)),
      DISPLAY_YEARS,
      true
    );

  return (
    <div className="ipn-root hpn-root" data-theme="light">
      <header className="app-header">
        <div className="header-container">
          <div className="brand-wrapper">
            <div className="brand-icon">
              <Logo size={40} />
            </div>
            <div className="brand-info">
              <h1>
                SISNERLING{" "}
                <span className="brand-tag">
                  <TimberLogo size={18} />
                  LK Timber
                </span>
              </h1>
              <p>1. LK Kayu atau Timber (1).xlsx — layout, input manual, dan rumus otomatis</p>
            </div>
          </div>
          <div className="hpn-header-actions">
            <span
              className={`hpn-save-status${saveError ? " error" : saving ? " saving" : dirtyCount ? " pending" : ""}`}
              title={lastSavedAt ? `Tersimpan terakhir: ${lastSavedAt}` : "Perubahan disimpan otomatis ke MySQL"}
            >
              {saveError
                ? "Gagal menyimpan ke database"
                : saving
                  ? "Menyimpan ke database..."
                  : dirtyCount
                    ? "Menunggu simpan otomatis"
                    : "Tersimpan di database"}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (dirtyCount) {
                  flushPending().finally(() => setRefreshKey((key) => key + 1));
                } else {
                  setRefreshKey((key) => key + 1);
                }
              }}
              disabled={loading || saving}
            >
              <IconRotate size={14} />
              {loading ? "Memuat..." : "Muat Ulang"}
            </button>
            {canEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={flushPending}
                disabled={saving || !dirtyCount}
              >
                <IconCheck size={14} />
                {saving ? "Menyimpan..." : `Simpan Perubahan${dirtyCount ? ` (${dirtyCount})` : ""}`}
              </button>
            )}
          </div>
        </div>
      </header>

      {!canEdit && (
        <div className="hpn-info-banner">
          <IconAlert size={16} />
          <span>Akun ini hanya dapat melihat data hasil pengolahan Timber.</span>
        </div>
      )}

      {error && (
        <div className="hpn-error" role="alert">
          <b>Data belum berhasil dimuat.</b>
          <span>{error}</span>
        </div>
      )}

      {saveError && (
        <div className="hpn-error" role="alert">
          <b>Data belum tersimpan.</b>
          <span>{saveError}</span>
        </div>
      )}

      <div className="hpn-sheet-tabs" role="tablist" aria-label="Sheet Timber">
        {SHEETS.map((sheet) => (
          <button
            key={sheet.name}
            type="button"
            role="tab"
            aria-selected={sheet.name === activeSheet}
            className={`hpn-sheet-tab${sheet.name === activeSheet ? " active" : ""}`}
            onClick={() => setActiveSheet(sheet.name)}
          >
            {sheet.name}
          </button>
        ))}
      </div>

      <div className="ipn-dataset-bar hpn-toolbar">
        <span className="hpn-toolbar-note">
          Sumber: <b>1. LK Kayu atau Timber (1).xlsx</b> — sheet {activeMeta.name} ({activeMeta.region}) — fokus 2020–2024
        </span>
        <span className="hpn-legend">
          <i className="legend-input" /> input manual
          <i className="legend-formula" /> rumus otomatis (fx)
        </span>
      </div>

      <section className="hpn-summary" aria-label="Ringkasan hasil Timber">
        <article className="hpn-summary-card">
          <span>Tahun ditampilkan</span>
          <strong>{loading ? "—" : activeVisibleRows.length}</strong>
        </article>
        <article className="hpn-summary-card">
          <span>Persediaan Akhir Fisik terakhir (000 m3)</span>
          <strong>{loading || !latest ? "—" : formatNumber(latest.fisik.persediaanAkhir)}</strong>
        </article>
        <article className="hpn-summary-card">
          <span>Stok Akhir Moneter terakhir (miliar Rp)</span>
          <strong>{loading || !latest ? "—" : formatNumber(latest.moneter.stokAkhir)}</strong>
        </article>
      </section>

      {loading ? (
        <div className="hpn-panel hpn-empty">Memuatdata Timber...</div>
      ) : activeMeta.kind === "regional" ? (
        renderRegional()
      ) : activeMeta.kind === "recapRegional" ? (
        renderRecapRegional()
      ) : (
        renderRecapNational()
      )}
    </div>
  );
}
