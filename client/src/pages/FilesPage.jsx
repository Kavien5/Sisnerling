import React from "react";
import * as XLSX from "xlsx-js-style";
import { IconFileSpreadsheet, IconTrash, IconEdit, IconCheck, IconX } from "../components/Icons.jsx";
import { openFileZip, extractImagesFromZip } from "../excelImages.js";
import { enrichWorkbookFromZip } from "../excelRawStyles.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = [".xlsx", ".xls"];

function fmtSize(rawBase64) {
  if (!rawBase64) return "";
  return fmtBytes(Math.round((rawBase64.length * 3) / 4));
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default function FilesPage({ files = [], onOpen, onRemove, onRename, onImport, canImport = false }) {
  const [confirmId, setConfirmId] = React.useState(null);
  const [renameId, setRenameId] = React.useState(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [savingRename, setSavingRename] = React.useState(false);

  const [dragging, setDragging] = React.useState(false);
  const [fileError, setFileError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const processFile = React.useCallback((file) => {
    setFileError("");
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setFileError("Format file tidak didukung. Gunakan file .xlsx atau .xls");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("Ukuran file terlalu besar. Maksimal 10 MB.");
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true, cellStyles: true });
        try {
          const zip = await openFileZip(data.buffer);
          wb.__images = await extractImagesFromZip(zip);
          await enrichWorkbookFromZip(wb, zip);
        } catch {
          // tanpa gambar & style tambahan, import tetap berjalan
        }
        let rawBase64 = "";
        try {
          const CHUNK = 8192;
          let bin = "";
          for (let i = 0; i < data.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, data.subarray(i, i + CHUNK));
          }
          rawBase64 = btoa(bin);
        } catch {
          rawBase64 = "";
        }
        onImport({ workbook: wb, sheetNames: wb.SheetNames, fileName: file.name, rawBase64 });
      } catch (err) {
        setFileError("Gagal membaca file Excel. Pastikan file tidak rusak.");
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => { setFileError("Gagal membaca file."); setLoading(false); };
    reader.readAsArrayBuffer(file);
  }, [onImport]);

  const onDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); processFile(e.dataTransfer.files[0]); };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  const onFileInput = (e) => { processFile(e.target.files[0]); e.target.value = ""; };

  const target = files.find((f) => f.id === confirmId);
  const renameTarget = files.find((f) => f.id === renameId);

  const totalBytes = files.reduce((n, f) => n + (f.rawBase64 ? Math.round((f.rawBase64.length * 3) / 4) : 0), 0);
  const totalSheets = files.reduce((n, f) => n + (f.sheetNames ? f.sheetNames.length : 0), 0);

  const startRename = (f) => {
    setRenameId(f.id);
    setRenameValue(f.fileName || "");
    setSavingRename(false);
  };

  const submitRename = async () => {
    const name = renameValue.trim();
    if (!name || !renameTarget) return;
    if (name === renameTarget.fileName) {
      setRenameId(null);
      return;
    }
    setSavingRename(true);
    try {
      await onRename(renameTarget.id, name);
      setRenameId(null);
    } finally {
      setSavingRename(false);
    }
  };

  const renameInputRef = React.useRef(null);
  React.useEffect(() => {
    if (renameId) {
      const el = renameInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [renameId]);

  return (
    <div className="files-page">
      <div className="page-title">
        <h2>File &amp; Import</h2>
        <p>Upload file Excel, lalu buka dan kelola file terimport dalam satu halaman.</p>
      </div>

      {canImport && (
        <div className="card files-import-card">
          <div className="card-header">
            <h2>Import File Excel</h2>
            <span className="badge masuk">.xlsx / .xls &middot; maks 10 MB</span>
          </div>
          <div className="card-body">
            <div
              className={`excel-dropzone${dragging ? " dragging" : ""}${loading ? " has-file" : ""}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
            >
              {loading ? (
                <div className="dropzone-loading">
                  <div className="spinner"></div>
                  <p>Membaca file...</p>
                </div>
              ) : (
                <>
                  <svg width="52" height="52" viewBox="0 0 56 56" fill="none">
                    <rect x="6" y="10" width="44" height="36" rx="8" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="5 4"/>
                    <path d="M28 22v12M22 28h12" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M28 16v-4M20 16h16" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                  </svg>
                  <p className="dropzone-text">Drag &amp; drop file Excel ke sini</p>
                  <p className="dropzone-hint">atau</p>
                  <label className="btn btn-primary excel-browse-btn">
                    Pilih File
                    <input type="file" accept=".xlsx,.xls" onChange={onFileInput} style={{ display: "none" }} />
                  </label>
                  <p className="dropzone-format">Format .xlsx / .xls &middot; Maks 10 MB</p>
                </>
              )}
            </div>
            {fileError && <p className="excel-error-msg">{fileError}</p>}
          </div>
        </div>
      )}

      <div className="files-summary">
        <div className="stat-card">
          <div className="stat-icon purple">&#128202;</div>
          <div className="stat-info">
            <span className="label">Total File</span>
            <span className="value">{files.length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">&#128196;</div>
          <div className="stat-info">
            <span className="label">Total Sheet</span>
            <span className="value">{totalSheets}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">&#128190;</div>
          <div className="stat-info">
            <span className="label">Total Ukuran</span>
            <span className="value">{fmtBytes(totalBytes)}</span>
          </div>
        </div>
      </div>

      {files.length ? (
        <div className="card">
          <div className="card-header">
            <h2>File Terimport</h2>
            <span className="badge masuk">{files.length} file</span>
          </div>
          <div className="card-body files-list">
            {files.map((f, i) => (
              <div key={f.id} className="files-list-row">
                <span className="files-list-ico">
                  <IconFileSpreadsheet size={18} />
                </span>
                <div className="files-list-main">
                  {renameId === f.id ? (
                    <div className="files-list-rename">
                      <input
                        ref={renameInputRef}
                        className="form-control files-list-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename();
                          if (e.key === "Escape") setRenameId(null);
                        }}
                        maxLength={120}
                      />
                      <button className="btn btn-primary btn-sm" onClick={submitRename} disabled={savingRename} title="Simpan nama">
                        {savingRename ? "..." : <IconCheck size={16} />}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => setRenameId(null)} title="Batal">
                        <IconX size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="files-list-name" title={f.fileName}>
                        {f.fileName || `File ${i + 1}`}
                      </span>
                      <span className="files-list-meta">
                        {f.sheetNames ? `${f.sheetNames.length} sheet` : "- sheet"}
                        {f.rawBase64 ? ` &middot; ${fmtSize(f.rawBase64)}` : ""}
                        {" &middot; "}Updated {fmtDate(f.savedAt)}
                      </span>
                    </>
                  )}
                </div>
                <div className="files-list-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => startRename(f)} title="Ubah nama file">
                    <IconEdit size={14} />
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => onOpen(f.id)} title="Buka file di Spreadsheet">
                    Buka
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setConfirmId(f.id)}
                    title="Hapus file"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <IconTrash size={13} />
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="big">&#128196;</div>
            <p>Belum ada file yang diimport.</p>
            <p className="text-muted">
              {canImport ? "Gunakan kotak Import di atas untuk mengimport file Excel pertama Anda." : "Hubungi Super Admin untuk mengimport file Excel."}
            </p>
          </div>
        </div>
      )}

      {target && (
        <div className="overlay" onClick={() => setConfirmId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Hapus File</h3>
              <button className="modal-close" onClick={() => setConfirmId(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Yakin ingin menghapus file <b>{target.fileName}</b>?</p>
              <p className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>File akan dihapus permanen dari daftar.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirmId(null)}>Batal</button>
              <button className="btn btn-danger" onClick={() => { setConfirmId(null); onRemove(target.id); }}>Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}