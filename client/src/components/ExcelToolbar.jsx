import React from "react";
import { createPortal } from "react-dom";

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

// Galeri ala Excel untuk tab Insert: bentuk, bagan, simbol & potongan rumus.
// Semuanya memakai handler yang sudah ada (tidak ada logika grid baru).
const SHAPE_GALLERY = [
  ["rect", "▢", "Kotak", "#e53935"],
  ["rect", "▤", "Kotak Biru", "#3b6fd4"],
  ["oval", "○", "Elips", "#e53935"],
  ["oval", "⬤", "Lingkaran Biru", "#3b6fd4"],
  ["triangle", "△", "Segitiga", "#f59e0b"],
  ["diamond", "◇", "Wajik", "#8b5cf6"],
  ["arrowR", "➡", "Panah kanan", "#2f9e44"],
  ["arrowD", "⬇", "Panah bawah", "#e8590c"],
];
const CHART_GALLERY = [
  ["bar", "📊", "Column"],
  ["line", "📈", "Line"],
  ["pie", "🥧", "Pie"],
  ["doughnut", "🍩", "Doughnut"],
  ["area", "⛰", "Area"],
];
const SYMBOL_GALLERY = ["★", "☆", "✓", "✗", "→", "←", "↑", "↓", "●", "◆", "▲", "■", "♥", "∑", "π", "√", "∞", "≠", "±", "°"];
const FORMULA_SNIPPETS = ["=SUM()", "=AVERAGE()", "=IF()", "=COUNT()", "=MAX()", "=MIN()"];
// Pustaka fungsi sesuai mesin rumus yang didukung (lihat spreadsheet.js FUNCS).
const FN_MATH = ["=SUM()", "=AVERAGE()", "=COUNT()", "=COUNTA()", "=MAX()", "=MIN()", "=ROUND()", "=SUMIF()", "=COUNTIF()"];
const FN_LOGIC = ["=IF()", "=IFERROR()", "=AND()", "=OR()", "=NOT()"];
const FN_TEXT = ["=CONCAT()", "=TEXT()", "=UPPER()", "=LOWER()", "=TRIM()", "=LEN()", "=LEFT()", "=RIGHT()", "=MID()"];
const FN_DATE = ["=TODAY()", "=NOW()"];
const RIBBON_TABS = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "layout", label: "Page Layout" },
  { id: "formulas", label: "Formulas" },
  { id: "data", label: "Data" },
  { id: "review", label: "Review" },
  { id: "view", label: "View" },
];

const S = {
  save: "▤", undo: "↶", redo: "↷", import: "⬆", export: "⬇",
  filter: "⧩", find: "🔍", freeze: "🧊", chart: "📊", compare: "📈",
  picture: "🖼", history: "🕘", rename: "✎", del: "🗑", clear: "⌫",
  plus: "＋", minus: "－",
};

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
  onFindPrevious,
  onSelectAll,
  matchCount = null,
  freezeOn = true,
  onToggleFreeze,
  onAutoFit = null,
  onRemoveDuplicates = null,
  onChart,
  onCompare,
  chartType = "bar",
  onChartType = null,
  onAddShape = null,
  onAddImage = null,
  onInsertSymbol = null,
  selShape = null,
  onShapeFill = null,
  onShapeTextColor = null,
  onShapeBold = null,
  zoom = 1,
  onZoomIn = null,
  onZoomOut = null,
  onZoomReset = null,
}) => {
  const [activeTab, setActiveTab] = React.useState("home");
  const [fileOpen, setFileOpen] = React.useState(false);
  const [findSelectOpen, setFindSelectOpen] = React.useState(false);
  const [openRibbonMenu, setOpenRibbonMenu] = React.useState(null);
  const [ribbonMenuPosition, setRibbonMenuPosition] = React.useState({ top: 0, left: 0, ready: false });
  const rootRef = React.useRef(null);
  const tabsRef = React.useRef(null);
  const findSelectRef = React.useRef(null);
  const searchInputRef = React.useRef(null);
  const ribbonMenuTriggersRef = React.useRef({});
  const ribbonMenuPopupRef = React.useRef(null);
  const focusSearchOnTabRef = React.useRef(false);

  React.useEffect(() => {
    const onDocDown = (e) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target) &&
        !ribbonMenuPopupRef.current?.contains(e.target)
      ) {
        setFileOpen(false);
        setFindSelectOpen(false);
        setOpenRibbonMenu(null);
      }
      if (findSelectRef.current && !findSelectRef.current.contains(e.target)) setFindSelectOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const positionRibbonMenu = React.useCallback(() => {
    if (!openRibbonMenu) return;
    const trigger = ribbonMenuTriggersRef.current[openRibbonMenu];
    const popup = ribbonMenuPopupRef.current;
    if (!trigger || !popup) return;

    const triggerRect = trigger.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const edge = 8;
    const left = Math.max(edge, Math.min(triggerRect.left, window.innerWidth - popupRect.width - edge));
    const below = triggerRect.bottom + 6;
    const top = below + popupRect.height <= window.innerHeight - edge
      ? below
      : Math.max(edge, triggerRect.top - popupRect.height - 6);

    setRibbonMenuPosition({ top, left, ready: true });
  }, [openRibbonMenu]);

  React.useLayoutEffect(() => {
    if (!openRibbonMenu) {
      setRibbonMenuPosition((position) => position.ready ? { ...position, ready: false } : position);
      return undefined;
    }

    positionRibbonMenu();
    window.addEventListener("resize", positionRibbonMenu);
    window.addEventListener("scroll", positionRibbonMenu, true);
    return () => {
      window.removeEventListener("resize", positionRibbonMenu);
      window.removeEventListener("scroll", positionRibbonMenu, true);
    };
  }, [openRibbonMenu, positionRibbonMenu]);

  React.useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindSelectOpen(false);
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        } else {
          focusSearchOnTabRef.current = true;
          setActiveTab("home");
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (activeTab === "home" && focusSearchOnTabRef.current) {
      focusSearchOnTabRef.current = false;
      searchInputRef.current?.focus();
    }
  }, [activeTab]);

  const selectTab = (id) => {
    setOpenRibbonMenu(null);
    setActiveTab(id);
    requestAnimationFrame(() => {
      try {
        tabsRef.current?.querySelector(`[data-tab="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (_) {}
    });
  };

  const searchBox = (key, inputRef = null) => (
    <div className="ee-mm-search" key={key}>
      <input
        ref={inputRef}
        className="ee-mm-search-input"
        type="text"
        placeholder="Cari nilai di sheet …"
        value={searchText}
        onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onFindNext && onFindNext(); } }}
      />
      <button className="ee-mm-search-btn" type="button" onClick={onFindNext} title="Cari / lanjut ke hasil berikutnya">
        {typeof matchCount === "number" ? `${S.find} (${matchCount})` : `${S.find} Cari`}
      </button>
    </div>
  );

  const ribbonMenu = (id, label, icon, items, menuClass = "") => (
    <div className="ee-mm ee-rb-menu">
      <button
        ref={(element) => {
          if (element) ribbonMenuTriggersRef.current[id] = element;
          else delete ribbonMenuTriggersRef.current[id];
        }}
        className="ee-mm-chip ee-rb-menu-trigger"
        type="button"
        title={label}
        aria-haspopup="menu"
        aria-expanded={openRibbonMenu === id}
        onClick={() => setOpenRibbonMenu((current) => current === id ? null : id)}
      >
        <span>{icon}</span> {label} <span className="ee-caret" />
      </button>
      {openRibbonMenu === id && typeof document !== "undefined" && createPortal(
        <div
          ref={ribbonMenuPopupRef}
          className={`ee-mm-pop ee-rb-pop${menuClass ? ` ${menuClass}` : ""}`}
          role="menu"
          style={{
            position: "fixed",
            top: ribbonMenuPosition.top,
            left: ribbonMenuPosition.left,
            visibility: ribbonMenuPosition.ready ? "visible" : "hidden",
            zIndex: 1000,
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              aria-current={item.active ? "true" : undefined}
              className={`ee-mm-item${item.active ? " active" : ""}`}
              title={item.title || item.label}
              onClick={() => {
                setOpenRibbonMenu(null);
                item.onSelect();
              }}
            >
              {item.icon && <span className="ee-mm-ic">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );

  const renderHome = () => (
    <div className="ee-rb-panel" role="tabpanel" aria-label="Home">
      <div className="ee-rb-group">
        <div className="ee-rb-group-body ee-find-select-body">
          {searchBox("home-search", searchInputRef)}
          <div className="ee-mm" ref={findSelectRef}>
            <button
              className="ee-mm-chip ee-find-select-trigger"
              type="button"
              title="Find and Select"
              aria-haspopup="menu"
              aria-expanded={findSelectOpen}
              onClick={() => setFindSelectOpen((open) => !open)}
            >
              🔍 Find &amp; Select <span className="ee-caret" />
            </button>
            {findSelectOpen && (
              <div className="ee-mm-pop ee-find-select-pop" role="menu">
                <button
                  className="ee-mm-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setFindSelectOpen(false);
                    searchInputRef.current?.focus();
                  }}
                >
                  <span className="ee-mm-ic">⌕</span> Find…
                </button>
                <button
                  className="ee-mm-item"
                  type="button"
                  role="menuitem"
                  disabled={!searchText.trim()}
                  onClick={() => {
                    setFindSelectOpen(false);
                    onFindNext && onFindNext();
                  }}
                >
                  <span className="ee-mm-ic">↓</span> Find Next
                </button>
                <button
                  className="ee-mm-item"
                  type="button"
                  role="menuitem"
                  disabled={!searchText.trim()}
                  onClick={() => {
                    setFindSelectOpen(false);
                    onFindPrevious && onFindPrevious();
                  }}
                >
                  <span className="ee-mm-ic">↑</span> Find Previous
                </button>
                <div className="ee-mm-sep" />
                <button
                  className="ee-mm-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setFindSelectOpen(false);
                    onSelectAll && onSelectAll();
                  }}
                >
                  <span className="ee-mm-ic">▦</span> Select All
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="ee-rb-group-label">Find &amp; Select</div>
      </div>
      {readOnly ? (
        <div className="ee-rb-group">
          <div className="ee-rb-group-body"><span className="ee-mm-note">Mode hanya-lihat: pemformatan dinonaktifkan.</span></div>
          <div className="ee-rb-group-label">Home</div>
        </div>
      ) : (
        <React.Fragment>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              <button className={`ee-mm-chip${boldActive ? " active" : ""}`} type="button" onClick={onBold} title="Bold"><b>B</b></button>
              <button className={`ee-mm-chip${italicActive ? " active" : ""}`} type="button" onClick={onItalic} title="Italic"><i>I</i></button>
              <button className={`ee-mm-chip${underlineActive ? " active" : ""}`} type="button" onClick={onUnderline} title="Underline"><u>U</u></button>
              <button className="ee-mm-chip" type="button" onClick={() => onFontSize && onFontSize(1)} title="Perbesar huruf">A＋</button>
              <button className="ee-mm-chip" type="button" onClick={() => onFontSize && onFontSize(-1)} title="Perkecil huruf">A－</button>
            </div>
            <div className="ee-rb-group-label">Font</div>
          </div>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body ee-rb-colors">
              <span className="ee-mm-alignkey">A Teks:</span>
              {FONT_SWATCHES.slice(0, 10).map((c) => (
                <button key={c} className="ee-mm-swatch" type="button" style={{ background: c }} title={c} onClick={() => onFontColor && onFontColor(c)} />
              ))}
            </div>
            <div className="ee-rb-group-body ee-rb-colors">
              <span className="ee-mm-alignkey">🪣 Latar:</span>
              {FILL_SWATCHES.slice(0, 10).map((c) => (
                <button key={c} className="ee-mm-swatch" type="button" style={{ background: c }} title={c} onClick={() => onApplyFill && onApplyFill(c)} />
              ))}
              <button className="ee-mm-swatch ee-mm-none" type="button" title="Hapus warna latar" onClick={() => onApplyFill && onApplyFill(null)} />
              <label className="ee-mm-custom" title="Warna khusus">
                <input type="color" value={fillColor} onChange={(e) => onApplyFill && onApplyFill(e.target.value)} />
              </label>
            </div>
            <div className="ee-rb-group-label">Warna</div>
          </div>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              <span className="ee-mm-alignkey">☰ Mendatar:</span>
              {[["left", "☰ Kiri"], ["center", "≡ Tengah"], ["right", "☷ Kanan"]].map(([v, t]) => (
                <button key={v} className={`ee-mm-chip${alignH === v ? " active" : ""}`} type="button" title={t} onClick={() => onAlignH && onAlignH(v)}>{t}</button>
              ))}
            </div>
            <div className="ee-rb-group-body">
              <span className="ee-mm-alignkey">↕ Vertikal:</span>
              {[["top", "⬆ Atas"], ["middle", "⬌ Tengah"], ["bottom", "⬇ Bawah"]].map(([v, t]) => (
                <button key={v} className="ee-mm-chip" type="button" title={t} onClick={() => onAlignV && onAlignV(v)}>{t}</button>
              ))}
              <button className={`ee-mm-chip${wrapActive ? " active" : ""}`} type="button" title="Wrap Text" onClick={onWrapToggle}>↵ Bungkus</button>
            </div>
            <div className="ee-rb-group-label">Perataan</div>
          </div>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              <button className="ee-mm-chip" type="button" title="Merge Cells" onClick={() => onMergeCells && onMergeCells()}>⊞ Gabung</button>
              <button className="ee-mm-chip" type="button" title="Unmerge" onClick={() => onUnmergeCells && onUnmergeCells()}>⊟ Pisah</button>
            </div>
            <div className="ee-rb-group-body">
              {[["outline", "▢"], ["all", "▦"], ["t", "￣"], ["b", "＿"], ["l", "▏"], ["r", "▕"]].map(([v, g]) => (
                <button key={v} className="ee-mm-chip" type="button" title={`Border ${v}`} onClick={() => onApplyBorders && onApplyBorders([v], borderWeight)}>{g}</button>
              ))}
              <button className="ee-mm-chip" type="button" title="Hapus bingkai" onClick={() => onApplyBorders && onApplyBorders(["none"], 0)}>⌫</button>
            </div>
            <div className="ee-rb-group-label">Sel &amp; Bingkai</div>
          </div>
        </React.Fragment>
      )}
    </div>
  );

  // Sisip simbol / potongan rumus ke sel aktif. Bila editor belum
  // menyediakan onInsertSymbol (kompatibilitas), salin ke clipboard.
  const insertSym = (sym) => {
    if (onInsertSymbol) { onInsertSymbol(sym); return; }
    try {
      if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(String(sym));
    } catch (_) {}
  };
  const pickChart = (t) => {
    if (onChartType) onChartType(t);
    else if (onChart) onChart();
  };
  // Format seleksi sebagai tabel (header berwarna + tebal + bingkai),
  // memakai handler seleksi yang sudah ada sehingga aman untuk readOnly.
  const formatAsTable = () => {
    if (onApplyFill) onApplyFill("#DDEBF7");
    if (!boldActive && onBold) onBold();
    if (onApplyBorders) onApplyBorders(["all"], 1);
  };
  // Jadikan seleksi terlihat seperti tautan (biru + garis bawah).
  const markAsLink = () => {
    if (onFontColor) onFontColor("#0563C1");
    if (!underlineActive && onUnderline) onUnderline();
  };

  const renderInsert = () => (
    <div className="ee-rb-panel" role="tabpanel" aria-label="Insert">
      {readOnly ? (
        <div className="ee-rb-group">
          <div className="ee-rb-group-body"><span className="ee-mm-note">Mode hanya-lihat.</span></div>
          <div className="ee-rb-group-label">Insert</div>
        </div>
      ) : (
        <React.Fragment>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              <button className="ee-mm-chip" type="button" title="Sisip baris" onClick={() => onInsertRow && onInsertRow()}>＋ Baris</button>
              <button className="ee-mm-chip" type="button" title="Sisip kolom" onClick={() => onInsertCol && onInsertCol()}>＋ Kolom</button>
              <button className="ee-mm-chip" type="button" title="Sheet baru" onClick={() => onAddSheet && onAddSheet()}>＋ Sheet</button>
              {ribbonMenu("insert-delete", "Hapus", "−", [
                { icon: "▤", label: "Hapus baris", onSelect: () => onDeleteRow && onDeleteRow() },
                { icon: "▥", label: "Hapus kolom", onSelect: () => onDeleteCol && onDeleteCol() },
              ])}
            </div>
            <div className="ee-rb-group-label">Sisipkan</div>
          </div>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              <button className="ee-mm-chip" type="button" title="Format seleksi sebagai tabel (header biru + bingkai)" onClick={formatAsTable}>📋 Tabel</button>
              <button className={`ee-mm-chip${filterOn ? " active" : ""}`} type="button" title="Slicer: tampil/sembunyi filter kolom" onClick={() => onToggleFilter && onToggleFilter()}>⧩ Slicer</button>
            </div>
            <div className="ee-rb-group-label">Tabel</div>
          </div>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              {ribbonMenu("insert-shapes", "Bentuk", "◇", SHAPE_GALLERY.map(([kind, glyph, label, fill]) => ({
                icon: glyph,
                label,
                onSelect: () => onAddShape && onAddShape(kind, fill),
              })), "ee-rb-pop-shapes")}
              <label className="ee-mm-chip" style={{ cursor: "pointer" }} title="Gambar dari komputer (Pictures)">{S.picture} Gambar
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && onAddImage) onAddImage(f); }} />
              </label>
            </div>
            <div className="ee-rb-group-label">Ilustrasi</div>
          </div>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              {ribbonMenu("insert-charts", "Bagan", "▥", CHART_GALLERY.map(([type, glyph, label]) => ({
                icon: glyph,
                label,
                active: chartType === type,
                onSelect: () => pickChart(type),
              })), "ee-rb-pop-charts")}
              <button className="ee-mm-chip" type="button" title="Bandingkan periode" onClick={() => onCompare && onCompare()}>{S.compare} Bandingkan</button>
            </div>
            <div className="ee-rb-group-label">Bagan</div>
          </div>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              <button className="ee-mm-chip" type="button" title="Kotak teks — klik 2x untuk mengetik" onClick={() => onAddShape && onAddShape("rect", "#4472C4")}>▤ Teks</button>
              <button className="ee-mm-chip" type="button" title="WordArt — bentuk ungu, klik 2x untuk mengetik" onClick={() => onAddShape && onAddShape("diamond", "#8b5cf6")}>◇ WordArt</button>
              <button className="ee-mm-chip" type="button" title="Tautan — biru + garis bawah seleksi" onClick={markAsLink}>🔗 Link</button>
            </div>
            <div className="ee-rb-group-label">Teks &amp; Tautan</div>
          </div>
          <div className="ee-rb-group">
            <div className="ee-rb-group-body">
              {ribbonMenu("insert-symbols", "Simbol", "Ω", SYMBOL_GALLERY.map((symbol) => ({
                icon: symbol,
                label: symbol,
                onSelect: () => insertSym(symbol),
              })), "ee-rb-pop-symbols")}
              {ribbonMenu("insert-formulas", "Rumus", "fx", FORMULA_SNIPPETS.map((formula) => ({
                icon: "fx",
                label: formula,
                onSelect: () => insertSym(formula),
              })))}
            </div>
            <div className="ee-rb-group-label">Simbol &amp; Fungsi</div>
          </div>
        </React.Fragment>
      )}
    </div>
  );

  const renderLayout = () => (
    <div className="ee-rb-panel" role="tabpanel" aria-label="Page Layout">
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className={`ee-mm-chip${freezeOn ? " active" : ""}`} type="button" title="Kunci baris/header" onClick={onToggleFreeze}>{S.freeze} {freezeOn ? "Buka Kunci" : "Kunci"}</button>
          <button className={`ee-mm-chip${wrapActive ? " active" : ""}`} type="button" title="Wrap Text" onClick={onWrapToggle}>↵ Bungkus</button>
        </div>
        <div className="ee-rb-group-label">Bekukan &amp; Tata</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          {[["outline", "▢"], ["all", "▦"], ["t", "￣"], ["b", "＿"], ["l", "▏"], ["r", "▕"]].map(([v, g]) => (
            <button key={v} className="ee-mm-chip" type="button" title={`Bingkai ${v}`} onClick={() => onApplyBorders && onApplyBorders([v], borderWeight)}>{g}</button>
          ))}
        </div>
        <div className="ee-rb-group-body">
          <span className="ee-mm-alignkey">Ketebalan:</span>
          {[[1, "─ Tipis"], [2, "━ Sedang"], [3, "█ Tebal"]].map(([w, t]) => (
            <button key={w} className={`ee-mm-chip${borderWeight === w ? " active" : ""}`} type="button" onClick={() => onBorderWeight && onBorderWeight(w)}>{t}</button>
          ))}
        </div>
        <div className="ee-rb-group-label">Bingkai</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className="ee-mm-chip" type="button" title="Sesuaikan lebar kolom mengikuti isi" onClick={() => onAutoFit && onAutoFit()}>⇔ AutoFit</button>
        </div>
        <div className="ee-rb-group-body"><span className="ee-mm-note">Atau geser garis header.</span></div>
        <div className="ee-rb-group-label">Ukuran Sel</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className="ee-mm-chip" type="button" title="Perkecil (Ctrl+-)" onClick={onZoomOut}>－</button>
          <button className="ee-mm-chip" type="button" title="Reset 100% (Ctrl+0)" onClick={onZoomReset}>{Math.round(zoom * 100)}%</button>
          <button className="ee-mm-chip" type="button" title="Perbesar (Ctrl+=)" onClick={onZoomIn}>＋</button>
        </div>
        <div className="ee-rb-group-label">Zoom</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className="ee-mm-chip" type="button" title="Ekspor ke .xlsx untuk cetak" onClick={onExport}>{S.export} Ekspor</button>
        </div>
        <div className="ee-rb-group-body"><span className="ee-mm-note">Baris beku = judul cetak.</span></div>
        <div className="ee-rb-group-label">Cetak</div>
      </div>
    </div>
  );

  const renderFormulas = () => (
    <div className="ee-rb-panel" role="tabpanel" aria-label="Formulas">
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <span className="ee-mm-note ee-rb-formula-note"><i>fx</i> Rumus diawali <code>=</code>. Pilih fungsi untuk menyisipkannya ke sel aktif.</span>
        </div>
        <div className="ee-rb-group-label">Panduan Rumus</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          {ribbonMenu("formula-math", "Matematika", "∑", FN_MATH.map((formula) => ({
            icon: "fx",
            label: formula,
            onSelect: () => insertSym(formula),
          })))}
          {ribbonMenu("formula-logic", "Logika", "⑂", FN_LOGIC.map((formula) => ({
            icon: "fx",
            label: formula,
            onSelect: () => insertSym(formula),
          })))}
        </div>
        <div className="ee-rb-group-label">Fungsi</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          {ribbonMenu("formula-text", "Teks", "✎", FN_TEXT.map((formula) => ({
            icon: "fx",
            label: formula,
            onSelect: () => insertSym(formula),
          })))}
          {ribbonMenu("formula-date", "Tanggal", "📅", FN_DATE.map((formula) => ({
            icon: "fx",
            label: formula,
            onSelect: () => insertSym(formula),
          })))}
        </div>
        <div className="ee-rb-group-label">Teks &amp; Waktu</div>
      </div>
    </div>
  );

  const renderData = () => (
    <div className="ee-rb-panel" role="tabpanel" aria-label="Data">
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className="ee-mm-chip" type="button" title="Urut A-Z" onClick={() => onSortAsc && onSortAsc()}>A↓Z Naik</button>
          <button className="ee-mm-chip" type="button" title="Urut Z-A" onClick={() => onSortDesc && onSortDesc()}>Z↓A Turun</button>
        </div>
        <div className="ee-rb-group-label">Urutkan</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className={`ee-mm-chip${filterOn ? " active" : ""}`} type="button" title="Filter kolom" onClick={() => onToggleFilter && onToggleFilter()}>{S.filter} Filter {filterOn ? "(Aktif)" : "(Off)"}</button>
        </div>
        <div className="ee-rb-group-body">{searchBox("data-search")}</div>
        <div className="ee-rb-group-label">Filter &amp; Cari</div>
      </div>
      {!readOnly && (
        <div className="ee-rb-group">
          <div className="ee-rb-group-body">
            <button className="ee-mm-chip" type="button" title="Buang baris yang seluruh nilainya sama (pertahankan baris pertama)" onClick={() => onRemoveDuplicates && onRemoveDuplicates()}>⧉ Hapus Duplikat</button>
          </div>
          <div className="ee-rb-group-body"><span className="ee-mm-note">Cek seluruh kolom.</span></div>
          <div className="ee-rb-group-label">Alat Data</div>
        </div>
      )}
    </div>
  );

  const renderReview = () => (
    <div className="ee-rb-panel" role="tabpanel" aria-label="Review">
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          {!readOnly && <button className="ee-mm-chip" type="button" title="Simpan" onClick={onSave}>{S.save} Simpan</button>}
          <button className="ee-mm-chip" type="button" title="Riwayat" onClick={() => onHistory && onHistory()}>{S.history} Riwayat</button>
          {!readOnly && <button className="ee-mm-chip" type="button" title="Ubah nama" onClick={() => onRenameFile && onRenameFile()}>{S.rename} Nama</button>}
        </div>
        <div className="ee-rb-group-label">Berkas</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className="ee-mm-chip" type="button" title="Bandingkan antar periode" onClick={() => onCompare && onCompare()}>{S.compare} Bandingkan</button>
        </div>
        <div className="ee-rb-group-body"><span className="ee-mm-note">Riwayat melacak versi.</span></div>
        <div className="ee-rb-group-label">Perubahan</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className={`ee-mm-chip${freezeOn ? " active" : ""}`} type="button" title="Kunci baris/header" onClick={onToggleFreeze}>{S.freeze} {freezeOn ? "Buka Kunci" : "Kunci"}</button>
        </div>
        <div className="ee-rb-group-body"><span className="ee-mm-note">Sel terkunci admin tak bisa diedit.</span></div>
        <div className="ee-rb-group-label">Lindungi</div>
      </div>
      {!readOnly && (
        <div className="ee-rb-group">
          <div className="ee-rb-group-body">
            <button className="ee-mm-chip ee-mm-danger" type="button" title="Hapus file" onClick={() => onDeleteFile && onDeleteFile()}>{S.del} Hapus</button>
            <button className="ee-mm-chip ee-mm-danger" type="button" title="Hapus isi" onClick={() => onClearAll && onClearAll()}>{S.clear} Bersihkan</button>
          </div>
          <div className="ee-rb-group-label">Hapus</div>
        </div>
      )}
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          {selShape?.type === "shape" ? (
            <React.Fragment>
              {FILL_SWATCHES.slice(0, 8).map((c) => (
                <button key={c} className="ee-mm-swatch" type="button" style={{ background: c }} title={c} onClick={() => onShapeFill && onShapeFill(c)} />
              ))}
              <button className={`ee-mm-chip${selShape.bold ? " active" : ""}`} type="button" title="Tebal teks bentuk" onClick={onShapeBold}><b>T</b></button>
              {FONT_SWATCHES.slice(0, 6).map((c) => (
                <button key={c} className="ee-mm-chip" type="button" style={{ width: 22, height: 22, minWidth: 0, padding: 0, background: c }} title={c} onClick={() => onShapeTextColor && onShapeTextColor(c)} />
              ))}
            </React.Fragment>
          ) : <span className="ee-mm-note">Klik bentuk di sheet untuk ubah warna.</span>}
        </div>
        <div className="ee-rb-group-label">Bentuk</div>
      </div>
    </div>
  );

  const renderView = () => (
    <div className="ee-rb-panel" role="tabpanel" aria-label="View">
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className={`ee-mm-chip${freezeOn ? " active" : ""}`} type="button" title="Kunci baris/header" onClick={onToggleFreeze}>{S.freeze} {freezeOn ? "Buka Kunci" : "Kunci"}</button>
          <button className="ee-mm-chip" type="button" title="Sembunyikan ribbon" onClick={onToggleCollapse}>▾ Ribbon</button>
        </div>
        <div className="ee-rb-group-label">Jendela</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          <button className="ee-mm-chip" type="button" title="Perkecil" onClick={onZoomOut}>－</button>
          <button className="ee-mm-chip" type="button" title="Reset 100%" onClick={onZoomReset}>{Math.round(zoom * 100)}%</button>
          <button className="ee-mm-chip" type="button" title="Perbesar" onClick={onZoomIn}>＋</button>
        </div>
        <div className="ee-rb-group-label">Zoom</div>
      </div>
      <div className="ee-rb-group">
        <div className="ee-rb-group-body">
          {!readOnly && <button className="ee-mm-chip" type="button" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>{S.undo} Undo</button>}
          {!readOnly && <button className="ee-mm-chip" type="button" title="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>{S.redo} Redo</button>}
          <button className="ee-mm-chip" type="button" title="Ekspor" onClick={onExport}>{S.export} Ekspor</button>
        </div>
        <div className="ee-rb-group-label">Aksi</div>
      </div>
    </div>
  );

  return (
    <div className={`ee-top ee-ribbon${collapsed ? " collapsed" : ""}`} ref={rootRef}>
      <div className="ee-top-row ee-ribbon-quick">
        <button className="ee-top-toggle" type="button" onClick={onToggleCollapse}
          title={collapsed ? "Tampilkan ribbon" : "Sembunyikan ribbon"} aria-expanded={!collapsed}>
          {collapsed ? "▸" : "▾"}
        </button>
        {!collapsed ? null : <span className="ee-ribbon-collapsed-hint">Ribbon disembunyikan — klik ▸ untuk Home … View</span>}
        <div className={`ee-mm${fileOpen ? " open" : ""}`}>
          <button className="ee-top-btn ee-top-more" type="button" onClick={() => setFileOpen((v) => !v)} aria-haspopup="menu" aria-expanded={fileOpen}>
            ▤ File <span className="ee-caret" />
          </button>
          {fileOpen && (
            <div className="ee-mm-pop" role="menu">
              {!readOnly && <button className="ee-mm-item" type="button" onClick={() => { setFileOpen(false); onNewFile && onNewFile(); }}><span className="ee-mm-ic">⊞</span> File Baru</button>}
              <button className="ee-mm-item" type="button" onClick={() => { setFileOpen(false); onHistory && onHistory(); }}><span className="ee-mm-ic">{S.history}</span> Riwayat / Backup</button>
              {!readOnly && <button className="ee-mm-item" type="button" onClick={() => { setFileOpen(false); onRenameFile && onRenameFile(); }}><span className="ee-mm-ic">{S.rename}</span> Ubah Nama</button>}
              {!readOnly && <React.Fragment>
                <div className="ee-mm-sep" />
                <button className="ee-mm-item danger" type="button" onClick={() => { setFileOpen(false); onDeleteFile && onDeleteFile(); }}><span className="ee-mm-ic">{S.del}</span> Hapus File Ini</button>
                <button className="ee-mm-item danger" type="button" onClick={() => { setFileOpen(false); onClearAll && onClearAll(); }}><span className="ee-mm-ic">{S.clear}</span> Hapus Semua Isi</button>
              </React.Fragment>}
            </div>
          )}
        </div>
        {!readOnly && <button className="ee-top-btn primary" type="button" onClick={onSave} title="Simpan (backup otomatis)"><span className="ee-top-ic">{S.save}</span> Simpan</button>}
        {!readOnly && <button className="ee-top-btn" type="button" onClick={onImport} title="Impor Excel">{S.import} Impor</button>}
        {!readOnly && canPublish && <button className="ee-top-btn" type="button" onClick={onPublish} disabled={publishingPublish} title="Publikasikan">{publishingPublish ? "…" : "↑☆ Publikasikan"}</button>}
        <button className="ee-top-btn" type="button" onClick={onExport} title="Ekspor Excel">{S.export} Ekspor</button>
        {!readOnly && <React.Fragment>
          <span className="ee-top-sep" />
          <button className="ee-top-btn" type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">{S.undo} Undo</button>
          <button className="ee-top-btn" type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">{S.redo} Redo</button>
        </React.Fragment>}
        <span className="ee-top-grow" />
        <div className="ee-zoom" title="Zoom (Ctrl + roda mouse)">
          <button className="ee-top-btn ee-zoom-btn" type="button" onClick={onZoomOut} title="Perkecil">−</button>
          <button className="ee-zoom-label" type="button" onClick={onZoomReset} title="Reset 100%">{Math.round(zoom * 100)}%</button>
          <button className="ee-top-btn ee-zoom-btn" type="button" onClick={onZoomIn} title="Perbesar">＋</button>
        </div>
        {importedFiles.length === 0 ? <span className="ee-top-none">Belum ada file</span> : (
          <select className="ee-top-select" value={activeFileId || ""} onChange={(e) => onSelectFile && onSelectFile(e.target.value)} title="Pilih file">
            <option value="">Spreadsheet baru</option>
            {importedFiles.map((f) => (<option key={f.id} value={f.id}>{f.fileName}</option>))}
          </select>
        )}
        {fileLabel && <span className="ee-top-file" title={fileLabel}>{fileLabel}</span>}
        {saveFlash ? <span className="ee-save-flash">{saveFlash}</span> : null}
        {infoBadge ? <span className="ee-info-badge">{infoBadge}</span> : null}
      </div>
      {!collapsed && (
        <React.Fragment>
          <div className="ee-ribbon-tabs" role="tablist" aria-label="Ribbon spreadsheet" ref={tabsRef}>
            {RIBBON_TABS.map((t) => (
              <button key={t.id} data-tab={t.id} role="tab" aria-selected={activeTab === t.id}
                className={`ee-ribbon-tab${activeTab === t.id ? " active" : ""}`}
                type="button" onClick={() => selectTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="ee-ribbon-body">
            {activeTab === "home" && renderHome()}
            {activeTab === "insert" && renderInsert()}
            {activeTab === "layout" && renderLayout()}
            {activeTab === "formulas" && renderFormulas()}
            {activeTab === "data" && renderData()}
            {activeTab === "review" && renderReview()}
            {activeTab === "view" && renderView()}
          </div>
        </React.Fragment>
      )}
    </div>
  );
};

export default ExcelToolbar;
export { FILL_SWATCHES };
