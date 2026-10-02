import React from "react";
import { api, formatNumber, formatRupiah, formatTanggal } from "../api.js";
import Modal from "../components/Modal.jsx";
import ColumnEditor from "../components/ColumnEditor.jsx";
import { useToast } from "../components/Toast.jsx";
import Spreadsheet from "../components/Spreadsheet.jsx";
import {
  buildColumns,
  defaultGridRow,
  gridRowFromDb,
  collectFormulas,
  evaluateGrid,
  getCellValue,
  STANDARD_KEYS,
} from "../spreadsheet.js";
import NeracaOverview from "./NeracaOverview.jsx";
import SubKategoriDetail from "./SubKategoriDetail.jsx";
import YearlyGrid from "../components/YearlyGrid.jsx";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconSearch,
  IconDatabase,
  IconArrowDown,
  IconArrowUp,
  IconGrid,
  IconTable,
  IconCalendar,
  IconDownload,
  IconUpload,
  IconFileExcel,
  IconFileText,
  IconTag,
  IconHistory,
  IconRotate,
} from "../components/Icons.jsx";

const EMPTY_FORM = { kode: "", nama: "", kategori_id: "", jumlah: 0, harga: 0, tanggal: "", status: "Pending", keterangan: "" };
const EMPTY_ROWS = 50;
const statusMap = { Masuk: ["masuk", IconArrowDown], Keluar: ["keluar", IconArrowUp], Pending: ["pending", IconArrowUp] };

export default function DataPage({ fixedStatus, fixedKategoriId, fixedSubKategoriId, onNavigate }) {
  const toast = useToast();

  const [view, setView] = React.useState("grid");
  const [yearlyData, setYearlyData] = React.useState(null);
  const [yearlyLoading, setYearlyLoading] = React.useState(false);
  const [state, setState] = React.useState({ data: [], total: 0, page: 1, totalPages: 1 });
  const [kategori, setKategori] = React.useState([]);
  const [filters, setFilters] = React.useState({ q: "", kategoriId: "", status: "" });
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const [gridRows, setGridRows] = React.useState([]);
  const [gridLoading, setGridLoading] = React.useState(false);
  const [gridLoaded, setGridLoaded] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [savingGrid, setSavingGrid] = React.useState(false);
  const [gridDeleteTarget, setGridDeleteTarget] = React.useState(null);
  const [activeGridRow, setActiveGridRow] = React.useState(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importFile, setImportFile] = React.useState(null);
  const [importKategoriId, setImportKategoriId] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState(null);
  const [saveMenuOpen, setSaveMenuOpen] = React.useState(false);
  const saveGroupRef = React.useRef(null);
  const [colEditorOpen, setColEditorOpen] = React.useState(false);
  const [colSaving, setColSaving] = React.useState(false);

  const [deleteAllOpen, setDeleteAllOpen] = React.useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = React.useState(false);
  const [riwayatOpen, setRiwayatOpen] = React.useState(false);
  const [riwayatList, setRiwayatList] = React.useState([]);
  const [riwayatDetail, setRiwayatDetail] = React.useState(null);
  const [riwayatLoading, setRiwayatLoading] = React.useState(false);
  const [restoreConfirm, setRestoreConfirm] = React.useState(null);
  const [riwayatRestoring, setRiwayatRestoring] = React.useState(false);
  const [gridDateFrom, setGridDateFrom] = React.useState("");
  const [gridDateTo, setGridDateTo] = React.useState("");

  React.useEffect(() => {
    const onDocClick = (e) => {
      if (saveGroupRef.current && !saveGroupRef.current.contains(e.target)) {
        setSaveMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const effectiveStatus = React.useMemo(() => {
    if (filters.status) return filters.status;
    if (!fixedStatus) return "";
    return fixedStatus === "Masuk" ? ["Masuk", "Pending"] : "Keluar";
  }, [filters.status, fixedStatus]);

  const effectiveKategoriId = React.useMemo(
    () => filters.kategoriId || fixedKategoriId || undefined,
    [filters.kategoriId, fixedKategoriId]
  );

  const effectiveSubKategoriId = React.useMemo(
    () => fixedSubKategoriId || undefined,
    [fixedSubKategoriId]
  );

  const baseColumns = React.useMemo(() => {
    const active = kategori.find((k) => String(k.id) === String(effectiveKategoriId));
    const hasCustom = Array.isArray(active && active.kolom) && active.kolom.length > 0;
    const built = buildColumns(
      kategori.map((k) => ({ value: String(k.id), label: k.nama_kategori })),
      hasCustom ? active.kolom : null
    );
    return built.map((c) => {
      if (hasCustom) return c;
      return { ...c, label: "" };
    });
  }, [kategori, effectiveKategoriId]);

  const [columns, setColumns] = React.useState(baseColumns);
  const [headersEdited, setHeadersEdited] = React.useState(false);

  React.useEffect(() => {
    setColumns(baseColumns);
    setHeadersEdited(false);
  }, [baseColumns]);

  const handleHeaderEdit = (i, label) => {
    setColumns((prev) => prev.map((c, x) => (x === i ? { ...c, label } : c)));
    setHeadersEdited(true);
    setDirty(true);
  };

  const activeKategori = React.useMemo(
    () => kategori.find((k) => String(k.id) === String(effectiveKategoriId)),
    [kategori, effectiveKategoriId]
  );

  const openColEditor = () => {
    if (!activeKategori) {
      toast("Pilih salah satu neraca (kategori) terlebih dahulu", "error");
      return;
    }
    setColEditorOpen(true);
  };

  const saveColumns = async (kolom) => {
    if (!activeKategori) return;
    setColSaving(true);
    try {
      await api.updateKategori(activeKategori.id, {
        nama_kategori: activeKategori.nama_kategori,
        deskripsi: activeKategori.deskripsi || "",
        kolom,
      });
      toast("Kolom berhasil disimpan");
      setColEditorOpen(false);
      const list = await api.getKategori();
      setKategori(list);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setColSaving(false);
    }
  };

  const aksiLabel = { simpan: "Simpan", hapus: "Hapus", hapus_semua: "Hapus Semua", pulihkan: "Pulihkan", import: "Import" };

  const recordRiwayat = async (aksi, catatan) => {
    if (!effectiveKategoriId) return;
    await api.createRiwayat({ kategoriId: effectiveKategoriId, aksi, catatan });
  };

  const openRiwayat = () => {
    if (!effectiveKategoriId) {
      toast("Pilih salah satu neraca (kategori) terlebih dahulu", "error");
      return;
    }
    setRiwayatOpen(true);
    setRiwayatDetail(null);
    setRestoreConfirm(null);
    loadRiwayat();
  };

  const loadRiwayat = async () => {
    setRiwayatLoading(true);
    try {
      const list = await api.getRiwayat({ kategoriId: effectiveKategoriId });
      setRiwayatList(list);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setRiwayatLoading(false);
    }
  };

  const viewRiwayat = async (id) => {
    try {
      const detail = await api.getRiwayatDetail(id);
      setRiwayatDetail(detail);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const deleteRiwayat = async (id) => {
    try {
      await api.deleteRiwayat(id);
      toast("Riwayat dihapus");
      if (riwayatDetail && riwayatDetail.id === id) setRiwayatDetail(null);
      loadRiwayat();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const restoreRiwayat = async (id) => {
    setRiwayatRestoring(true);
    try {
      const res = await api.restoreRiwayat(id);
      toast(`${res.message} (${res.rows} baris)`);
      setRiwayatDetail(null);
      setRestoreConfirm(null);
      await loadRiwayat();
      await fetchGrid();
      fetchData();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setRiwayatRestoring(false);
    }
  };

  const openDeleteAll = () => {
    if (!effectiveKategoriId) {
      toast("Pilih salah satu neraca (kategori) terlebih dahulu", "error");
      return;
    }
    setDeleteAllOpen(true);
  };

  const confirmDeleteAll = async () => {
    setDeleteAllLoading(true);
    try {
      await recordRiwayat("hapus_semua", "Hapus semua data kategori");
      await api.deleteAllData(effectiveKategoriId);
      toast("Semua data kategori berhasil dihapus");
      setDeleteAllOpen(false);
      await fetchGrid();
      fetchData();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const pageTitle = React.useMemo(() => {
    if (!fixedStatus) return "Input & Output";
    const family = fixedStatus === "Masuk" ? "Input" : "Output";
    if (fixedKategoriId) {
      const k = kategori.find((x) => String(x.id) === String(fixedKategoriId));
      return k ? `${family} - ${k.nama_kategori}` : `${family} - Kategori`;
    }
    return family;
  }, [fixedStatus, fixedKategoriId, kategori]);

  const pageSubtitle = React.useMemo(() => {
    if (!fixedStatus) return "Kelola data pengolahan input & output";
    return fixedStatus === "Masuk"
      ? "Kelola data masuk (input) per kategori"
      : "Kelola data keluar (output) per kategori";
  }, [fixedStatus]);

  React.useEffect(() => {
    setFilters({
      q: "",
      kategoriId: fixedKategoriId ?? "",
      status: "",
    });
    setState((s) => ({ ...s, page: 1 }));
  }, [fixedStatus, fixedKategoriId]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getData({
        page: state.page,
        q: filters.q,
        kategoriId: effectiveKategoriId,
        subKategoriId: effectiveSubKategoriId,
        status: effectiveStatus || undefined,
        from: gridDateFrom || undefined,
        to: gridDateTo || undefined,
      });
      setState(res);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [state.page, filters.q, effectiveKategoriId, effectiveSubKategoriId, effectiveStatus, gridDateFrom, gridDateTo, toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  React.useEffect(() => {
    api.getKategori().then(setKategori).catch(() => {});
  }, []);

  const tableGrid = React.useMemo(() => {
    if (!state.data.length) return null;
    const grid = state.data.map((d) => gridRowFromDb(d, columns));
    return evaluateGrid(grid, columns);
  }, [state.data, columns]);

  const fetchGrid = React.useCallback(async () => {
    setGridLoading(true);
    try {
      const res = await api.getData({
        perPage: 100000,
        kategoriId: effectiveKategoriId,
        subKategoriId: effectiveSubKategoriId,
        status: effectiveStatus || undefined,
        from: gridDateFrom || undefined,
        to: gridDateTo || undefined,
        order: "asc",
      });
      const loaded = res.data.map((d) => gridRowFromDb(d, columns));
      const blanksNeeded = Math.max(0, EMPTY_ROWS - loaded.filter((r) => !r.id).length);
      const blanks = Array.from({ length: blanksNeeded }, () =>
        defaultGridRow(columns)
      );
      setGridRows([...loaded, ...blanks]);
      setGridLoaded(true);
      setDirty(false);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setGridLoading(false);
    }
  }, [effectiveKategoriId, effectiveStatus, gridDateFrom, gridDateTo, columns, fixedStatus, toast]);

  React.useEffect(() => {
    if (view === "grid") fetchGrid();
    if (view === "yearly") {
      setYearlyLoading(true);
      const params = {};
      if (effectiveKategoriId) params.kategoriId = effectiveKategoriId;
      if (effectiveSubKategoriId) params.subKategoriId = effectiveSubKategoriId;
      api.getYearlyData(params).then(setYearlyData).catch(() => setYearlyData(null)).finally(() => setYearlyLoading(false));
    }
  }, [view, fetchGrid, effectiveKategoriId, effectiveSubKategoriId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, tanggal: new Date().toISOString().slice(0, 10), status: fixedStatus || "Pending" });
    setModalOpen(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setForm({
      kode: d.kode,
      nama: d.nama,
      kategori_id: d.kategori_id ?? "",
      jumlah: d.jumlah,
      harga: d.harga,
      tanggal: d.tanggal ? d.tanggal.slice(0, 10) : "",
      status: d.status,
      keterangan: d.keterangan || "",
    });
    setModalOpen(true);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateData(editing.id, form);
        toast("Data berhasil diubah");
      } else {
        await api.createData(form);
        toast("Data berhasil ditambahkan");
      }
      setModalOpen(false);
      fetchData();
      fetchGrid();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await recordRiwayat("hapus", `Hapus ${deleteTarget.kode} - ${deleteTarget.nama}`);
      await api.deleteData(deleteTarget.id);
      toast("Data berhasil dihapus");
      setDeleteTarget(null);
      fetchData();
      fetchGrid();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const applyFilter = (k) => (e) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setState((s) => ({ ...s, page: 1 }));
  };

  const goPage = (p) => {
    if (p < 1 || p > state.totalPages) return;
    setState((s) => ({ ...s, page: p }));
  };

  const addGridRow = () => {
    setGridRows((rows) => [
      ...rows,
      defaultGridRow(columns),
    ]);
    setDirty(true);
  };

  const onGridChange = (rows) => {
    setGridRows(rows);
    setDirty(true);
  };

  const confirmGridDelete = async () => {
    const target = gridDeleteTarget;
    try {
      if (target && target.id) {
        await recordRiwayat("hapus", target.kode ? `Hapus ${target.kode} - ${target.nama || ""}` : "Hapus baris");
        await api.deleteData(target.id);
        toast("Data berhasil dihapus");
      }
      setGridRows((rows) => rows.filter((r) => r !== target));
      setGridDeleteTarget(null);
      setDirty(true);
      fetchData();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const saveGrid = async (exportType) => {
    setSavingGrid(true);
    setSaveMenuOpen(false);
    try {
      const computed = evaluateGrid(gridRows, columns);
      const payloads = [];
      for (let i = 0; i < gridRows.length; i++) {
        const row = gridRows[i];
        const kode = String(row.kode ?? "").trim();
        const nama = String(row.nama ?? "").trim();
        if (!kode && !nama) continue;
        if (!kode || !nama) {
          toast(`Baris ${i + 1}: Kode dan Nama wajib diisi`, "error");
          return;
        }
        const jumlah = Number(getCellValue(computed, gridRows, i, "jumlah") ?? 0);
        const harga = Number(getCellValue(computed, gridRows, i, "harga") ?? 0);
        if (!Number.isFinite(jumlah) || !Number.isFinite(harga)) {
          toast(`Baris ${i + 1}: Rumus Jumlah/Harga menghasilkan nilai tidak valid`, "error");
          return;
        }
        const nilai = {};
        for (const c of columns) {
          if (STANDARD_KEYS.includes(c.key)) continue;
          const v = row[c.key];
          if (v !== null && v !== undefined && v !== "") nilai[c.key] = v;
        }
        payloads.push({
          id: row.id,
          kode,
          nama,
          kategori_id: row.kategori_id || null,
          jumlah,
          harga,
          tanggal: row.tanggal || new Date().toISOString().slice(0, 10),
          status: row.status || fixedStatus || "Pending",
          keterangan: row.keterangan || null,
          formulas: collectFormulas(row),
          nilai: Object.keys(nilai).length ? nilai : null,
        });
      }

      for (const p of payloads) {
        if (p.id) await api.updateData(p.id, p);
        else await api.createData(p);
      }
      if (headersEdited && activeKategori) {
        const kolom = columns.map((c) => ({
          key: c.key,
          label: c.label,
          type: c.type,
          width: c.width,
          visible: c.visible !== false,
        }));
        await api.updateKategori(activeKategori.id, {
          nama_kategori: activeKategori.nama_kategori,
          deskripsi: activeKategori.deskripsi || "",
          kolom,
        });
        const list = await api.getKategori();
        setKategori(list);
        setHeadersEdited(false);
      }
      toast("Semua perubahan tersimpan");
      await fetchGrid();
      fetchData();
      try {
        await recordRiwayat("simpan", "Simpan perubahan data");
      } catch (_e) {
        // riwayat bersifat cadangan; jangan gagalkan penyimpanan
      }
      if (exportType) {
        const params = {};
        if (effectiveKategoriId) params.kategoriId = effectiveKategoriId;
        if (effectiveStatus) params.status = effectiveStatus;
        window.location.href = api.exportUrl(exportType, params);
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingGrid(false);
    }
  };

  const doExport = () => {
    const params = {};
    if (effectiveKategoriId) params.kategoriId = effectiveKategoriId;
    if (effectiveStatus) params.status = effectiveStatus;
    window.location.href = api.exportUrl("excel", params);
  };

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1]);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

  const submitImport = async (e) => {
    e.preventDefault();
    if (!importFile) {
      toast("Pilih file Excel terlebih dahulu", "error");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      await recordRiwayat("import", `Import ${importFile.name}`);
      const base64 = await readFileAsBase64(importFile);
      const res = await api.importExcel({
        filename: importFile.name,
        base64,
        kategoriId: importKategoriId || effectiveKategoriId || undefined,
        columns: columns.map((c) => ({
          key: c.key,
          label: c.label,
          type: c.type,
          width: c.width,
          visible: c.visible !== false,
        })),
      });
      setImportResult(res);
      toast(`Import selesai: ${res.inserted} masuk${res.updated ? `, ${res.updated} diperbarui` : ""}`);
      const updatedKategori = await api.getKategori();
      setKategori(updatedKategori);
      const targetId = res.targetKatId ? String(res.targetKatId) : "";
      const currentFixed = fixedKategoriId ? String(fixedKategoriId) : "";
      if (targetId && currentFixed && targetId !== currentFixed && onNavigate) {
        // Berada di halaman kategori tetap yang berbeda dari tujuan import.
        onNavigate(`${fixedStatus === "Keluar" ? "output" : "input"}:${res.targetKatId}`);
      } else {
        if (targetId && !currentFixed) {
          setFilters((f) => ({ ...f, kategoriId: targetId }));
          setState((s) => ({ ...s, page: 1 }));
        }
        setView("grid");
        await fetchGrid();
        await fetchData();
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setImporting(false);
    }
  };

  const openImport = () => {
    setImportFile(null);
    setImportResult(null);
    setImportKategoriId(effectiveKategoriId || "");
    setImportOpen(true);
  };

  const cellText = (d, c, r) => {
    const evaluated =
      r !== undefined &&
      tableGrid &&
      tableGrid.has(`${r}:${c.key}`) &&
      tableGrid.get(`${r}:${c.key}`) !== undefined &&
      tableGrid.get(`${r}:${c.key}`) !== null &&
      tableGrid.get(`${r}:${c.key}`) !== "";
    const ev = evaluated ? tableGrid.get(`${r}:${c.key}`) : undefined;
    if (typeof ev === "string" && ev.startsWith("#")) return ev;
    if (c.key === "kategori_id") return d.nama_kategori || "-";
    if (c.key === "kode" || c.key === "nama") return d[c.key];
    if (evaluated) {
      if (c.key === "jumlah" || c.type === "number") return formatNumber(ev);
      if (c.key === "harga" || c.key === "total") return formatRupiah(ev);
      if (c.key === "tanggal") return formatTanggal(ev);
      return String(ev);
    }
    if (c.key === "jumlah") return formatNumber(d.jumlah);
    if (c.key === "harga") return formatRupiah(d.harga);
    if (c.key === "total") return formatRupiah(Number(d.jumlah || 0) * Number(d.harga || 0));
    if (c.key === "tanggal") return formatTanggal(d.tanggal);
    if (c.key === "keterangan") return d.keterangan || "-";
    const v = d.nilai && d.nilai[c.key];
    if (v === undefined || v === null || v === "") return "-";
    return c.type === "number" ? formatNumber(v) : String(v);
  };

  if (fixedKategoriId && !fixedSubKategoriId) {
    return (
      <NeracaOverview
        kategoriId={fixedKategoriId}
        status={fixedStatus}
        onNavigate={onNavigate || (() => {})}
      />
    );
  }

  return (
    <>
      <div className="page-title flex-between">
        <div>
          <h2>{pageTitle}</h2>
          <p>{pageSubtitle}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={openColEditor}>
            <IconTag size={15} /> Atur Kolom
          </button>
          <button className="btn btn-outline btn-sm" onClick={openImport}>
            <IconUpload size={15} /> Import Excel
          </button>
          <button className="btn btn-outline btn-sm" onClick={openRiwayat}>
            <IconHistory size={15} /> Riwayat
          </button>
          <button className="btn btn-outline btn-sm" onClick={openDeleteAll}>
            <IconTrash size={15} /> Hapus Semua
          </button>
          <button className="btn btn-primary btn-sm" onClick={doExport}>
            <IconDownload size={15} /> Export Excel
          </button>
          <div className="view-toggle">
            <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}>
              <IconGrid size={15} /> Grid Excel
            </button>
            <button className={view === "yearly" ? "active" : ""} onClick={() => setView("yearly")}>
              <IconCalendar size={15} /> Tahunan
            </button>
            <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>
              <IconTable size={15} /> Tabel
            </button>
          </div>
        </div>
      </div>

      {view === "grid" ? (
        <>
          <div className="spread-toolbar">
            <button className="btn btn-primary" onClick={addGridRow} disabled={savingGrid}>
              <IconPlus size={15} /> Tambah Baris
            </button>
            <button
              className="btn btn-outline"
              onClick={() => activeGridRow && setGridDeleteTarget(activeGridRow)}
              disabled={!activeGridRow || savingGrid}
            >
              <IconTrash size={15} /> Hapus Baris
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px" }}>
              <IconCalendar size={14} />
              <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>Dari</span>
              <input
                type="date"
                className="form-control"
                style={{ fontSize: 12, padding: "2px 4px", width: 130, border: "none", background: "transparent" }}
                value={gridDateFrom}
                onChange={(e) => setGridDateFrom(e.target.value)}
              />
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>&mdash;</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>Sampai</span>
              <input
                type="date"
                className="form-control"
                style={{ fontSize: 12, padding: "2px 4px", width: 130, border: "none", background: "transparent" }}
                value={gridDateTo}
                onChange={(e) => setGridDateTo(e.target.value)}
              />
              {(gridDateFrom || gridDateTo) && (
                <button className="btn btn-outline" style={{ fontSize: 10, padding: "2px 6px", marginLeft: 2 }} onClick={() => { setGridDateFrom(""); setGridDateTo(""); }}>
                  Reset
                </button>
              )}
            </div>
            <div className="save-group" ref={saveGroupRef}>
              <button
                className={`btn ${dirty ? "btn-soft" : "btn-outline"}`}
                onClick={() => saveGrid()}
                disabled={savingGrid || gridLoading}
              >
                {savingGrid ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
              <button
                className="btn btn-outline save-caret"
                onClick={() => setSaveMenuOpen((v) => !v)}
                disabled={savingGrid || gridLoading}
                title="Opsi simpan"
              >
                &#9662;
              </button>
              {saveMenuOpen && (
                <div className="save-menu">
                  <button onClick={() => saveGrid("excel")} disabled={savingGrid}>
                    <IconFileExcel size={14} /> Simpan &amp; Export Excel
                  </button>
                  <button onClick={() => saveGrid("pdf")} disabled={savingGrid}>
                    <IconFileText size={14} /> Simpan &amp; Export PDF
                  </button>
                </div>
              )}
            </div>
            {dirty && <span className="dirty-hint">Ada perubahan belum disimpan</span>}
          </div>

          <div className="formula-help">
            <b>Rumus:</b> mulai dengan <code>=</code>. Contoh: <code>=D2*E2</code>,{" "}
            <code>=SUM(D2:D10)</code>, <code>=AVG(D2:D10)</code>, <code>=MAX(E2:E10)</code>,{" "}
            <code>=ROUND(A1*0.1,2)</code>, <code>=IF(D2&gt;10,"Banyak","Sedikit")</code>. Kolom
            relatif seperti <code>=D*E</code> mengikuti baris aktif.
          </div>

          <div className="card">
            <Spreadsheet
              rows={gridRows}
              columns={columns}
              onChange={onGridChange}
              onAddRow={addGridRow}
              loading={gridLoading}
              onDeleteRequest={(row) => setGridDeleteTarget(row)}
              onActiveChange={setActiveGridRow}
              onHeaderEdit={handleHeaderEdit}
            />
          </div>
        </>
      ) : view === "yearly" ? (
        <YearlyGrid data={yearlyData} loading={yearlyLoading} />
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <span className="search-icon"><IconSearch size={15} /></span>
              <input
                placeholder="Cari kode, nama, keterangan..."
                value={filters.q}
                onChange={applyFilter("q")}
              />
            </div>
            {!fixedKategoriId && (
              <select className="select-filter" value={filters.kategoriId} onChange={applyFilter("kategoriId")}>
                <option value="">Semua Kategori</option>
                {kategori.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama_kategori}</option>
                ))}
              </select>
            )}
            <select className="select-filter" value={filters.status} onChange={applyFilter("status")}>
              <option value="">{fixedStatus ? `Semua ${pageTitle.split(" - ")[0]}` : "Semua Status"}</option>
              {fixedStatus === "Masuk" ? (
                <>
                  <option value="Masuk">Masuk</option>
                  <option value="Pending">Pending</option>
                </>
              ) : fixedStatus === "Keluar" ? (
                <>
                  <option value="Keluar">Keluar</option>
                </>
              ) : (
                <>
                  <option value="Masuk">Masuk</option>
                  <option value="Keluar">Keluar</option>
                  <option value="Pending">Pending</option>
                </>
              )}
            </select>
            <button className="btn btn-primary" onClick={openCreate}>
              <IconPlus size={16} /> Tambah Data
            </button>
          </div>

          <div className="card">
            {loading ? (
              <div className="loading">
                <div>
                  <div className="spinner" />
                  <span>Memuat data...</span>
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.map((d, idx) => {
                      const [cls, Icon] = statusMap[d.status];
                      return (
                        <tr key={d.id}>
                          {columns.map((c) => (
                            <td
                              key={c.key}
                              className={c.key === "kode" || c.key === "total" ? "font-bold" : c.type === "number" ? "text-muted" : ""}
                            >
                              {c.key === "status" ? (
                                <span className={`badge ${cls}`}><Icon size={12} />{d.status}</span>
                              ) : (
                                cellText(d, c, idx)
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="row-actions">
                              <button className="btn btn-soft btn-icon" title="Ubah" onClick={() => openEdit(d)}>
                                <IconEdit size={14} />
                              </button>
                              <button className="btn btn-danger btn-icon" title="Hapus" onClick={() => setDeleteTarget(d)}>
                                <IconTrash size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {state.data.length === 0 && (
                      <tr>
                        <td colSpan={columns.length + 1}>
                          <div className="empty-state">
                            <div className="big"><IconDatabase size={42} /></div>
                            Tidak ada data yang cocok
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pagination">
              <span className="pagination-info">
                Menampilkan {state.data.length} dari {state.total} data &middot; Halaman {state.page} dari {state.totalPages}
              </span>
              <div className="page-btns">
                <button className="page-btn" disabled={state.page <= 1} onClick={() => goPage(state.page - 1)}>
                  &lsaquo;
                </button>
                {Array.from({ length: state.totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === state.totalPages || Math.abs(p - state.page) <= 1)
                  .map((p, idx, arr) => (
                    <React.Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-muted" style={{ padding: "0 2px" }}>...</span>}
                      <button className={`page-btn${p === state.page ? " active" : ""}`} onClick={() => goPage(p)}>
                        {p}
                      </button>
                    </React.Fragment>
                  ))}
                <button className="page-btn" disabled={state.page >= state.totalPages} onClick={() => goPage(state.page + 1)}>
                  &rsaquo;
                </button>
              </div>
            </div>
          </div>

          {modalOpen && (
            <Modal
              title={editing ? `Ubah Data - ${editing.kode}` : "Tambah Data Baru"}
              onClose={() => setModalOpen(false)}
              footer={
                <>
                  <button className="btn btn-outline" onClick={() => setModalOpen(false)}>Batal</button>
                  <button className="btn btn-primary" form="form-data" type="submit" disabled={saving}>
                    {saving ? "Menyimpan..." : "Simpan"}
                  </button>
                </>
              }
            >
              <form id="form-data" onSubmit={submit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Kode *</label>
                    <input className="form-control" value={form.kode} onChange={set("kode")} placeholder="BRG-001" required />
                  </div>
                  <div className="form-group">
                    <label>Tanggal</label>
                    <input className="form-control" type="date" value={form.tanggal} onChange={set("tanggal")} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Nama Data *</label>
                  <input className="form-control" value={form.nama} onChange={set("nama")} placeholder="Nama data / barang" required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Kategori</label>
                    <select className="form-control" value={form.kategori_id} onChange={set("kategori_id")}>
                      <option value="">Tanpa Kategori</option>
                      {kategori.map((k) => (
                        <option key={k.id} value={k.id}>{k.nama_kategori}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select className="form-control" value={form.status} onChange={set("status")}>
                      {fixedStatus === "Keluar" ? (
                        <option value="Keluar">Keluar</option>
                      ) : (
                        <>
                          <option value="Masuk">Masuk</option>
                          <option value="Pending">Pending</option>
                          {!fixedStatus && <option value="Keluar">Keluar</option>}
                        </>
                      )}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Jumlah</label>
                    <input className="form-control" type="number" min="0" value={form.jumlah} onChange={set("jumlah")} />
                  </div>
                  <div className="form-group">
                    <label>Harga</label>
                    <input className="form-control" type="number" min="0" step="any" value={form.harga} onChange={set("harga")} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Keterangan</label>
                  <textarea className="form-control" rows="2" value={form.keterangan} onChange={set("keterangan")} placeholder="Catatan (opsional)" />
                </div>
              </form>
            </Modal>
          )}

          {deleteTarget && (
            <Modal
              title="Hapus Data"
              onClose={() => setDeleteTarget(null)}
              footer={
                <>
                  <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>Batal</button>
                  <button className="btn btn-danger" onClick={confirmDelete}>Ya, Hapus</button>
                </>
              }
            >
              <p>
                Yakin ingin menghapus data <b>{deleteTarget.nama}</b> ({deleteTarget.kode})? Tindakan ini tidak dapat dibatalkan.
              </p>
            </Modal>
          )}

        </>
      )}

      {gridDeleteTarget && (
        <Modal
          title="Hapus Baris"
          onClose={() => setGridDeleteTarget(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setGridDeleteTarget(null)}>Batal</button>
              <button className="btn btn-danger" onClick={confirmGridDelete}>Ya, Hapus</button>
            </>
          }
        >
          <p>
            Yakin ingin menghapus baris ini? {gridDeleteTarget.nama ? <b>({gridDeleteTarget.nama})</b> : ""} Tindakan ini
            tidak dapat dibatalkan.
          </p>
        </Modal>
      )}

      {deleteAllOpen && (
        <Modal
          title="Hapus Semua Data"
          onClose={() => setDeleteAllOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setDeleteAllOpen(false)} disabled={deleteAllLoading}>Batal</button>
              <button className="btn btn-danger" onClick={confirmDeleteAll} disabled={deleteAllLoading}>
                {deleteAllLoading ? "Menghapus..." : "Ya, Hapus Semua"}
              </button>
            </>
          }
        >
          <p>
            Yakin ingin menghapus <b>SEMUA</b> data pada kategori{" "}
            <b>{activeKategori?.nama_kategori}</b>? Sebelum dihapus, data saat ini otomatis dicatat ke riwayat sebagai cadangan.
          </p>
        </Modal>
      )}

      {riwayatOpen && (
        <Modal title="Riwayat Perubahan" onClose={() => setRiwayatOpen(false)}>
          {riwayatDetail ? (
            <div>
              <div className="flex-between" style={{ marginBottom: 12 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setRiwayatDetail(null)}>
                  &larr; Kembali
                </button>
                <span className="text-muted">
                  {aksiLabel[riwayatDetail.aksi]} &middot; {(riwayatDetail.data.rows || []).length} baris
                </span>
              </div>
              <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama</th>
                      <th>Jumlah</th>
                      <th>Harga</th>
                      <th>Status</th>
                      <th>Tanggal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(riwayatDetail.data.rows || []).map((r, i) => (
                      <tr key={i}>
                        <td>{r.kode}</td>
                        <td>{r.nama}</td>
                        <td>{formatNumber(r.jumlah)}</td>
                        <td>{formatRupiah(r.harga)}</td>
                        <td>{r.status}</td>
                        <td>{formatTanggal(r.tanggal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : riwayatLoading ? (
            <p className="text-muted">Memuat riwayat...</p>
          ) : riwayatList.length === 0 ? (
            <p className="text-muted">Belum ada riwayat untuk kategori ini.</p>
          ) : (
            <div className="riwayat-list">
              {riwayatList.map((h) => (
                <div className="riwayat-item" key={h.id}>
                  <div className="riwayat-info">
                    <span className={`badge badge-aksi ${h.aksi}`}>{aksiLabel[h.aksi] || h.aksi}</span>
                    <div>
                      <b>{h.catatan || "Perubahan data"}</b>
                      <span className="text-muted">
                        {h.jumlah_baris} baris &middot; {new Date(h.created_at).toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => viewRiwayat(h.id)}>
                      Lihat
                    </button>
                    {restoreConfirm === h.id ? (
                      <>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => restoreRiwayat(h.id)}
                          disabled={riwayatRestoring}
                        >
                          {riwayatRestoring ? "..." : "Yakin?"}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => setRestoreConfirm(null)}>
                          Batal
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-soft btn-sm"
                        onClick={() => setRestoreConfirm(h.id)}
                        title="Pulihkan data dari riwayat ini"
                      >
                        <IconRotate size={13} /> Pulihkan
                      </button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => deleteRiwayat(h.id)}>
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="Import Data Excel"
          onClose={() => setImportOpen(false)}
          footer={
            <>
              <a className="btn btn-outline" href={api.exportTemplateUrl()}>
                <IconDownload size={15} /> Download Template
              </a>
              <button className="btn btn-outline" onClick={() => setImportOpen(false)}>Batal</button>
              <button className="btn btn-primary" form="form-import" type="submit" disabled={importing}>
                {importing ? "Mengimpor..." : "Import"}
              </button>
            </>
          }
        >
          {importResult ? (
            <div className="import-result">
              <div className={`import-summary ${importResult.inserted > 0 ? "ok" : "warn"}`}>
                <b>{importResult.inserted}</b> data berhasil diimpor
                {importResult.updated > 0 && <> &middot; <b>{importResult.updated}</b> diperbarui</>}
                {importResult.skipped > 0 && <> &middot; <b className="text-danger">{importResult.skipped}</b> dilewati</>}
              </div>
              {importResult.inserted === 0 && importResult.updated === 0 && (
                <p className="text-muted" style={{ fontSize: 12, margin: "8px 0" }}>
                  Tidak ada data yang masuk. Kemungkinan: kode sudah ada di database, kode/nama kosong,
                  atau nama kolom di file tidak dikenali. Pastikan header sesuai template (Kode, Nama, Kategori,
                  Jumlah, Harga, Tanggal, Status, Keterangan) dan setiap baris punya kode yang unik.
                </p>
              )}
              {importResult.errors.length > 0 && (
                <ul className="import-errors">
                  {importResult.errors.slice(0, 15).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {importResult.errors.length > 15 && (
                    <li className="text-muted">... dan {importResult.errors.length - 15} lainnya</li>
                  )}
                </ul>
              )}
              <button className="btn btn-soft btn-block mt" onClick={() => setImportOpen(false)}>
                Tutup
              </button>
            </div>
          ) : (
            <form id="form-import" onSubmit={submitImport}>
              <div className="import-hint">
                <IconFileExcel size={28} />
                <p>
                  Unggah file Excel <b>.xlsx</b>. Kolom akan otomatis terdeteksi dari header file.
                  Pilih kategori tujuan untuk menyimpan konfigurasi kolom.
                </p>
              </div>
              <div className="form-group">
                <label>Kategori Tujuan</label>
                <select
                  className="form-control"
                  value={importKategoriId || effectiveKategoriId || ""}
                  onChange={(e) => setImportKategoriId(e.target.value)}
                >
                  <option value="">-- Otomatis (kategori pertama) --</option>
                  {kategori.map((k) => (
                    <option key={k.id} value={k.id}>{k.nama_kategori}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>File Excel</label>
                <input
                  className="form-control"
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setImportFile(e.target.files[0] || null)}
                />
              </div>
              <p className="text-muted" style={{ fontSize: 12 }}>
                Header kolom Excel akan dideteksi otomatis. Baris dengan kode yang sudah ada akan dilewati.
              </p>
            </form>
          )}
        </Modal>
      )}

      {colEditorOpen && activeKategori && (
        <ColumnEditor
          kategori={activeKategori}
          onClose={() => setColEditorOpen(false)}
          onSave={saveColumns}
          saving={colSaving}
        />
      )}
    </>
  );
}
