import React from "react";
import { api } from "../api.js";
import { canEditData } from "../auth.js";
import Logo from "../components/Logo.jsx";
import Modal from "../components/Modal.jsx";
import { useToast } from "../components/Toast.jsx";
import {
  IconAlert,
  IconCheck,
  IconCoins,
  IconEdit,
  IconFileText,
  IconGrid,
  IconPlus,
  IconRotate,
  IconTable,
  IconTrash,
} from "../components/Icons.jsx";
import "./InputPengolahanNeraca.css";
import "./HasilPengolahanNeraca.css";

const SHEETS = [
  { name: "Jati Jawa", region: "Pulau Jawa" },
  { name: "Rimba Jawa", region: "Pulau Jawa" },
  { name: "Rimba Luar Jawa", region: "Luar Jawa" },
];

const FIELDS = [
  { key: "persediaanAwal", label: "Persediaan Awal", unit: "000 m3" },
  { key: "pertumbuhan", label: "Pertumbuhan", unit: "000 m3" },
  { key: "penanaman", label: "Penanaman", unit: "000 m3" },
  { key: "konversiKerusakan", label: "Konversi & Kerusakan", unit: "000 m3" },
  { key: "penebangan", label: "Penebangan", unit: "000 m3" },
  { key: "bondRate", label: "Government Bond-Inflasi", unit: "desimal" },
  { key: "gos", label: "GOS per unit", unit: "Rp/m3" },
];

const EMPTY_VALUES = {
  persediaanAwal: 0,
  pertumbuhan: 0,
  penanaman: 0,
  konversiKerusakan: 0,
  penebangan: 0,
  bondRate: 0,
  gos: 0,
};

const DEFAULT_YEARS = Array.from({ length: 17 }, (_, index) => 2008 + index);

const numberFormatter = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

function formatNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numberFormatter.format(numeric) : "—";
}

function round(value) {
  return Math.round(Number(value || 0) * 1e6) / 1e6;
}

function discountFactor(rate, years) {
  if (!Number.isFinite(rate) || !Number.isFinite(years) || years <= 0) return 0;
  if (rate === 0) return 1;
  return (1 / years) * ((1 - Math.pow(1 + rate, -years)) / rate);
}

function calculateRows(records) {
  const byYear = new Map(records.map((record) => [Number(record.year), record.values || EMPTY_VALUES]));
  const years = [...new Set([...DEFAULT_YEARS, ...byYear.keys()])].sort((a, b) => a - b);

  return years.map((year, index) => {
    const values = byYear.get(year) || EMPTY_VALUES;
    const previous = index > 0 ? years[index - 1] : null;
    const prev = previous ? byYear.get(previous) : null;

    const perubahanNeto = round(
      values.pertumbuhan + values.penanaman - values.konversiKerusakan - values.penebangan
    );
    const persediaanAkhir = round(values.persediaanAwal + perubahanNeto);
    const perkiraanCadangan = values.penebangan > 0 ? persediaanAkhir / values.penebangan : 0;
    const lajuPersediaanAkhir = prev
      ? (persediaanAkhir / (prev.persediaanAwal + prev.pertumbuhan + prev.penanaman - prev.konversiKerusakan - prev.penebangan) - 1) * 100
      : 0;
    const cekFisik = round(
      values.persediaanAwal + values.pertumbuhan + values.penanaman - values.konversiKerusakan - values.penebangan - persediaanAkhir
    );

    const resourceRent = (values.gos * values.penebangan) / 1e6;
    const faktorDiskon = discountFactor(values.bondRate, perkiraanCadangan);
    const npv = resourceRent * perkiraanCadangan * faktorDiskon;
    const npvPerStok = persediaanAkhir > 0 ? (npv / persediaanAkhir) * 1e6 : 0;

    const rowIndex = index - 1;
    const prevYear = rowIndex >= 0 ? years[rowIndex] : null;
    const prevValues = prevYear !== null ? byYear.get(prevYear) : null;
    const prevPerubahanNeto = prevValues
      ? prevValues.pertumbuhan + prevValues.penanaman - prevValues.konversiKerusakan - prevValues.penebangan
      : 0;
    const prevPersediaanAkhir = prevValues ? prevValues.persediaanAwal + prevPerubahanNeto : 0;
    const prevResourceRent = prevValues ? (prevValues.gos * prevValues.penebangan) / 1e6 : 0;
    const prevCadangan = prevValues && prevValues.penebangan > 0 ? prevPersediaanAkhir / prevValues.penebangan : 0;
    const prevNpv = prevResourceRent * prevCadangan * discountFactor(prevValues ? prevValues.bondRate : 0, prevCadangan);
    const prevNpvPerStok = prevPersediaanAkhir > 0 ? (prevNpv / prevPersediaanAkhir) * 1e6 : 0;
    const skalaMoneter = npvPerStok / 1e6;

    const moneter = {
      persediaanAwal: prevNpv,
      pertumbuhan: values.pertumbuhan * skalaMoneter,
      penanaman: values.penanaman * skalaMoneter,
      konversiKerusakan: values.konversiKerusakan * skalaMoneter,
      penebangan: values.penebangan * skalaMoneter,
      revaluasi: ((npvPerStok - prevNpvPerStok) * values.persediaanAwal) / 1e6,
      stokAkhir: npv,
      unitRent: persediaanAkhir > 0 ? (npv / persediaanAkhir) * 1000 : 0,
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

    return {
      year,
      values,
      fisik: {
        persediaanAwal: values.persediaanAwal,
        pertumbuhan: values.pertumbuhan,
        penanaman: values.penanaman,
        konversiKerusakan: values.konversiKerusakan,
        penebangan: values.penebangan,
        perubahanNeto,
        persediaanAkhir,
        perkiraanCadangan,
        lajuPersediaanAkhir,
        cekFisik,
      },
      npv: {
        bondRate: values.bondRate,
        gos: values.gos,
        resourceRent,
        umurCadangan: perkiraanCadangan,
        faktorDiskon,
        npv,
        npvPerStok,
      },
      moneter,
    };
  });
}

function FormulaCell({ value }) {
  return (
    <td className="cell-formula" title="Dihitung otomatis dari variabel terkait">
      {formatNumber(value)} <span className="formula-tag">fx</span>
    </td>
  );
}

export default function HasilPengolahanNeraca({ user }) {
  const toast = useToast();
  const canEdit = canEditData(user);
  const [allRecords, setAllRecords] = React.useState([]);
  const [activeSheet, setActiveSheet] = React.useState(SHEETS[0].name);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [dirty, setDirty] = React.useState(() => new Set());
  const [modal, setModal] = React.useState(null);
  const [form, setForm] = React.useState({ year: "", values: { ...EMPTY_VALUES } });
  const [formError, setFormError] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [addYearOpen, setAddYearOpen] = React.useState(false);
  const [newYear, setNewYear] = React.useState("");

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
        setAllRecords(response.rows);
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
  }, [refreshKey]);

  const records = React.useMemo(
    () => allRecords.filter((record) => record.sheet === activeSheet),
    [allRecords, activeSheet]
  );
  const rows = React.useMemo(() => calculateRows(records), [records]);
  const activeMeta = SHEETS.find((sheet) => sheet.name === activeSheet) || SHEETS[0];
  const latest = rows[rows.length - 1];
  const dirtyCount = React.useMemo(
    () => [...dirty].filter((key) => key.startsWith(`${activeSheet}:`)).length,
    [dirty, activeSheet]
  );

  const openAddModal = () => {
    setFormError("");
    setForm({ year: "", values: { ...EMPTY_VALUES } });
    setModal({ mode: "add" });
  };

  const openEditModal = (row) => {
    setFormError("");
    setForm({ year: String(row.year), values: { ...EMPTY_VALUES, ...row.values } });
    setModal({ mode: "edit", originalYear: row.year });
  };

  const submitForm = () => {
    const year = Number(form.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      setFormError("Tahun harus berupa bilangan bulat antara 1900 dan 2100.");
      return;
    }
    const exists = records.some(
      (record) => Number(record.year) === year && (modal.mode !== "edit" || Number(record.year) !== modal.originalYear)
    );
    if (exists) {
      setFormError(`Data tahun ${year} sudah ada pada sheet ${activeSheet}.`);
      return;
    }
    const values = {};
    for (const field of FIELDS) {
      const numeric = Number(form.values[field.key]);
      if (!Number.isFinite(numeric)) {
        setFormError(`${field.label} harus berupa angka.`);
        return;
      }
      if (numeric < 0) {
        setFormError(`${field.label} tidak boleh negatif.`);
        return;
      }
      values[field.key] = numeric;
    }

    if (modal.mode === "edit" && year !== modal.originalYear) {
      setAllRecords((prev) =>
        prev.filter((record) => !(record.sheet === activeSheet && Number(record.year) === modal.originalYear))
      );
      setDirty((prev) => {
        const next = new Set(prev);
        next.delete(`${activeSheet}:${modal.originalYear}`);
        return next;
      });
    }
    const nextRecord = { sheet: activeSheet, year, values, updatedAt: null };
    setAllRecords((prev) => {
      const filtered = prev.filter(
        (record) => !(record.sheet === activeSheet && Number(record.year) === year)
      );
      return [...filtered, nextRecord];
    });
    setDirty((prev) => new Set(prev).add(`${activeSheet}:${year}`));
    setModal(null);
    toast(`Data ${activeSheet} tahun ${year} siap disimpan.`, "info");
  };

  const saveChanges = async () => {
    const keys = [...dirty].filter((key) => key.startsWith(`${activeSheet}:`));
    if (!keys.length) {
      toast("Tidak ada perubahan yang perlu disimpan.", "info");
      return;
    }
    setSaving(true);
    let failed = 0;
    for (const key of keys) {
      const year = Number(key.split(":")[1]);
      const record = records.find((item) => Number(item.year) === year);
      if (!record) continue;
      try {
        const saved = await api.saveTimberHasil(activeSheet, year, record.values);
        setAllRecords((prev) =>
          prev.map((item) =>
            item.sheet === activeSheet && Number(item.year) === year
              ? { ...item, values: saved.values, updatedAt: saved.updatedAt }
              : item
          )
        );
        setDirty((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } catch {
        failed += 1;
      }
    }
    setSaving(false);
    if (failed) {
      toast(`${failed} data gagal disimpan. Periksa koneksi lalu coba lagi.`, "error");
    } else {
      toast(`${keys.length} data hasil pengolahan Timber berhasil disimpan.`, "success");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { year } = deleteTarget;
    setDeleteTarget(null);
    if (records.some((record) => Number(record.year) === year && !dirty.has(`${activeSheet}:${year}`))) {
      try {
        await api.deleteTimberHasil(activeSheet, year);
      } catch (deleteError) {
        toast(deleteError.message || "Gagal menghapus data.", "error");
        return;
      }
    }
    setAllRecords((prev) =>
      prev.filter((record) => !(record.sheet === activeSheet && Number(record.year) === year))
    );
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(`${activeSheet}:${year}`);
      return next;
    });
    toast(`Data ${activeSheet} tahun ${year} dihapus.`, "success");
  };

  const addYear = () => {
    const year = Number(newYear);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      toast("Tahun harus berupa bilangan bulat antara 1900 dan 2100.", "error");
      return;
    }
    if (records.some((record) => Number(record.year) === year)) {
      toast(`Tahun ${year} sudah ada.`, "error");
      return;
    }
    setFormError("");
    setForm({ year: String(year), values: { ...EMPTY_VALUES } });
    setModal({ mode: "add" });
    setAddYearOpen(false);
    setNewYear("");
  };

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
                SISNERLING <span className="brand-tag">Hasil Pengolahan</span>
              </h1>
              <p>Input Hasil Pengolahan Neraca Timber — Jati Jawa, Rimba Jawa, Rimba Luar Jawa</p>
            </div>
          </div>
          <div className="hpn-header-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading || saving}
            >
              <IconRotate size={14} />
              {loading ? "Memuat..." : "Muat Ulang"}
            </button>
            {canEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveChanges}
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
          <span>Akun User hanya dapat melihat data hasil pengolahan Timber.</span>
        </div>
      )}

      {error && (
        <div className="hpn-error" role="alert">
          <b>Data belum berhasil dimuat.</b>
          <span>{error}</span>
        </div>
      )}

      <div className="ipn-dataset-bar hpn-toolbar">
        <span className="ipn-dataset-label">Sheet Timber</span>
        <select
          className="ipn-dataset-select"
          value={activeSheet}
          onChange={(event) => setActiveSheet(event.target.value)}
        >
          {SHEETS.map((sheet) => (
            <option key={sheet.name} value={sheet.name}>
              {sheet.name}
            </option>
          ))}
        </select>
        {canEdit && (
          <>
            <button type="button" className="btn btn-primary" onClick={openAddModal}>
              <IconPlus size={14} /> Tambah Data
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAddYearOpen(true)}>
              <IconGrid size={14} /> Tambah Tahun
            </button>
          </>
        )}
        <span className="hpn-toolbar-note">
          Sumber: <b>2. LK Timber.xlsx</b> — sheet {activeMeta.name} ({activeMeta.region})
        </span>
      </div>

      <section className="hpn-summary" aria-label="Ringkasan hasil Timber">
        <article className="hpn-summary-card">
          <span>Tahun tersedia</span>
          <strong>{loading ? "—" : rows.length}</strong>
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

      <section className="hpn-panel">
        <div className="hpn-panel-heading">
          <div className="hpn-panel-icon"><IconTable size={17} /></div>
          <div>
            <h2>Tabel 1. Neraca Fisik {activeMeta.name} (000 m3)</h2>
            <p>Persediaan awal, pertumbuhan, penanaman, konversi &amp; kerusakan, dan penebangan merupakan variabel input.</p>
          </div>
        </div>
        <div className="hpn-table-wrap">
          <table className="spreadsheet-grid hpn-grid">
            <thead>
              <tr>
                <th>Tahun</th>
                <th>Persediaan Awal</th>
                <th>Pertumbuhan</th>
                <th>Penanaman</th>
                <th>Konversi &amp; Kerusakan</th>
                <th>Penebangan</th>
                <th>Perubahan Neto</th>
                <th>Persediaan Akhir</th>
                <th>Perkiraan Cadangan</th>
                <th>Laju Persediaan Akhir</th>
                <th>Cek Persediaan Akhir</th>
                {canEdit && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canEdit ? 12 : 11} className="hpn-empty">Memuat data...</td></tr>
              ) : rows.length ? (
                rows.map((row) => (
                  <tr key={`fisik-${row.year}`}>
                    <th scope="row">
                      {row.year}
                      {dirty.has(`${activeSheet}:${row.year}`) && <span className="hpn-dirty-dot" title="Belum disimpan" />}
                    </th>
                    <td className="cell-input">{formatNumber(row.fisik.persediaanAwal)}</td>
                    <td className="cell-input">{formatNumber(row.fisik.pertumbuhan)}</td>
                    <td className="cell-input">{formatNumber(row.fisik.penanaman)}</td>
                    <td className="cell-input">{formatNumber(row.fisik.konversiKerusakan)}</td>
                    <td className="cell-input">{formatNumber(row.fisik.penebangan)}</td>
                    <FormulaCell value={row.fisik.perubahanNeto} />
                    <FormulaCell value={row.fisik.persediaanAkhir} />
                    <FormulaCell value={row.fisik.perkiraanCadangan} />
                    <FormulaCell value={row.fisik.lajuPersediaanAkhir} />
                    <FormulaCell value={row.fisik.cekFisik} />
                    {canEdit && (
                      <td className="hpn-row-actions">
                        <button type="button" className="btn btn-secondary btn-icon" onClick={() => openEditModal(row)} title="Ubah data tahun ini">
                          <IconEdit size={13} />
                        </button>
                        <button type="button" className="btn btn-secondary btn-icon" onClick={() => setDeleteTarget({ year: row.year })} title="Hapus data tahun ini">
                          <IconTrash size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr><td colSpan={canEdit ? 12 : 11} className="hpn-empty">Belum ada data. Tambah tahun untuk mulai mengisi hasil pengolahan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hpn-panel">
        <div className="hpn-panel-heading">
          <div className="hpn-panel-icon"><IconFileText size={17} /></div>
          <div>
            <h2>Tabel 2. Penghitungan NPV {activeMeta.name}</h2>
            <p>Government Bond-Inflasi dan GOS per unit dapat diisi; resource rent, discount factor, dan NPV dihitung otomatis.</p>
          </div>
        </div>
        <div className="hpn-table-wrap">
          <table className="spreadsheet-grid hpn-grid">
            <thead>
              <tr>
                <th>Tahun</th>
                <th>Government Bond-Inflasi</th>
                <th>GOS per unit (Rp/m3)</th>
                <th>Resource Rent (miliar Rp)</th>
                <th>Umur Cadangan</th>
                <th>Discount Factor</th>
                <th>NPV (miliar Rp)</th>
                <th>NPV per Stok Akhir (Rp/m3)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={`npv-${row.year}`}>
                  <th scope="row">{row.year}</th>
                  <td className="cell-input">{formatNumber(row.npv.bondRate)}</td>
                  <td className="cell-input">{formatNumber(row.npv.gos)}</td>
                  <FormulaCell value={row.npv.resourceRent} />
                  <FormulaCell value={row.npv.umurCadangan} />
                  <FormulaCell value={row.npv.faktorDiskon} />
                  <FormulaCell value={row.npv.npv} />
                  <FormulaCell value={row.npv.npvPerStok} />
                </tr>
              )) : (
                <tr><td colSpan={8} className="hpn-empty">Belum ada data NPV.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hpn-panel">
        <div className="hpn-panel-heading">
          <div className="hpn-panel-icon"><IconCoins size={17} /></div>
          <div>
            <h2>Tabel 3. Neraca Moneter {activeMeta.name} (miliar Rp)</h2>
            <p>Seluruh nilai diturunkan dari Tabel 1 dan Tabel 2 sesuai relasi antarvariabel pada kamus Timber.</p>
          </div>
        </div>
        <div className="hpn-table-wrap">
          <table className="spreadsheet-grid hpn-grid">
            <thead>
              <tr>
                <th>Tahun</th>
                <th>Persediaan Awal</th>
                <th>Pertumbuhan</th>
                <th>Penanaman</th>
                <th>Konversi &amp; Kerusakan</th>
                <th>Penebangan</th>
                <th>Revaluasi</th>
                <th>Stok Akhir</th>
                <th>Unit Rent (ribu Rp/m3)</th>
                <th>Cek</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((row) => row.year >= 2009).length ? rows.filter((row) => row.year >= 2009).map((row) => (
                <tr key={`moneter-${row.year}`}>
                  <th scope="row">{row.year}</th>
                  <FormulaCell value={row.moneter.persediaanAwal} />
                  <FormulaCell value={row.moneter.pertumbuhan} />
                  <FormulaCell value={row.moneter.penanaman} />
                  <FormulaCell value={row.moneter.konversiKerusakan} />
                  <FormulaCell value={row.moneter.penebangan} />
                  <FormulaCell value={row.moneter.revaluasi} />
                  <FormulaCell value={row.moneter.stokAkhir} />
                  <FormulaCell value={row.moneter.unitRent} />
                  <FormulaCell value={row.moneter.cek} />
                </tr>
              )) : (
                <tr><td colSpan={10} className="hpn-empty">Belum ada data moneter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modal && (
        <Modal
          title={`${modal.mode === "add" ? "Tambah" : "Ubah"} Data ${activeSheet}`}
          onClose={() => setModal(null)}
          width="760px"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Batal</button>
              <button type="button" className="btn btn-primary" onClick={submitForm}>
                <IconCheck size={14} /> Simpan ke Antrean
              </button>
            </>
          }
        >
          <div className="hpn-form-grid">
            <label className="hpn-field">
              <span>Tahun</span>
              <input
                type="number"
                min="1900"
                max="2100"
                value={form.year}
                onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
              />
            </label>
            {FIELDS.map((field) => (
              <label className="hpn-field" key={field.key}>
                <span>{field.label} <small>({field.unit})</small></span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.values[field.key]}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      values: { ...prev.values, [field.key]: event.target.value },
                    }))
                  }
                />
              </label>
            ))}
          </div>
          {formError && <div className="hpn-form-error"><IconAlert size={14} /> {formError}</div>}
          <p className="hpn-form-hint">
            Data yang dimasukkan masuk antrean penyimpanan. Klik <b>Simpan Perubahan</b> pada halaman untuk menyimpan ke database.
          </p>
        </Modal>
      )}

      {addYearOpen && (
        <Modal
          title="Tambah Tahun"
          onClose={() => setAddYearOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAddYearOpen(false)}>Batal</button>
              <button type="button" className="btn btn-primary" onClick={addYear}><IconPlus size={14} /> Lanjutkan</button>
            </>
          }
        >
          <label className="hpn-field">
            <span>Tahun baru</span>
            <input
              type="number"
              min="1900"
              max="2100"
              value={newYear}
              onChange={(event) => setNewYear(event.target.value)}
              placeholder="2025"
            />
          </label>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Hapus Data"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Batal</button>
              <button type="button" className="btn btn-primary" onClick={confirmDelete}><IconTrash size={14} /> Hapus</button>
            </>
          }
        >
          <p>Hapus data {activeSheet} tahun {deleteTarget.year}? Tindakan ini tidak dapat dibatalkan.</p>
        </Modal>
      )}
    </div>
  );
}
