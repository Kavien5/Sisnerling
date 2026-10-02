import React from "react";
import * as XLSX from "xlsx-js-style";
import { openFileZip, extractImagesFromZip } from "../excelImages.js";
import { enrichWorkbookFromZip } from "../excelRawStyles.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = [".xlsx", ".xls"];

export default function ExcelImport({ onImport, fileCount }) {
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
        // Lengkapi style mentah (border/font/alignment) + gambar/shape langsung
        // dari zip, karena xlsx-js-style tidak membacanya saat parse.
        try {
          const zip = await openFileZip(data.buffer);
          wb.__images = await extractImagesFromZip(zip);
          await enrichWorkbookFromZip(wb, zip);
        } catch {
          // tanpa gambar & style tambahan, import tetap berjalan
        }
        // Simpan byte asli sebagai base64 agar penyimpanan ulang (saveFile)
        // TIDAK perlu XLSX.write ulang — cepat dan data 1:1 dengan file asli.
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

  return (
    <div className="excel-import-page">
      <div className="page-title">
        <h2>Import File Excel</h2>
        <p>{fileCount > 0 ? `${fileCount} file sudah di-import. Upload file tambahan atau lihat hasil import.` : "Upload file Excel untuk melihat data dan membuat visualisasi chart"}</p>
      </div>

      <div className="card">
        <div className="card-body">
          <div
            className={`excel-dropzone${dragging ? " dragging" : ""}`}
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
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                  <rect x="6" y="10" width="44" height="36" rx="8" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="5 4"/>
                  <path d="M28 22v12M22 28h12" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M28 16v-4M20 16h16" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                </svg>
                <p className="dropzone-text">Drag & drop file Excel ke sini</p>
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
    </div>
  );
}
