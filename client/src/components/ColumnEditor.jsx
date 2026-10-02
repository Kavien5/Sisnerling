import React from "react";
import Modal from "./Modal.jsx";
import { IconPlus, IconTrash } from "./Icons.jsx";
import { defaultColumns, STANDARD_KEYS } from "../spreadsheet.js";

export default function ColumnEditor({ kategori, onSave, onClose, saving }) {
  const [draft, setDraft] = React.useState(() =>
    Array.isArray(kategori.kolom) && kategori.kolom.length
      ? kategori.kolom
      : defaultColumns([]).map((c) => ({
          key: c.key,
          label: c.label,
          type: c.type,
          width: c.width,
          visible: true,
        }))
  );

  const setLabel = (i, label) =>
    setDraft((d) => d.map((c, x) => (x === i ? { ...c, label } : c)));

  const setType = (i, type) =>
    setDraft((d) => d.map((c, x) => (x === i ? { ...c, type } : c)));

  const toggleVisible = (i) =>
    setDraft((d) => d.map((c, x) => (x === i ? { ...c, visible: c.visible === false } : c)));

  const removeCol = (i) => setDraft((d) => d.filter((_, x) => x !== i));

  const addCol = () =>
    setDraft((d) => [
      ...d,
      { key: `k${Date.now()}`, label: "Kolom Baru", type: "text", width: 140, visible: true },
    ]);

  return (
    <Modal
      title={`Atur Kolom - ${kategori.nama_kategori}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" onClick={() => onSave(draft)} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Kolom"}
          </button>
        </>
      }
    >
      <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Centang untuk menampilkan kolom, ubah label sesuai kebutuhan, dan tambah kolom baru untuk neraca ini.
      </p>
      <div style={{ marginBottom: 12 }}>
        {draft.map((c, i) => (
          <div className="col-row" key={c.key}>
            <input
              type="checkbox"
              title="Tampilkan"
              checked={c.visible !== false}
              onChange={() => toggleVisible(i)}
            />
            <input
              className="form-control"
              value={c.label}
              onChange={(e) => setLabel(i, e.target.value)}
              placeholder="Label kolom"
            />
            {STANDARD_KEYS.includes(c.key) ? (
              <span className="text-muted col-type">{c.type === "select" ? "Pilihan" : c.type}</span>
            ) : (
              <>
                <select className="form-control col-type" value={c.type} onChange={(e) => setType(i, e.target.value)}>
                  <option value="text">Teks</option>
                  <option value="number">Angka</option>
                  <option value="date">Tanggal</option>
                </select>
                <button className="btn btn-danger btn-icon" title="Hapus kolom" onClick={() => removeCol(i)}>
                  <IconTrash size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-soft btn-sm" onClick={addCol}>
        <IconPlus size={14} /> Tambah Kolom
      </button>
    </Modal>
  );
}
