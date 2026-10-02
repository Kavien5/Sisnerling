import React from "react";

const FILL_SWATCHES = [
  "#fff7ed", "#fef3c7", "#fde68a", "#fdba74", "#fb923c",
  "#fecaca", "#fda4af", "#fed7aa", "#ffedd5", "#ffd9b3",
  "#e9d5ff", "#ddd6fe", "#c4b5fd", "#bfdbfe", "#93c5fd",
  "#d1fae5", "#a7f3d0", "#bbf7d0", "#ccfbf1", "#e0f2fe",
  "#ffffff", "#fff5d6", "#ffe8b3", "#ffd1a1", "#ffb873",
  "#f2e3c8", "#e6d3b3", "#f8d8d8", "#f0c4c4", "#ffe4c9",
];

const FONT_SWATCHES = [
  "#1f2937", "#991b1b", "#c2410c", "#92400e", "#b45309",
  "#166534", "#1e40af", "#3730a3", "#7e22ce", "#831843",
  "#9ca3af", "#ffffff",
];

const ExcelToolbar = ({
  collapsed = false,
  onToggleCollapse,
  readOnly = false,

  fileLabel = "",
  activeFileId = "",
  importedFiles = [],
  onSelectFile,

  saveFlash = "",
  infoBadge = "",

  onSave,
  onImport,
  onExport,
  onPublish,
  publishingPublish = false,
  canPublish = false,
  onNewFile,
  onHistory,
  onRenameFile,
  onDeleteFile,
  onClearAll,

  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,

  onBold,
  boldActive = false,
  onItalic,
  italicActive = false,
  onUnderline,
  underlineActive = false,
  onFontSize,
  onFontColor,
  onApplyFill,
  fillColor = "#fff2cc",

  onAlignH,
  alignH = null,
  onAlignV,
  onWrapToggle,
  wrapActive = false,

  onInsertRow,
  onDeleteRow,
  onInsertCol,
  onDeleteCol,
  onAddSheet,

  onMergeCells,
  onUnmergeCells,
  onApplyBorders,
  borderWeight = 1,
  onBorderWeight,

  onSortAsc,
  onSortDesc,
  filterOn = false,
  onToggleFilter,
  searchText = "",
  onSearchChange,
  onFindNext,
  matchCount = null,

  freezeOn = true,
  onToggleFreeze,

  onChart,
  onCompare,
  onAddShape = null,
  onAddImage = null,
  selShape = null,
  onShapeFill = null,
  onShapeTextColor = null,
  onShapeBold = null,

  zoom = 1,
  onZoomIn = null,
  onZoomOut = null,
  onZoomReset = null,
}) => {
  const [open, setOpen] = React.useState(null);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    const onDocDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const toggle = (name) => setOpen((cur) => (cur === name ? null : name));

  const menuBtn = (name, label) => (
    <div className={`ee-mm${open === name ? " open" : ""}`}>
      <button
        className="ee-top-btn ee-top-more"
        type="button"
        onClick={() => toggle(name)}
      >
        {label} <span className="ee-caret" />
      </button>
      {open === name && title(name)}
    </div>
  );

  const title = (name) => {
    if (name === "file") {
      return (
        <div className="ee-mm-pop">
          {!readOnly && (
            <button className={`ee-mm-item${filterOn ? "" : ""}`} type="button" onClick={() => { setOpen(null); onNewFile && onNewFile(); }}>
              <span className="ee-mm-ic">&#10133;</span> File Baru
            </button>
          )}
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onHistory && onHistory(); }}>
            <span className="ee-mm-ic">&#128337;</span> Riwayat / Backup
          </button>
          {!readOnly && (
            <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onRenameFile && onRenameFile(); }}>
              <span className="ee-mm-ic">&#9998;</span> Ubah Nama
            </button>
          )}
          {!readOnly && (
            <React.Fragment>
              <div className="ee-mm-sep" />
              <button className="ee-mm-item danger" type="button" onClick={() => { setOpen(null); onDeleteFile && onDeleteFile(); }}>
                <span className="ee-mm-ic">&#128465;</span> Hapus File Ini
              </button>
              <button className="ee-mm-item danger" type="button" onClick={() => { setOpen(null); onClearAll && onClearAll(); }}>
                <span className="ee-mm-ic">&#10060;</span> Hapus Semua Isi
              </button>
            </React.Fragment>
          )}
        </div>
      );
    }
    if (name === "format") {
      return (
        <div className="ee-mm-pop ee-mm-format">
          <div className="ee-mm-label">Huruf</div>
          <div className="ee-mm-row">
            <button className={`ee-mm-chip${boldActive ? " active" : ""}`} type="button" onClick={onBold} title="Cetak tebal (Bold)">
              <b>B</b>
            </button>
            <button className={`ee-mm-chip${italicActive ? " active" : ""}`} type="button" onClick={onItalic} title="Cetak miring (Italic)">
              <i>I</i>
            </button>
            <button className={`ee-mm-chip${underlineActive ? " active" : ""}`} type="button" onClick={onUnderline} title="Garis bawah (Underline)">
              <u>U</u>
            </button>
            <button className="ee-mm-chip" type="button" onClick={() => onFontSize && onFontSize(1)} title="Perbesar ukuran huruf">
              A&nbsp;&plus;
            </button>
            <button className="ee-mm-chip" type="button" onClick={() => onFontSize && onFontSize(-1)} title="Perkecil ukuran huruf">
              A&nbsp;&minus;
            </button>
          </div>

          <div className="ee-mm-label">Perataan teks</div>
          <div className="ee-mm-row">
            <span className="ee-mm-alignkey">Mendatar:</span>
            {[["left", "Kiri"], ["center", "Tengah"], ["right", "Kanan"]].map(([v, t]) => (
              <button key={v} className={`ee-mm-chip${alignH === v ? " active" : ""}`} type="button" title={`Rata teks ke ${t.toLowerCase()}`} onClick={() => onAlignH && onAlignH(v)}>
                {t}
              </button>
            ))}
          </div>
          <div className="ee-mm-row">
            <span className="ee-mm-alignkey">Vertikal:</span>
            {[["top", "Atas"], ["middle", "Tengah"], ["bottom", "Bawah"]].map(([v, t]) => (
              <button key={v} className="ee-mm-chip" type="button" title={`Rata teks ke ${t.toLowerCase()}`} onClick={() => onAlignV && onAlignV(v)}>
                {t}
              </button>
            ))}
            <button className={`ee-mm-chip${wrapActive ? " active" : ""}`} type="button" title="Bungkus teks panjang di dalam sel (wrap)" onClick={onWrapToggle}>
              Bungkus
            </button>
          </div>

          <div className="ee-mm-label">Warna teks (huruf)</div>
          <div className="ee-mm-ready">
            {FONT_SWATCHES.map((c) => (
              <button key={c} className="ee-mm-swatch" type="button" style={{ background: c }} title={c} onClick={() => onFontColor && onFontColor(c)} />
            ))}
          </div>

          <div className="ee-mm-label">Warna latar sel</div>
          <div className="ee-mm-ready">
            {FILL_SWATCHES.map((c) => (
              <button key={c} className="ee-mm-swatch" type="button" style={{ background: c }} title={c} onClick={() => onApplyFill && onApplyFill(c)} />
            ))}
            <button className="ee-mm-swatch ee-mm-none" type="button" title="Hapus warna latar" onClick={() => onApplyFill && onApplyFill(null)} />
            <label className="ee-mm-custom" title="Pilih warna khusus">
              <input type="color" value={fillColor} onChange={(e) => onApplyFill && onApplyFill(e.target.value)} />
            </label>
          </div>

          <div className="ee-mm-gridsep" />
          <div className="ee-mm-label">Gabung sel</div>
          <div className="ee-mm-row">
            <button className="ee-mm-chip" type="button" title="Gabungkan sel yang dipilih menjadi satu" onClick={() => { setOpen(null); onMergeCells && onMergeCells(); }}>
              &#8862; Gabung
            </button>
            <button className="ee-mm-chip" type="button" title="Pisahkan kembali sel yang sudah digabung" onClick={() => { setOpen(null); onUnmergeCells && onUnmergeCells(); }}>
              &#8863; Pisah
            </button>
          </div>

          <div className="ee-mm-label">Bingkai sel</div>
          <div className="ee-mm-row">
            {[["outline", "Luar"], ["all", "Semua"], ["t", "Atas"], ["b", "Bawah"], ["l", "Kiri"], ["r", "Kanan"]].map(([v, label]) => (
              <button key={v} className="ee-mm-chip" type="button" title={`Berikan bingkai ${label.toLowerCase()}`} onClick={() => onApplyBorders && onApplyBorders([v], borderWeight)}>
                {label}
              </button>
            ))}
            <button className="ee-mm-chip" type="button" title="Hapus semua bingkai di area terpilih" onClick={() => onApplyBorders && onApplyBorders(["none"], 0)}>
              Hapus
            </button>
          </div>
          <div className="ee-mm-row">
            <span className="ee-mm-alignkey">Ketebalan:</span>
            {[[1, "Tipis"], [2, "Sedang"], [3, "Tebal"]].map(([w, label]) => (
              <button key={w} className={`ee-mm-chip${borderWeight === w ? " active" : ""}`} type="button" title={`Ketebalan bingkai ${label.toLowerCase()}`} onClick={() => onBorderWeight && onBorderWeight(w)}>
                {label}
              </button>
            ))}
          </div>

          <div className="ee-mm-gridsep" />
          <div className="ee-mm-label">Warna bentuk terpilih</div>
          {selShape && selShape.type === "shape" ? (
            <>
              <div className="ee-mm-ready">
                {FILL_SWATCHES.map((c) => (
                  <button key={c} className="ee-mm-swatch" type="button" style={{ background: c }} title={c} onClick={() => onShapeFill && onShapeFill(c)} />
                ))}
                <button className="ee-mm-swatch ee-mm-none" type="button" title="Tanpa warna (transparan)" onClick={() => onShapeFill && onShapeFill(null)} />
                <label className="ee-mm-custom" title="Warna khusus untuk bentuk">
                  <input type="color" value={selShape.fill && selShape.fill !== "transparent" ? selShape.fill : "#e53935"} onChange={(e) => onShapeFill && onShapeFill(e.target.value)} />
                </label>
              </div>
              <div className="ee-mm-row">
                <span className="ee-mm-alignkey">Teks:</span>
                <button className={`ee-mm-chip${selShape.bold ? " active" : ""}`} type="button" title="Cetak tebal pada teks bentuk" onClick={onShapeBold}>
                  <b>T</b>
                </button>
                {FONT_SWATCHES.slice(0, 10).map((c) => (
                  <button key={c} className="ee-mm-chip" type="button" style={{ width: 22, height: 22, minWidth: 0, padding: 0, background: c }} title={`Warna teks bentuk ${c}`} onClick={() => onShapeTextColor && onShapeTextColor(c)} />
                ))}
              </div>
            </>
          ) : selShape ? (
            <span className="ee-mm-note">Gambar terpilih tidak memiliki warna latar.</span>
          ) : (
            <span className="ee-mm-note">Klik sebuah bentuk di sheet terlebih dahulu untuk mengatur warnanya di sini.</span>
          )}

          <div className="ee-mm-gridsep" />
          <div className="ee-mm-row">
            <button className={`ee-mm-chip${freezeOn ? " active" : ""}`} type="button" title="Kunci baris / kolom pertama agar tetap terlihat saat halaman digulir" onClick={onToggleFreeze}>
              {freezeOn ? "Buka Kunci" : "Kunci Baris/Header"}
            </button>
          </div>
        </div>
      );
    }
    if (name === "data") {
      return (
        <div className="ee-mm-pop">
          <div className="ee-mm-label">Urutan</div>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onSortAsc && onSortAsc(); }}>
            <span className="ee-mm-ic">A&darr;Z</span> Urutkan Naik (A-Z)
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onSortDesc && onSortDesc(); }}>
            <span className="ee-mm-ic">Z&darr;A</span> Urutkan Turun (Z-A)
          </button>

          <div className="ee-mm-sep" />
          <div className="ee-mm-label">Filter &amp; cari</div>
          <button className={`ee-mm-item${filterOn ? " active" : ""}`} type="button" onClick={() => { onToggleFilter && onToggleFilter(); }} title="Tampilkan / sembunyikan tombol filter di header kolom">
            <span className="ee-mm-ic">&#128269;</span> Filter Kolom {filterOn ? "(Aktif)" : "(Off)"}
          </button>
          <div className="ee-mm-search">
            <input
              className="ee-mm-search-input"
              type="text"
              placeholder="Cari nilai di sheet &hellip;"
              value={searchText}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onFindNext && onFindNext();
                }
              }}
            />
            <button className="ee-mm-search-btn" type="button" onClick={onFindNext} title="Cari / lanjut ke hasil berikutnya">
              {typeof matchCount === "number" ? `Cari (${matchCount})` : "Cari"}
            </button>
          </div>
          <span className="ee-mm-note" style={{ marginTop: 6 }}>Tekan Enter sekali lagi untuk melompat ke hasil berikutnya.</span>
        </div>
      );
    }
    if (name === "insert") {
      return (
        <div className="ee-mm-pop">
          <div className="ee-mm-label">Baris</div>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onInsertRow && onInsertRow(); }}>
            <span className="ee-mm-ic">&#8681;</span> Sisip Baris &mdash; di atas sel aktif
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onDeleteRow && onDeleteRow(); }}>
            <span className="ee-mm-ic">&minus;&#8681;</span> Hapus Baris &mdash; baris berisi sel aktif
          </button>

          <div className="ee-mm-label">Kolom</div>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onInsertCol && onInsertCol(); }}>
            <span className="ee-mm-ic">&#8680;</span> Sisip Kolom &mdash; di kiri sel aktif
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onDeleteCol && onDeleteCol(); }}>
            <span className="ee-mm-ic">&minus;&#8680;</span> Hapus Kolom &mdash; kolom berisi sel aktif
          </button>

          <div className="ee-mm-label">Lembar kerja (sheet)</div>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onAddSheet && onAddSheet(); }}>
            <span className="ee-mm-ic">+</span> Tambah Sheet Baru
          </button>

          <div className="ee-mm-sep" />
          <div className="ee-mm-label">Bentuk (Shape)</div>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onAddShape && onAddShape("rect", "#e53935"); }}>
            <span className="ee-mm-icsw" style={{ background: "#e53935", borderRadius: 3 }} /> Kotak (Merah)
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onAddShape && onAddShape("rect", "#3b6fd4"); }}>
            <span className="ee-mm-icsw" style={{ background: "#3b6fd4", borderRadius: 3 }} /> Kotak (Biru)
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onAddShape && onAddShape("oval", "#e53935"); }}>
            <span className="ee-mm-icsw" style={{ background: "#e53935", borderRadius: "50%" }} /> Elips (Merah)
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onAddShape && onAddShape("triangle", "#f59e0b"); }}>
            <span className="ee-mm-icsw" style={{ background: "#f59e0b", clipPath: "polygon(50% 0, 100% 100%, 0 100%)", borderRadius: 0 }} /> Segitiga (Kuning)
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onAddShape && onAddShape("diamond", "#8b5cf6"); }}>
            <span className="ee-mm-icsw" style={{ background: "#8b5cf6", clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)", borderRadius: 0 }} /> Belah Ketupat (Ungu)
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onAddShape && onAddShape("arrowR", "#2f9e44"); }}>
            <span className="ee-mm-icsw" style={{ background: "#2f9e44", clipPath: "polygon(0 0, 55% 0, 55% 18%, 100% 50%, 55% 82%, 55% 100%, 0 100%)", borderRadius: 0 }} /> Panah Kanan (Hijau)
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onAddShape && onAddShape("arrowD", "#e8590c"); }}>
            <span className="ee-mm-icsw" style={{ background: "#e8590c", clipPath: "polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%)", borderRadius: 0 }} /> Panah Bawah (Oranye)
          </button>

          <div className="ee-mm-sep" />
          <div className="ee-mm-label">Gambar</div>
          <label className="ee-mm-item" style={{ cursor: "pointer" }} title="Pilih foto/gambar dari komputer untuk ditempatkan di sheet">
            <span className="ee-mm-ic">&#128444;</span> Gambar dari Komputer
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                e.target.value = "";
                setOpen(null);
                if (f && onAddImage) onAddImage(f);
              }}
            />
          </label>

          <div className="ee-mm-sep" />
          <div className="ee-mm-label">Analisis</div>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onChart && onChart(); }}>
            <span className="ee-mm-ic">&#128201;</span> Buat Grafik (Chart)
          </button>
          <button className="ee-mm-item" type="button" onClick={() => { setOpen(null); onCompare && onCompare(); }}>
            <span className="ee-mm-ic">&#8693;</span> Perbandingan Antar Periode
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`ee-top${collapsed ? " collapsed" : ""}`} ref={rootRef}>
      <div className="ee-top-row">
        <button
          className="ee-top-toggle"
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "Tampilkan menu alat" : "Sembunyikan menu alat"}
        >
          {collapsed ? "\u25B8" : "\u25BE"}
        </button>

        {!collapsed ? (
          <React.Fragment>
            {menuBtn("file", "File")}
            {!readOnly && (
              <button className="ee-top-btn primary" type="button" onClick={onSave} title="Simpan file (backup otomatis)">
                <span className="ee-top-ic">&#128190;</span> Simpan
              </button>
            )}
            {!readOnly && (
              <button className="ee-top-btn" type="button" onClick={onImport} title="Impor file Excel">
                &#11015; Impor
              </button>
            )}
            {!readOnly && canPublish && (
              <button className="ee-top-btn" type="button" onClick={onPublish} disabled={publishingPublish} title="Kirim file ke server agar muncul di Penugasan Tabel">
                {publishingPublish ? "Menerbitkan..." : "\u2191\u2606 Publikasikan"}
              </button>
            )}
            <button className="ee-top-btn" type="button" onClick={onExport} title="Ekspor ke file Excel">
              &#11014; Ekspor
            </button>
            {!readOnly && (
              <React.Fragment>
                <span className="ee-top-sep" />
                <button className="ee-top-btn" type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                  &#8630; Undo
                </button>
                <button className="ee-top-btn" type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
                  &#8631; Redo
                </button>
              </React.Fragment>
            )}
            <span className="ee-top-sep" />
            {!readOnly && menuBtn("format", "Format")}
            {menuBtn("data", "Data")}
            {!readOnly && menuBtn("insert", "Sisip")}
          </React.Fragment>
        ) : null}

        <span className="ee-top-grow" />

        <div className="ee-zoom" title="Perbesar/perkecil (Ctrl + roda mouse, Ctrl+= / Ctrl+- / Ctrl+0)">
          <button className="ee-top-btn ee-zoom-btn" type="button" onClick={onZoomOut} title="Perkecil (Ctrl+-)">&#8722;</button>
          <button className="ee-zoom-label" type="button" onClick={onZoomReset} title="Reset ke 100% (Ctrl+0)">
            {Math.round(zoom * 100)}%
          </button>
          <button className="ee-top-btn ee-zoom-btn" type="button" onClick={onZoomIn} title="Perbesar (Ctrl+=)">&#43;</button>
        </div>

        {importedFiles.length === 0 ? (
          <span className="ee-top-none">Belum ada file terimport</span>
        ) : (
          <select
            className="ee-top-select"
            value={activeFileId || ""}
            onChange={(e) => onSelectFile && onSelectFile(e.target.value)}
            title="Pilih file excel yang diimport"
          >
            {importedFiles.map((f) => (
              <option key={f.id} value={f.id}>{f.fileName}</option>
            ))}
          </select>
        )}

        {fileLabel && !collapsed ? <span className="ee-top-file" title={fileLabel}>{fileLabel}</span> : null}

        {saveFlash ? <span className="ee-save-flash">{saveFlash}</span> : null}
        {infoBadge ? <span className="ee-info-badge">{infoBadge}</span> : null}
      </div>
    </div>
  );
};

export default ExcelToolbar;
export { FILL_SWATCHES };