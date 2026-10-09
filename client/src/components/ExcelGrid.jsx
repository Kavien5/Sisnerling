import React from "react";
import { colName, cellAddress, evaluateGrid, formatCellValue, shiftFormulaRefs, shiftFormulaRefsInRange } from "../spreadsheet.js";

const DEFAULT_COL_WIDTH = 100;
const MIN_COL_WIDTH = 40;
const MIN_ROW_HEIGHT = 20;

// Jendela render virtual (baris & kolom) dihitung SEKALI di satu tempat dan
// dipakai oleh memo render + handler scroll, supaya logika tidak terduplikasi.
const ROW_BUFFER = 6; // baris ekstra di atas/bawah viewport
const COL_BUFFER = 4; // kolom ekstra di kanan viewport
function rowWindowFrom(top, vp, visCum, visIdx, rowPx, minRowHeight) {
  const n = visIdx.length;
  if (!n) return [0, 0];
  const lo = Math.max(0, top - ROW_BUFFER * minRowHeight);
  const hi = top + vp + ROW_BUFFER * minRowHeight;
  // upper bound: index pertama dengan cum[idx] > x
  const ub = (x) => {
    let a = 0, b = visCum.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (visCum[m] <= x) a = m + 1;
      else b = m;
    }
    return a;
  };
  const s = Math.max(0, ub(lo) - 1);
  let e = Math.max(s, Math.min(n - 1, ub(hi) - 1));
  // pastikan jendela menutupi setidaknya seluruh viewport (bila konten cukup)
  let acc = Math.max(0, visCum[e + 1] || 0) - (visCum[s] || 0);
  while (e < n - 1 && acc < vp) {
    e++;
    acc += rowPx(visIdx[e]);
  }
  return [s, e];
}
// Window kolom hanya digunakan untuk ujung KANAN (ce). Sel body selalu dirender
// dari kolom 0..ce — posisi DOM sel = posisi kolom sebenarnya, sehingga SELALU
// sejajar dengan thead saat scroll horizontal (kolom yang terscroll keluar di
// kiri terpotong otomatis oleh kontainer scroll).
function colWindowCeFrom(sl, cp, cumW, colsLen, mergeMap, colWidth) {
  const n = colsLen;
  if (!n) return 0;
  const buffer = COL_BUFFER * colWidth;
  const hi = sl + cp + buffer;
  const ub = (x) => {
    let a = 0, b = cumW.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (cumW[m] <= x) a = m + 1;
      else b = m;
    }
    return a;
  };
  let ce = Math.max(0, Math.min(n - 1, ub(hi) - 1));
  // pastikan jendela mencakup juga kolom merge yang ANCHOR-nya masih di kiri
  // (agar batas merge tidak "terpotong" di tepi kanan viewport).
  for (const occ of mergeMap.values()) {
    if (occ.c1 >= 0 && occ.c1 <= ce && occ.c2 > ce) ce = occ.c2;
  }
  return ce;
}

const buildBorderStyle = (bd) => {
  if (!bd || typeof bd !== "object") return undefined;
  const side = (k) => {
    const s = bd[k];
    if (!s) return undefined;
    const w = s.w || 1;
    const c = s.c || "#000000";
    return `${w}px solid ${c}`;
  };
  const t = side("t");
  const r = side("r");
  const b = side("b");
  const l = side("l");
  if (!t && !r && !b && !l) return undefined;
  return { borderTop: t, borderRight: r, borderBottom: b, borderLeft: l };
};

const GRID_LINE = "1px solid var(--border)";
const borderSideCss = (s) => (s ? `${s.w || 1}px solid ${s.c || "#000000"}` : undefined);

// Deteksi kontras teks vs latar sel (WCAG relative luminance). Bila font hasil
// impor nyaris sama-menyatu dengan latar (mis. teks putih/nipis di atas putih),
// teks diganti warna terbaca supaya isi sel tetap jelas seperti tampilan Excel.
const FONT_CONTRAST_MIN = 3.0;

const parseHexColor = (c) => {
  if (typeof c !== "string") return null;
  let h = c.trim().replace(/^#/, "");
  if (h.length === 8) h = h.slice(0, 6); // ARGB → RGB
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const srgbLuminance = (c) => {
  const rgb = parseHexColor(c);
  if (!rgb) return null;
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};

const colorContrastRatio = (a, b) => {
  const la = srgbLuminance(a);
  const lb = srgbLuminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

const readableColorOn = (bg) => {
  const lum = srgbLuminance(bg);
  return (lum === null ? 1 : lum) > 0.4 ? "#1f2937" : "#ffffff";
};

// Lapisan gambar/bentuk file Excel. Posisi & ukuran mengikuti koordinat
// kolom/baris model (lebar kolom + tinggi baris) + offset EMU asli, sehingga
// logo/ikon/textbox berada persis seperti di Excel. pointer-events none agar
// sel tetap bisa diklik/diedit.
const RX_NUM = 40;

// Bentuk dasar selain kotak/elips dirender dengan clip-path CSS. Bentuk tajam
// ini tidak memakai bingkai agar garis pinggir mengikuti bentuk dengan rapi.
const SHAPE_CLIP = {
  triangle: "polygon(50% 0, 100% 100%, 0 100%)",
  diamond: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
  arrowR: "polygon(0 0, 55% 0, 55% 18%, 100% 50%, 55% 82%, 55% 100%, 0 100%)",
  arrowD: "polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%)",
};
const ImagesLayer = React.memo(function ImagesLayer({
  images,
  cumW,
  cumH,
  zoom = 1,
  winTop = -Infinity,
  winBottom = Infinity,
  selected = -1,
  float = null,
  onMouseDownImg = () => {},
  onDoubleClickImg = () => {},
  onResizeImg = () => {},
}) {
  // Sudut gagang "ubah ukuran" pada elemen yang terpilih.
  const RESIZE_CORNERS = ["nw", "ne", "sw", "se"];
  return (
    <div className="sheet-images">
      {images.map((im, i) => {
        const isFloat = float && float.idx === i;
        const x = isFloat ? float.x : cumW[im.col] + (im.dxPx || 0) * zoom;
        const y = isFloat ? float.y : cumH[im.row] + (im.dyPx || 0) * zoom;
        let w;
        let h;
        if (im.type === "twoCellAnchor") {
          w = (cumW[im.col + (im.colSpan || 0)] || cumW[cumW.length - 1]) - cumW[im.col] + (isFloat ? float.w : (im.dToXPx || 0) * zoom);
          h = (cumH[im.row + (im.rowSpan || 0)] || cumH[cumH.length - 1]) - cumH[im.row] + (isFloat ? float.h : (im.dToYPx || 0) * zoom);
        } else {
          w = isFloat ? float.w : (im.w || 80) * zoom;
          h = isFloat ? float.h : (im.h || 80) * zoom;
        }
        const gx = Math.max(0, Math.round(x));
        const gy = Math.max(0, Math.round(y));
        const gw = Math.max(1, Math.round(w));
        const gh = Math.max(1, Math.round(h));
        const style = { left: gx, top: gy, width: gw, height: gh, zIndex: isFloat ? 1000 + (im.z || 0) : (im.z || i) + 1 };
        const sel = selected === i;
        // Gagang "ubah ukuran" digambar sebagai saudara (bukan anak) elemen,
        // supaya tidak ikut terpotong clip-path pada bentuk segitiga/panah.
        const handles = sel && im.type !== "twoCellAnchor" ? (
          <span key="hr" className="ee-img-handles" style={{ left: gx, top: gy, width: gw, height: gh }}>
            {RESIZE_CORNERS.map((c) => (
              <span
                key={c}
                className={"ee-img-handle " + c}
                onMouseDown={(e) => onResizeImg(i, c, e)}
                title="Ubah ukuran"
              />
            ))}
          </span>
        ) : null;
        const commonProps = {
          onMouseDown: (e) => onMouseDownImg(i, e),
          onDoubleClick: (e) => onDoubleClickImg(i, e),
        };
        const inView =
          (cumH[im.row] || 0) <= winBottom && (cumH[im.row + (im.rowSpan || 0)] || cumH[cumH.length - 1]) >= winTop;
        if (im.type === "shape") {
          const clip = SHAPE_CLIP[im.shapeKind];
          const shapeStyle = {
            ...style,
            backgroundColor: im.fill && im.fill !== "transparent" ? im.fill : undefined,
            color: im.fontColor || "#000000",
            fontSize: im.fontSizePx ? Math.max(8, Math.round(im.fontSizePx * zoom)) : Math.round(16 * zoom),
            fontFamily: im.fontFamily || undefined,
            fontWeight: im.bold ? 700 : 400,
            textAlign: im.alignH || "center",
            borderStyle: "solid",
            borderWidth: clip ? 0 : im.border ? Math.max(1, im.border.weight || 1) : 0,
            borderColor: im.border ? im.border.color : "#999999",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "pre-wrap",
            lineHeight: 1.25,
            boxSizing: "border-box",
            borderRadius: im.shapeKind === "oval" ? "50%" : undefined,
            clipPath: clip,
          };
          return (
            <React.Fragment key={i}>
              <div
                className={"sheet-shape" + (sel ? " img-selected" : "")}
                style={shapeStyle}
                data-img-idx={i}
                {...commonProps}
              >
                {im.text || ""}
              </div>
              {handles}
            </React.Fragment>
          );
        }
        return im.dataUrl ? (
          <React.Fragment key={i}>
            <div
              className={"sheet-pic" + (sel ? " img-selected" : "")}
              style={style}
              data-img-idx={i}
              {...commonProps}
            >
              {inView ? <img src={im.dataUrl} alt={im.name || ""} draggable={false} loading="lazy" /> : null}
            </div>
            {handles}
          </React.Fragment>
        ) : null;
      })}
    </div>
  );
});

const ExcelGrid = React.forwardRef(function ExcelGrid(props, ref) {
  const {
    rows,
    columns,
    computed,
    onChange,
    onAddRow,
    onAddColumn,
    onDeleteColumn,
    onInsertRow,
    onDeleteRows,
    onInsertColumn,
    onDeleteColumns,
    onMergeCells = null,
    onUnmergeCells = null,
    onApplyBorders = null,
    onColumnResize,
    onRowResize,
    onColumnHeaderEdit,
    onFxStateChange,
    merges = [],
    banner = null,
    onUndo = null,
    onRedo = null,
    hiddenRows = null,
    filterMode = false,
    colFilter = null,
    onApplyColFilter = null,
    searchQuery = "",
    frozen = true,
    freezePane = null,
    zoom = 1,
    onZoomChange = null,
    images = [],
    onSelectImage = null,
    readOnly = false,
    onSelectionChange = null,
    rangeHighlights = null,
    onLockedCell = null,
  } = props;
  const [active, setActiveState] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const [inline, setInline] = React.useState(false);
  const [selRange, setSelRange] = React.useState(null);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [resizing, setResizing] = React.useState(null);
  const [rowResizing, setRowResizing] = React.useState(null);
  const [filterPopover, setFilterPopover] = React.useState(null);
  const [headH, setHeadH] = React.useState(26);
  // Tinggi BARIS PERTAMA thead (banner / label) — dipakai sebagai offset
  // sticky baris header kedua via CSS var --headrow-h (menggantikan 26px statis
  // agar tepat saat ada banner / zoom berubah).
  const [headRowH, setHeadRowH] = React.useState(26);
  const theadRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    setHeadH((p) => (p === h ? p : h));
    const first = el.querySelector("tr");
    const fh = first ? first.offsetHeight : 26;
    setHeadRowH((p) => (p === fh ? p : fh));
  });
  // Freeze pane file import (persis Excel): jumlah kolom (xSplit) & baris
  // (ySplit) pertama yang tetap terlihat saat di-scroll.
  const freezeCols =
    freezePane && freezePane.xSplit > 0 ? Math.min(freezePane.xSplit, columns.length) : 0;
  const freezeRows =
    freezePane && freezePane.ySplit > 0 ? Math.min(freezePane.ySplit, rows.length) : 0;
  const sheetRef = React.useRef(null);
  const prevColsLenRef = React.useRef(columns.length);
  const justAddedColRef = React.useRef(false);
  const dragRef = React.useRef(null);
  const draggingRef = React.useRef(false);
  const didDragRef = React.useRef(false);
  // Interaksi gambar/bentuk di sheet impor: pilih → seret untuk memindah,
  // klik dua kali pada shape/tulisan → edit teks. Hasil pemindahan dikirim ke
  // onImagesChange (didorong ke sheet + tersimpan saat save) saat seretan
  // berhenti; selama seret hanya render "float" ringan (tanpa onChange besar).
  const [imgSel, setImgSel] = React.useState(-1);
  const [imgFloat, setImgFloat] = React.useState(null);
  const [imgEdit, setImgEdit] = React.useState(null);
  const imgDragRef = React.useRef(null);
  const imgLastRef = React.useRef(null);
  const resizeRef = React.useRef(null);
  const resizeLastRef = React.useRef(null);
  const onImagesChange = props.onImagesChange || null;

  const beginImgDrag = (i, e) => {
    if (readOnly || !onImagesChange || !rows.length) return;
    e.preventDefault();
    e.stopPropagation();
    const im = images[i];
    if (!im) return;
    setImgSel(i);
    if (onSelectImage) onSelectImage(i);
    const orig = {
      ...im,
      dxPx: im.dxPx || 0,
      dyPx: im.dyPx || 0,
      dToXPx: im.dToXPx || 0,
      dToYPx: im.dToYPx || 0,
      w: im.w || 80,
      h: im.h || 80,
    };
    imgDragRef.current = { idx: i, startX: e.clientX, startY: e.clientY, orig };
    const onMove = (ev) => {
      const d = imgDragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      const o = d.orig;
      const f = {
        idx: d.idx,
        x: cumW[o.col] + (o.dxPx + dx) * zoom,
        y: cumH[o.row] + (o.dyPx + dy) * zoom,
        w:
          o.type === "twoCellAnchor"
            ? (cumW[o.col + (o.colSpan || 0)] || cumW[cumW.length - 1]) - cumW[o.col] + (o.dToXPx + dx) * zoom
            : (o.w || 80) * zoom,
        h:
          o.type === "twoCellAnchor"
            ? (cumH[o.row + (o.rowSpan || 0)] || cumH[cumH.length - 1]) - cumH[o.row] + (o.dToYPx + dy) * zoom
            : (o.h || 80) * zoom,
      };
      imgLastRef.current = f;
      setImgFloat(f);
    };
    const onUp = () => {
      const d = imgDragRef.current;
      imgDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!d) return;
      const last = imgLastRef.current;
      const ddX = last ? last.x - (cumW[d.orig.col] + (d.orig.dxPx || 0) * zoom) : 0;
      const ddY = last ? last.y - (cumH[d.orig.row] + (d.orig.dyPx || 0) * zoom) : 0;
      setImgFloat(null);
      if (ddX === 0 && ddY === 0) return;
      const updated = images.map((it, j) => {
        if (j !== d.idx) return it;
        if (d.orig.type === "twoCellAnchor") {
          return {
            ...it,
            dxPx: d.orig.dxPx + ddX / zoom,
            dyPx: d.orig.dyPx + ddY / zoom,
            dToXPx: d.orig.dToXPx + ddX / zoom,
            dToYPx: d.orig.dToYPx + ddY / zoom,
          };
        }
        return { ...it, dxPx: d.orig.dxPx + ddX / zoom, dyPx: d.orig.dyPx + ddY / zoom };
      });
      onImagesChange(updated);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Ubah ukuran bentuk/gambar lewat gagang sudut. Basis: sisi kiri-atas elemen
  // (dxPx/dyPx) dianggap tetap untuk sudut e/s, atau ikut bergeser untuk w/n.
  const beginImgResize = (i, corner, e) => {
    if (!onImagesChange || !rows.length) return;
    e.preventDefault();
    e.stopPropagation();
    const im = images[i];
    if (!im || im.type === "twoCellAnchor") return;
    setImgSel(i);
    if (onSelectImage) onSelectImage(i);
    const o = {
      x: cumW[im.col] + (im.dxPx || 0) * zoom,
      y: cumH[im.row] + (im.dyPx || 0) * zoom,
      w: (im.w || 80) * zoom,
      h: (im.h || 80) * zoom,
    };
    const prev = { idx: i, corner, startX: e.clientX, startY: e.clientY, o, im };
    const apply = (d) => {
      let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
      if (corner.includes("e")) nw = o.w + d.x;
      if (corner.includes("s")) nh = o.h + d.y;
      if (corner.includes("w")) { nx = o.x + d.x; nw = o.w - d.x; }
      if (corner.includes("n")) { ny = o.y + d.y; nh = o.h - d.y; }
      nw = Math.max(16, Math.round(nw));
      nh = Math.max(16, Math.round(nh));
      return { idx: i, x: nx, y: ny, w: nw, h: nh };
    };
    const onMove = (ev) => {
      if (!imgDragRef.current && !resizeRef.current) return;
      const f = apply({ x: ev.clientX - prev.startX, y: ev.clientY - prev.startY });
      resizeLastRef.current = f;
      setImgFloat(f);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const f = resizeLastRef.current;
      resizeLastRef.current = null;
      setImgFloat(null);
      if (!f || (f.w === prev.o.w && f.h === prev.o.h && f.x === prev.o.x && f.y === prev.o.y)) return;
      const base = prev.im;
      onImagesChange(
        images.map((it, j) =>
          j !== i
            ? it
            : {
                ...it,
                dxPx: Math.round((f.x - cumW[base.col]) / zoom),
                dyPx: Math.round((f.y - cumH[base.row]) / zoom),
                w: Math.round(f.w / zoom),
                h: Math.round(f.h / zoom),
              }
        )
      );
    };
    resizeRef.current = { idx: i };
    resizeLastRef.current = null;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const beginImgEdit = (i, e) => {
    if (readOnly) return;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const im = images[i];
    if (im && im.type === "shape") {
      setImgSel(i);
      if (onSelectImage) onSelectImage(i);
      setImgEdit({ idx: i, text: im.text || "" });
    }
  };

  const commitImgEdit = () => {
    const ed = imgEdit;
    if (!ed || !onImagesChange) { setImgEdit(null); return; }
    const next = images.map((it, j) => (j === ed.idx ? { ...it, text: ed.text } : it));
    onImagesChange(next);
    setImgEdit(null);
  };

  // Hapus elemen Home yang terpilih saat tombol Delete ditekan (bila sedang
  // tidak mengetik / tidak mengedit teks gambar).
  React.useEffect(() => {
    if (!onImagesChange || readOnly || imgSel < 0 || imgEdit) return;
    const onKey = (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.key === "Delete") {
        e.preventDefault();
        onImagesChange(images.filter((_, j) => j !== imgSel));
        setImgSel(-1);
        if (onSelectImage) onSelectImage(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onImagesChange, imgSel, imgEdit, images]);
  // Nilai teks sel yang sedang diedit: disimpan di REF (bukan state) sehingga
  // mengetik TIDAK memicu render ulang seluruh grid (ribuan sel). Ref dibersihkan
  // setiap commit / ganti sel; input edit bersifat uncontrolled.
  const draftRef = React.useRef(undefined);
  const editInputRef = React.useRef(null);
  // Cache style per-sel: objek inline style dibuat SEKALI per (row, key) selama
  // objek row identik & lebar kolom tidak berubah. 1.000 sel berstyle sama → 1
  // objek, tidak 1.000 objek baru per render.
  const cellStyleCacheRef = React.useRef(null);
  const clipboardRef = React.useRef(null);
  const fillRef = React.useRef(null);

  // Auto fill / drag: seret handle di pojok seleksi untuk meng-copy nilai
  // (atau meneruskan deret angka), plus menyalin format sel sumber.
  const applyAutofill = (src, end) => {
    if (!src || !end) return;
    const newRows = rows.map((row) => ({ ...row }));
    const copyStyleAcross = (fromRow, fromCol, toRow, toCol) => {
      const fk = allKeys[fromCol];
      const tk = allKeys[toCol];
      if (!fk || !tk || fk === tk) return;
      const srow = rows[fromRow];
      if (!srow) return;
      const PREFIXES = ["__", "__b_", "__i_", "__u_", "__fc_", "__sz_", "__fn_", "__ha_", "__va_", "__wr_", "__nf_", "__bd_"];
      for (const p of PREFIXES) {
        const sv = srow[p + fk];
        if (sv === undefined) continue;
        newRows[toRow][p + tk] = sv;
      }
    };
    const r1 = src.r1, r2 = src.r2, c1 = src.c1, c2 = src.c2;
    const h = r2 - r1 + 1;
    const w = c2 - c1 + 1;
    const rowMin = Math.min(r1, end.r);
    const rowMax = Math.max(r2, end.r);
    const colMin = Math.min(c1, end.c);
    const colMax = Math.max(c2, end.c);
    const mod = (v, n) => ((v % n) + n) % n;
    for (let rn = rowMin; rn <= rowMax; rn++) {
      for (let cn = colMin; cn <= colMax; cn++) {
        if (rn >= r1 && rn <= r2 && cn >= c1 && cn <= c2) continue;
        if (rn >= newRows.length || cn >= allKeys.length) continue;
        const m = mergeMap.get(`${rn}:${cn}`);
        if (m && (m.r1 !== rn || m.c1 !== cn)) continue;
        const key = allKeys[cn];
        let val;
        const srcR = h === 1 ? r1 : r1 + mod(rn - r1, h);
        const srcC = w === 1 ? c1 : c1 + mod(cn - c1, w);
        const offset = h === 1 ? rn - r1 : 0;
        if (h === 1) {
          const sv = rows[srcR][allKeys[srcC]];
          if (w === 1 && typeof sv === "number") {
            val = sv + offset;
          } else {
            val = sv;
          }
        } else if (w === 1) {
          const first = rows[r1][allKeys[c1]];
          const last = rows[r2][allKeys[c1]];
          if (
            typeof first === "number" &&
            typeof last === "number"
          ) {
            const step = last - first;
            val = first + step * (rn - r1);
          } else {
            val = rows[srcR][allKeys[c1]];
          }
        } else {
          val = rows[srcR][allKeys[srcC]];
        }
        // Rumus disalin dengan referensi relatif yang MENYESUAIKAN arah drag,
        // persis seperti Excel (mis. "=A1+B1" di C1 ditarik ke bawah → "=A2+B2").
        // Referensi absolut ($A$1) dan string teks tidak ikut bergeser.
        if (typeof val === "string" && val.trim().startsWith("=")) {
          val = shiftFormulaRefs(val, rn - srcR, cn - srcC);
        }
        if (val !== undefined) {
          newRows[rn][key] = typeof val === "string" ? val : val === null ? null : val;
        }
        copyStyleAcross(srcR, srcC, rn, cn);
      }
    }
    onChange(newRows);
    setSelRange({ r1: rowMin, r2: rowMax, c1: colMin, c2: colMax });
    setActiveState({ r: rowMax, key: allKeys[Math.min(colMax, allKeys.length - 1)] });
    setDraft("");
    setInline(false);
  };

  const onFillHandleDown = (e, src) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    fillRef.current = { active: true, src, end: null };
  };

  React.useEffect(() => {
    const up = () => {
      draggingRef.current = false;
      dragRef.current = null;
      if (pvRef.current) {
        setSelRange(pvRef.current);
        pvRef.current = null;
        paintPreview();
      }
      const f = fillRef.current;
      if (f && f.active) {
        f.active = false;
        if (f.end) applyAutofill(f.src, f.end);
        fillRef.current = null;
      }
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  });

  const addCol = (n = 1, afterIndex) => {
    if (n <= 0 || !onAddColumn) return;
    if (afterIndex == null || afterIndex < 0) justAddedColRef.current = true;
    onAddColumn(n, afterIndex);
  };

  React.useEffect(() => {
    if (columns.length > prevColsLenRef.current && justAddedColRef.current && sheetRef.current) {
      sheetRef.current.scrollLeft = sheetRef.current.scrollWidth;
    }
    prevColsLenRef.current = columns.length;
    justAddedColRef.current = false;
  }, [columns.length]);

  const colIdxMap = React.useMemo(
    () => Object.fromEntries(columns.map((c, i) => [c.key, i])),
    [columns]
  );

  const colByMap = React.useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  const allKeys = React.useMemo(() => columns.map((c) => c.key), [columns]);

  // Sorotan Lock/Unlock (Penugasan Tabel): overlay di atas tampilan asli tanpa
  // mengubah isi/format cell. peta "r:c" -> status.
  const highlights = React.useMemo(() => {
    const m = new Map();
    for (const rg of rangeHighlights || []) {
      if (!rg || rg.r1 == null || rg.r2 == null || rg.c1 == null || rg.c2 == null) continue;
      for (let r = Math.max(0, rg.r1); r <= Math.min(rg.r2, rows.length - 1); r++) {
        for (let c = Math.max(0, rg.c1); c <= Math.min(rg.c2, allKeys.length - 1); c++) {
          m.set(`${r}:${c}`, rg.lock === false ? "edit" : "lock");
        }
      }
    }
    return m;
  }, [rangeHighlights, rows.length, allKeys]);

  // Sel terkunci oleh penugasan Super Admin: tidak bisa diedit, tapi tetap
  // bisa dipilih dan dibaca. Koordinat 0-based (baris, indeks kolom).
  const isCellLocked = React.useCallback(
    (r, key) => {
      if (readOnly) return true;
      const ci = colIdxMap[key];
      if (ci == null) return false;
      return highlights.get(`${r}:${ci}`) === "lock";
    },
    [readOnly, colIdxMap, highlights]
  );

  // Normalisasi query pencarian SEKALI (dipakai per-sel, jangan di-uppercase ulang).
  const sq = React.useMemo(() => (props.searchQuery || "").toLowerCase(), [props.searchQuery]);

  // Area terseleksi: selRange bila ada, jika tidak cukup cell aktif.
  const sel = React.useMemo(() => {
    if (selRange) return selRange;
    if (active && allKeys.length) {
      const ci = allKeys.indexOf(active.key);
      if (ci >= 0) return { r1: active.r, r2: active.r, c1: ci, c2: ci };
    }
    return null;
  }, [selRange, active, allKeys]);

  const onSelectionChangeRef = React.useRef(null);
  onSelectionChangeRef.current = onSelectionChange || null;
  React.useEffect(() => {
    if (onSelectionChangeRef.current) {
      onSelectionChangeRef.current(sel ? { r1: sel.r1, r2: sel.r2, c1: sel.c1, c2: sel.c2 } : null);
    }
  }, [sel]);

  const mergeMap = React.useMemo(() => {
    const m = new Map();
    for (const mg of merges || []) {
      if (!mg || mg.c1 == null || mg.c2 == null || mg.r1 == null || mg.r2 == null) continue;
      for (let r = mg.r1; r <= mg.r2; r++) {
        if (r >= rows.length) break;
        for (let c = mg.c1; c <= mg.c2; c++) {
          if (c >= allKeys.length) break;
          m.set(`${r}:${c}`, mg);
        }
      }
    }
    return m;
  }, [merges, rows.length, allKeys]);

  const resolveAnchor = React.useCallback(
    (r, ci) => {
      if (!mergeMap.size) return { r, ci };
      const occ = mergeMap.get(`${r}:${ci}`);
      if (occ && (occ.r1 !== r || occ.c1 !== ci)) return { r: occ.r1, ci: occ.c1 };
      return { r, ci };
    },
    [mergeMap]
  );

  const allColWidth = React.useMemo(() => {
    if (!columns.length) return [];
    const displayFor = (r, key) => {
      if (computed) {
        const cv = computed.get(`${r}:${key}`);
        if (cv !== undefined && cv !== null) return String(cv);
      }
      const v = rows[r] && rows[r][key];
      return v === null || v === undefined ? "" : String(v);
    };
    return columns.map((c, ci) => {
      let w;
      if (c && c.manual) {
        w = c.width || DEFAULT_COL_WIDTH;
      } else if (c && c.width) {
        w = c.width;
      } else {
        const header = c && c.label ? String(c.label) : colName(ci);
        let maxChars = Math.max(3, header.length);
        for (let r = 0; r < rows.length; r++) {
          const s = displayFor(r, c.key);
          const lines = s.split("\n");
          const lineChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
          maxChars = Math.max(maxChars, lineChars);
        }
        w = Math.max(34, Math.min(320, maxChars * 6.8 + 34));
      }
      return w * zoom;
    });
  }, [columns, rows, computed, zoom]);

  const raw = React.useCallback(
    (r, key) => {
      if (!key) return "";
      const v = rows[r] && rows[r][key];
      return v === null || v === undefined ? "" : String(v);
    },
    [rows]
  );

  // Tinggi baris dalam piksel tampilan (sudah dikali faktor zoom). Data disimpan
  // dalam unit "logis" (ukuran asli Excel); zoom hanya mengubah tampilan.
  const rowPx = React.useCallback(
    (r) => (rows[r] && rows[r].height && rows[r].height > 0 ? rows[r].height : MIN_ROW_HEIGHT) * zoom,
    [rows, zoom]
  );

  // Prefiks lebar kolom & tinggi baris (termasuk header & nomor baris) dihitung
  // SEKALI, dipakai oleh lapisan gambar & overlay seleksi (bukan di-loop per
  // gambar/per baris setiap render).
  const cumW = React.useMemo(() => {
    const a = new Array(columns.length + 1);
    a[0] = RX_NUM * zoom;
    for (let i = 0; i < columns.length; i++) a[i + 1] = a[i] + (allColWidth[i] || DEFAULT_COL_WIDTH * zoom);
    return a;
  }, [columns, allColWidth, zoom]);

  const cumH = React.useMemo(() => {
    const a = new Array(rows.length + 1);
    a[0] = headH || 26;
    for (let i = 0; i < rows.length; i++) a[i + 1] = a[i] + rowPx(i);
    return a;
  }, [rows, headH, rowPx]);

  // Virtualisasi baris: ALIAS posisi = sum(tinggi) semua baris (minus yang
  // di-hidden oleh frozen). Row window dihitung dari posisi scroll; hanya baris
  // dalam jendela + buffer yang dibuatkan <tr>, sisanya TIDAK ada di DOM.
  const [view, setView] = React.useState({ top: 0, vp: 0, sl: 0, cp: 0 });
  const rafScrollRef = React.useRef(0);
  const viewRef = React.useRef(view);
  const winRef = React.useRef({ rw: [-1, -1], cw: -1 });
  const computeViewsRef = React.useRef(null);
  const visCum = React.useMemo(() => {
    const cum = [0];
    for (let i = 0; i < rows.length; i++) {
      if (hiddenRows && hiddenRows.has(i)) continue;
      const h = rowPx(i);
      cum.push(cum[cum.length - 1] + h);
    }
    return cum;
  }, [rows, hiddenRows, rowPx]);
  const visIdx = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < rows.length; i++) {
      if (hiddenRows && hiddenRows.has(i)) continue;
      arr.push(i);
    }
    return arr;
  }, [rows, hiddenRows]);
  // posisi top baris r (0-based, dalam koordinat konten di bawah header)
  const visCumByRow = React.useMemo(() => {
    const map = new Map();
    let acc = 0;
    for (const r of visIdx) {
      map.set(r, acc);
      acc += rowPx(r);
    }
    return map;
  }, [visIdx, rowPx]);

  const win = React.useMemo(
    () => rowWindowFrom(view.top || 0, view.vp || 800, visCum, visIdx, rowPx, MIN_ROW_HEIGHT * zoom),
    [view.top, view.vp, visCum, visIdx, rowPx, zoom]
  );

  // Window KOLOM: hanya ujung KANAN (ce) yang menentukan berapa kolom dirender.
  // Kolom 0..ce (bukan cs..ce) dibangun di tbody agar posisi DOM sel tetap
  // sejajar dengan header saat scroll horizontal.
  const colCe = React.useMemo(
    () => colWindowCeFrom(view.sl || 0, view.cp || 1200, cumW, columns.length, mergeMap, DEFAULT_COL_WIDTH * zoom),
    [view.sl, view.cp, cumW, columns.length, mergeMap, zoom]
  );
  const colKeys = React.useMemo(() => {
    const a = [];
    const minCe = Math.max(colCe, freezeCols - 1);
    for (let ci = 0; ci <= minCe; ci++) a.push(ci);
    return a;
  }, [colCe, freezeCols]);

  React.useEffect(() => {
    computeViewsRef.current = (top, vp, sl, cp) => ({
      rw: rowWindowFrom(top, vp, visCum, visIdx, rowPx, MIN_ROW_HEIGHT * zoom),
      cw: colWindowCeFrom(sl, cp, cumW, columns.length, mergeMap, DEFAULT_COL_WIDTH * zoom),
    });
  }, [visCum, visIdx, rowPx, zoom, cumW, columns.length, mergeMap]);

  const handleSheetScroll = React.useCallback(() => {
    const el = sheetRef.current;
    if (!el) return;
    if (rafScrollRef.current) return;
    rafScrollRef.current = requestAnimationFrame(() => {
      rafScrollRef.current = 0;
      const top = el.scrollTop;
      const sl = el.scrollLeft;
      const vp = viewRef.current.vp || el.clientHeight || 800;
      const cp = viewRef.current.cp || el.clientWidth || 1200;
      const nv = { top, vp, sl, cp };
      // Selama jendela render tidak berubah (masih dalam buffer), TIDAK perlu
      // render ulang — hindari kerja React tambahan tiap tick scroll.
      const fn = computeViewsRef.current;
      if (fn) {
        const next = fn(top, vp, sl, cp);
        const last = winRef.current;
        viewRef.current = nv;
        const same = last.rw[0] === next.rw[0] && last.rw[1] === next.rw[1] && last.cw === next.cw;
        winRef.current = { rw: next.rw, cw: next.cw };
        if (!same) setView(nv);
      } else {
        viewRef.current = nv;
        setView(nv);
      }
    });
  }, []);

  const resizeSheetView = React.useCallback(
    (el) => {
      if (!el) return;
      if (rafScrollRef.current) return;
      rafScrollRef.current = requestAnimationFrame(() => {
        rafScrollRef.current = 0;
        viewRef.current = { top: viewRef.current.top, vp: el.clientHeight || 800, sl: viewRef.current.sl || 0, cp: el.clientWidth || 1200 };
        setView(viewRef.current);
      });
    },
    []
  );

  React.useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    viewRef.current = { top: el.scrollTop || 0, vp: el.clientHeight || 800, sl: el.scrollLeft || 0, cp: el.clientWidth || 1200 };
    setView(viewRef.current);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => resizeSheetView(el));
      ro.observe(el);
    }
    return () => ro && ro.disconnect();
  }, [resizeSheetView]);

  // Zoom dengan Ctrl + roda: dipasang ke element (non-passive) agar bisa
  // preventDefault (mencegah zoom halaman browser).
  React.useEffect(() => {
    const el = sheetRef.current;
    if (!el || !onZoomChange) return;
    const onWheel = (e) => {
      // Pinch di touchpad dikirim browser sebagai wheel + ctrlKey.
      // ctrlKey=false (scroll dua jari biasa) DIBIARKAN agar scroll tetap jalan.
      if (!e.ctrlKey) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      onZoomChange(zoom * Math.exp(-e.deltaY * unit * 0.002));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, onZoomChange]);
  // pvRef menyimpan range terbaru, paintPreview menggeser div overlay via rAF.
  const previewRef = React.useRef(null);
  const pvRef = React.useRef(null);
  const pvRafRef = React.useRef(false);
  const paintPreview = React.useCallback(() => {
    const el = previewRef.current;
    const p = pvRef.current;
    if (el) {
      if (!p) {
        el.style.display = "none";
        return;
      }
      const x = cumW[p.c1];
      const y = cumH[p.r1];
      const w = cumW[p.c2 + 1] - cumW[p.c1];
      const h = cumH[p.r2 + 1] - cumH[p.r1];
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.display = "block";
    }
  }, [cumW, cumH]);
  const schedulePreview = React.useCallback(() => {
    if (pvRafRef.current) return;
    pvRafRef.current = true;
    requestAnimationFrame(() => {
      pvRafRef.current = false;
      paintPreview();
    });
  }, [paintPreview]);

  React.useEffect(() => {
    if (rows.length === 0) {
      if (active !== null) setActiveState(null);
      return;
    }
    if (active === null || active.r >= rows.length) {
      if (columns.length > 0) {
        setActiveState({ r: 0, key: columns[0].key });
        setDraft(raw(0, columns[0].key));
      }
    }
  }, [rows.length]);

  React.useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  const commit = React.useCallback(() => {
    if (!active) return;
    const col = columns.find((c) => c.key === active.key);
    if (!col) return;
    // Penjaga terakhir: sel yang terkunci tidak boleh tersimpan meski input
    // sempat dibuka sebelum aturan berubah.
    if (isCellLocked(active.r, active.key)) {
      draftRef.current = undefined;
      setInline(false);
      onLockedCell && onLockedCell(active.r, active.key);
      return;
    }
    const dv = draftRef.current !== undefined ? draftRef.current : draft;
    draftRef.current = undefined;
    const t = String(dv).trim();
    let norm;
    if (t.startsWith("=")) {
      norm = t;
    } else if (col.type === "number") {
      const n = parseFloat(t.replace(/[Rp\s,.]/gi, ""));
      norm = isNaN(n) ? (t === "" ? null : t) : n;
    } else {
      norm = t === "" ? null : t;
    }
    const cur = rows[active.r] ? rows[active.r][active.key] : "";
    if (String(norm ?? "") !== String(cur ?? "")) {
      onChange(
        rows.map((r, i) => (i === active.r ? { ...r, [active.key]: norm } : r))
      );
    }
  }, [active, draft, columns, rows, onChange, isCellLocked, onLockedCell]);

  const moveTo = React.useCallback((ci2, r2) => {
    if (!rows.length || !columns.length) return;
    // Navigasi ke kanan melewati kolom terakhir = tambah kolom (sama seperti
    // Enter/panah-bawah yang menambah baris di baris terakhir).
    if (ci2 >= allKeys.length && onAddColumn) {
      addCol(ci2 - allKeys.length + 1);
      const key = colName(ci2);
      const nr = Math.max(0, Math.min(rows.length - 1, r2));
      setActiveState({ r: nr, key });
      setDraft("");
      setInline(false);
      setSelRange(null);
      return;
    }
    const nc = Math.max(0, Math.min(allKeys.length - 1, ci2));
    const nr = Math.max(0, Math.min(rows.length - 1, r2));
    const a = resolveAnchor(nr, nc);
    const key = allKeys[a.ci];
    setActiveState({ r: a.r, key });
    setDraft(raw(a.r, key));
    setInline(false);
    setSelRange(null);
  }, [rows.length, allKeys, columns, addCol, onAddColumn, resolveAnchor, raw]);

  const selectCell = React.useCallback(
    (r, key) => {
      const ci = allKeys.indexOf(key);
      const a = resolveAnchor(r, ci >= 0 ? ci : 0);
      setActiveState({ r: a.r, key: allKeys[a.ci] });
      setDraft(raw(a.r, allKeys[a.ci]));
      setInline(false);
      setSelRange(null);
      sheetRef.current?.focus();
    },
    [rows, allKeys, resolveAnchor, raw]
  );

  const selectRow = React.useCallback(
    (r, e) => {
      if (!rows.length || !columns.length) return;
      commit();
      const lastCi = allKeys.length - 1;
      if (e && e.shiftKey && selRange) {
        setSelRange((prev) => ({
          ...prev,
          r1: Math.min(prev.r1, r),
          r2: Math.max(prev.r2, r),
          c1: 0,
          c2: lastCi,
        }));
        setActiveState({ r, key: allKeys[0] });
        setDraft(raw(r, allKeys[0]));
        return;
      }
      setActiveState({ r, key: allKeys[0] });
      setDraft(raw(r, allKeys[0]));
      setInline(false);
      setSelRange({ r1: r, r2: r, c1: 0, c2: lastCi });
    },
    [rows, columns, allKeys, raw, commit, selRange]
  );

  const selectColumn = React.useCallback(
    (ci, e) => {
      if (!rows.length || !columns.length || !allKeys[ci]) return;
      commit();
      const anchor = resolveAnchor(0, ci);
      const key = allKeys[anchor.ci];
      if (e && e.shiftKey && selRange) {
        setSelRange((prev) => ({
          r1: 0,
          r2: rows.length - 1,
          c1: Math.min(prev.c1, ci),
          c2: Math.max(prev.c2, ci),
        }));
        setActiveState({ r: anchor.r, key });
        setDraft(raw(anchor.r, key));
        return;
      }
      setActiveState({ r: anchor.r, key });
      setDraft(raw(anchor.r, key));
      setInline(false);
      setSelRange({ r1: 0, r2: rows.length - 1, c1: ci, c2: ci });
    },
    [rows, columns, allKeys, raw, commit, selRange, resolveAnchor]
  );

  const selectAllCells = React.useCallback(() => {
    if (!rows.length || !columns.length) return;
    commit();
    setActiveState({ r: 0, key: allKeys[0] });
    setDraft(raw(0, allKeys[0]));
    setInline(false);
    setSelRange({ r1: 0, r2: rows.length - 1, c1: 0, c2: allKeys.length - 1 });
    sheetRef.current?.focus();
  }, [rows, allKeys, raw, commit]);

  const beginEdit = React.useCallback((r, key) => {
    if (readOnly) return;
    if (isCellLocked(r, key)) {
      onLockedCell && onLockedCell(r, key);
      return;
    }
    draftRef.current = undefined;
    setActiveState({ r, key });
    setDraft(raw(r, key));
    setInline(true);
  }, [rows, isCellLocked, onLockedCell]);

  const commitAndMove = React.useCallback((dc, dr) => {
    commit();
    const ci = colIdxMap[active.key] ?? 0;
    if (dr > 0 && active.r >= rows.length - 1 && onAddRow && !readOnly) {
      onAddRow();
      const newIndex = rows.length;
      const key = allKeys[Math.max(0, Math.min(allKeys.length - 1, ci + dc))];
      setActiveState({ r: newIndex, key });
      setDraft("");
      setInline(false);
      sheetRef.current?.focus();
    } else {
      moveTo(ci + dc, active.r + dr);
    }
  }, [commit, active, rows.length, allKeys, colIdxMap, onAddRow, moveTo]);

  const onCellMouseDown = (r, key, e) => {
    if (e.button !== 0) return;
    const ci = colIdxMap[key];
    if (e.shiftKey && active) {
      const aci = colIdxMap[active.key];
      setSelRange({
        r1: Math.min(active.r, r),
        r2: Math.max(active.r, r),
        c1: Math.min(aci, ci),
        c2: Math.max(aci, ci),
      });
      return;
    }
    const t = resolveAnchor(r, ci);
    if (active && (active.r !== t.r || active.key !== allKeys[t.ci])) commit();
    selectCell(t.r, allKeys[t.ci]);
    draggingRef.current = true;
    didDragRef.current = false;
    dragRef.current = { mode: "cell", r: t.r, ci: t.ci };
  };

  const onCellMouseOver = (r, key) => {
    const d = dragRef.current;
    if (d && draggingRef.current) {
      if (d.mode === "cell") {
        const ci = colIdxMap[key];
        if (d.r !== r || d.ci !== ci) didDragRef.current = true;
        pvRef.current = {
          r1: Math.min(d.r, r),
          r2: Math.max(d.r, r),
          c1: Math.min(d.ci, ci),
          c2: Math.max(d.ci, ci),
        };
        schedulePreview();
      }
    }
    const f = fillRef.current;
    if (f && f.active) {
      const ci = colIdxMap[key];
      if (ci >= 0) f.end = { r, c: ci };
    }
  };

  const onRowHeaderMouseDown = (r, e) => {
    if (e.button !== 0) return;
    selectRow(r, e);
    draggingRef.current = true;
    didDragRef.current = false;
    dragRef.current = { mode: "row", r };
  };

  const onRowHeaderMouseOver = (r) => {
    const d = dragRef.current;
    if (d && draggingRef.current && d.mode === "row") {
      if (d.r !== r) didDragRef.current = true;
      pvRef.current = {
        r1: Math.min(d.r, r),
        r2: Math.max(d.r, r),
        c1: 0,
        c2: allKeys.length - 1,
      };
      schedulePreview();
    }
  };

  const onColHeaderMouseDown = (ci, e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest(".col-resize-handle")) return;
    selectColumn(ci, e);
    draggingRef.current = true;
    didDragRef.current = false;
    dragRef.current = { mode: "col", ci };
  };

  const onColHeaderMouseOver = (ci) => {
    const d = dragRef.current;
    if (d && draggingRef.current && d.mode === "col") {
      if (d.ci !== ci) didDragRef.current = true;
      pvRef.current = {
        r1: 0,
        r2: rows.length - 1,
        c1: Math.min(d.ci, ci),
        c2: Math.max(d.ci, ci),
      };
      schedulePreview();
    }
  };

  const isInRange = (r, ci) => {
    if (!selRange) return false;
    const merged = mergeMap.get(`${r}:${ci}`);
    const r1 = merged ? merged.r1 : r;
    const r2 = merged ? merged.r2 : r;
    const c1 = merged ? merged.c1 : ci;
    const c2 = merged ? merged.c2 : ci;
    return r1 <= selRange.r2 && r2 >= selRange.r1 && c1 <= selRange.c2 && c2 >= selRange.c1;
  };

  const onCellClick = (r, key) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setSelRange(null);
    const ci = allKeys.indexOf(key);
    const t = resolveAnchor(r, ci);
    if (active && (active.r !== t.r || active.key !== allKeys[t.ci])) commit();
    selectCell(t.r, allKeys[t.ci]);
  };

  const onInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitAndMove(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitAndMove(e.shiftKey ? -1 : 1, 0);
    } else if (e.key === "Escape") {
      e.preventDefault();
      draftRef.current = undefined;
      setDraft(raw(active.r, active.key));
      setInline(false);
      sheetRef.current?.focus();
    } else if (e.key === "ArrowUp" && e.target.selectionStart === 0) {
      e.preventDefault();
      commitAndMove(0, -1);
    } else if (e.key === "ArrowDown" && e.target.selectionEnd === (draftRef.current ?? draft).length) {
      e.preventDefault();
      commitAndMove(0, 1);
    }
  };

  const onSheetKeyDown = (e) => {
    if (contextMenu) return;
    if (resizing) return;
    if ((e.ctrlKey || e.metaKey) && onZoomChange) {
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        onZoomChange(Math.round((zoom + 0.1) * 100) / 100);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        onZoomChange(Math.round((zoom - 0.1) * 100) / 100);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        onZoomChange(1);
        return;
      }
    }
    if (inline || !active) return;
    const ci = allKeys.indexOf(active.key);

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      e.preventDefault();
      handleCopy();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "x") {
      e.preventDefault();
      handleCopy(true);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault();
      handlePaste();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (onUndo) onUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || e.key.toLowerCase() === "z") && e.shiftKey) {
      e.preventDefault();
      if (onRedo) onRedo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveTo(ci + 1, active.r);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveTo(ci - 1, active.r);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveTo(ci, active.r + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveTo(ci, active.r - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      beginEdit(active.r, active.key);
    } else if (e.key === "Tab") {
      e.preventDefault();
      moveTo(ci + (e.shiftKey ? -1 : 1), active.r);
    } else if (e.key === "F2") {
      e.preventDefault();
      beginEdit(active.r, active.key);
    } else if (!readOnly && (e.key === "Delete" || e.key === "Backspace")) {
      // Hapus isi hanya untuk sel yang tidak terkunci.
      if (sel && highlights) {
        for (let r = sel.r1; r <= sel.r2; r++) {
          for (let c = sel.c1; c <= sel.c2; c++) {
            if (highlights.get(`${r}:${c}`) === "lock") {
              onLockedCell && onLockedCell(r, allKeys[c]);
              return;
            }
          }
        }
      }
      e.preventDefault();
      if (selRange) {
        const newRows = rows.map((row, ri) => {
          if (ri < selRange.r1 || ri > selRange.r2) return row;
          const newRow = { ...row };
          for (let c = selRange.c1; c <= selRange.c2; c++) {
            const key = allKeys[c];
            if (key) {
              newRow[key] = null;
              delete newRow["__" + key];
            }
          }
          return newRow;
        });
        onChange(newRows);
        setDraft("");
      } else {
        const { r, key } = active;
        if (rows[r] && rows[r][key] !== "" && rows[r][key] !== null && rows[r][key] !== undefined) {
          onChange(rows.map((x, i) => (i === r ? { ...x, [key]: null } : x)));
        }
        setDraft("");
      }
      setInline(false);
    } else if (!readOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      beginEdit(active.r, active.key);
      setDraft(e.key);
    }
  };

  const handleCopy = (cut = false) => {
    if (!active || !allKeys.length || !sel) return;
    const range = sel;
    const data = [];
    const colors = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const rowVals = [];
      const rowColors = [];
      for (let c = range.c1; c <= range.c2; c++) {
        const key = allKeys[c];
        if (!key || !rows[r]) {
          rowVals.push("");
          rowColors.push(null);
          continue;
        }
        const v = rows[r][key];
        rowVals.push(v === null || v === undefined ? "" : v);
        rowColors.push(rows[r]["__" + key] || null);
      }
      data.push(rowVals);
      colors.push(rowColors);
    }
    clipboardRef.current = { cut: cut && !readOnly, r1: range.r1, r2: range.r2, c1: range.c1, c2: range.c2, data, colors };
    const text = data.map((row) => row.map((x) => String(x)).join("\t")).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
    if (cut && !readOnly) {
      const newRows = rows.map((row, ri) => {
        if (ri < range.r1 || ri > range.r2) return row;
        const newRow = { ...row };
        for (let c = range.c1; c <= range.c2; c++) {
          const key = allKeys[c];
          if (key) {
            newRow[key] = null;
            delete newRow["__" + key];
          }
        }
        return newRow;
      });
      onChange(newRows);
      setSelRange(null);
    }
  };

  const applyClipboard = (cb) => {
    if (readOnly || !active || !allKeys.length) return;
    const destR = active.r;
    const destC = colIdxMap[active.key] ?? 0;
    const h = cb.data.length;
    const w = Math.max(...cb.data.map((row) => row.length), 0);
    const dRows = destR - cb.r1;
    const dCols = destC - cb.c1;

    let newRows = rows.map((r) => ({ ...r }));
    const rowsNeeded = Math.max(0, destR + h - newRows.length);
    for (let i = 0; i < rowsNeeded; i++) {
      newRows.push({});
      onAddRow && onAddRow();
    }
    const newColsNeeded = Math.max(0, destC + w - allKeys.length);
    if (newColsNeeded > 0) addCol(newColsNeeded);

    const srcRange = { r1: cb.r1, r2: cb.r2, c1: cb.c1, c2: cb.c2 };
    for (let dr = 0; dr < h; dr++) {
      const ri = destR + dr;
      if (!newRows[ri]) continue;
      for (let dc = 0; dc < w; dc++) {
        const ci = destC + dc;
        const key = allKeys[ci] || colName(ci);
        if (!key) continue;
        let v = cb.data[dr] && cb.data[dr][dc];
        if (typeof v === "string" && v.startsWith("=")) {
          v = shiftFormulaRefs(v, dRows, dCols);
        }
        newRows[ri][key] = v === null || v === undefined ? null : v;
        const bg = (cb.colors[dr] && cb.colors[dr][dc]) || null;
        if (bg) newRows[ri]["__" + key] = bg;
        else delete newRows[ri]["__" + key];
      }
    }

    if (cb.cut) {
      for (let ri = 0; ri < newRows.length; ri++) {
        const row = newRows[ri];
        for (let c = 0; c < allKeys.length; c++) {
          const key = allKeys[c];
          const v = row[key];
          if (typeof v === "string" && v.startsWith("=")) {
            const nv = shiftFormulaRefsInRange(v, dRows, dCols, srcRange);
            if (nv !== v) row[key] = nv;
          }
        }
      }
      for (let ri = cb.r1; ri <= cb.r2; ri++) {
        const inDestR = ri >= destR && ri < destR + h;
        for (let ci = cb.c1; ci <= cb.c2; ci++) {
          const inDestC = ci >= destC && ci < destC + w;
          if (inDestR && inDestC) continue;
          const key = allKeys[ci];
          if (newRows[ri] && key) {
            newRows[ri][key] = null;
            delete newRows[ri]["__" + key];
          }
        }
      }
      clipboardRef.current = { ...cb, cut: false };
    }
    onChange(newRows);
    setSelRange(null);
    setActiveState({ r: destR, key: allKeys[Math.min(Math.max(destC, 0), allKeys.length - 1)] });
    setDraft("");
    setInline(false);
  };

  const pasteExternalText = (text) => {
    if (readOnly || !active || !allKeys.length) return;
    const lines = text.split("\n").filter((l) => l.length > 0);
    if (!lines.length) return;
    const startR = active.r;
    const startC = colIdxMap[active.key] ?? 0;
    let maxCells = 0;
    for (const line of lines) {
      const count = line.split("\t").length;
      if (count > maxCells) maxCells = count;
    }
    const newColsNeeded = Math.max(0, startC + maxCells - allKeys.length);
    if (newColsNeeded > 0) addCol(newColsNeeded);
    const nKeys = [...allKeys];
    for (let i = allKeys.length; i < allKeys.length + newColsNeeded; i++) nKeys.push(colName(i));

    let newRows = [...rows.map((r) => ({ ...r }))];
    while (startR + lines.length - 1 >= newRows.length) {
      newRows.push({});
      onAddRow && onAddRow();
    }
    for (let dr = 0; dr < lines.length; dr++) {
      const ri = startR + dr;
      if (!newRows[ri]) continue;
      const cells = lines[dr].split("\t");
      for (let dc = 0; dc < cells.length; dc++) {
        const ci = startC + dc;
        if (ci >= nKeys.length) break;
        const key = nKeys[ci];
        const colType = columns.find((c) => c.key === key)?.type;
        let val = cells[dc] || null;
        if (colType === "number" && val) {
          const n = parseFloat(val.replace(/[Rp\s,.]/gi, ""));
          val = isNaN(n) ? val : n;
        }
        newRows[ri][key] = val;
      }
    }
    onChange(newRows);
  };

  const handlePaste = async () => {
    if (readOnly || !active) return;
    const cb = clipboardRef.current;
    if (cb) {
      applyClipboard(cb);
      return;
    }
    try {
      const text = await navigator.clipboard?.readText();
      if (!text) return;
      pasteExternalText(text);
    } catch (_) {}
  };

  const onColResizeStart = (ci, e) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = (allColWidth[ci] || DEFAULT_COL_WIDTH) / zoom;
    setResizing({ ci, startX, startW });
  };

  React.useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const delta = e.clientX - resizing.startX;
      const newW = Math.max(MIN_COL_WIDTH, resizing.startW + delta / zoom);
      onColumnResize?.(resizing.ci, Math.round(newW * 100) / 100);
    };
    const onUp = () => setResizing(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [resizing, zoom]);

  const onRowResizeStart = (r, e) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const row = rows[r] || {};
    const startH = row.height && row.height > 0 ? row.height : null;
    setRowResizing({ r, startY, startH });
  };

  React.useEffect(() => {
    if (!rowResizing) return;
    const onMove = (e) => {
      const delta = e.clientY - rowResizing.startY;
      const newH = Math.max(MIN_ROW_HEIGHT, (rowResizing.startH || MIN_ROW_HEIGHT) + delta / zoom);
      onRowResize?.(rowResizing.r, Math.round(newH * 100) / 100);
    };
    const onUp = () => setRowResizing(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [rowResizing, zoom]);

  const fxValue = inline && active ? draft : (active ? raw(active.r, active.key) : "");
  const fxRefText = active ? cellAddress(allKeys.indexOf(active.key), active.r) : "";

  const handleFxChangeEmit = React.useCallback(() => {
    onFxStateChange?.({
      fxValue: fxValue,
      fxRefText,
      hasActive: !!active,
      activeColIdx: active ? allKeys.indexOf(active.key) : null,
      activeRowIdx: active ? active.r : null,
    });
  }, [fxValue, fxRefText, active, allKeys, onFxStateChange]);

  React.useEffect(() => {
    handleFxChangeEmit();
  }, [handleFxChangeEmit]);

  React.useImperativeHandle(ref, () => ({
    commitActive() {
      commit();
    },
    handleFxChange(value) {
      if (readOnly) return;
      draftRef.current = value;
      if (editInputRef.current) {
        editInputRef.current.value = value;
      }
      if (!inline && active) setInline(true);
    },
    handleFxKeyDown(e) {
      if (readOnly) return;
      if (e.key === "Enter") {
        e.preventDefault();
        setInline(false);
        commit();
        sheetRef.current?.focus();
      } else if (e.key === "Tab") {
        e.preventDefault();
        setInline(false);
        commit();
        moveTo(allKeys.indexOf(active.key) + (e.shiftKey ? -1 : 1), active.r);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDraft(raw(active.r, active.key));
        setInline(false);
        sheetRef.current?.focus();
      }
    },
    handleFxFocus() {
      if (readOnly) return;
      if (active) setInline(true);
    },
    scrollToLastColumn() {
      const el = sheetRef.current;
      if (el) requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });
    },
    scrollToColumn(ci) {
      const el = sheetRef.current && sheetRef.current.querySelector(`thead th[data-cidx="${ci}"]`);
      if (el) requestAnimationFrame(() => {
        el.scrollIntoView({ block: "nearest", inline: "center" });
      });
    },
    hasSelection() {
      return !!(selRange || active);
    },
    mergeSelection() {
      if (readOnly) return;
      if (!sel) return;
      props.onMergeCells && props.onMergeCells({ r1: sel.r1, r2: sel.r2, c1: sel.c1, c2: sel.c2 });
    },
    unmergeSelection() {
      if (readOnly) return;
      if (!sel) return;
      props.onUnmergeCells && props.onUnmergeCells({ r1: sel.r1, r2: sel.r2, c1: sel.c1, c2: sel.c2 });
    },
    applyBorder(sides = ["all"], weight = 1) {
      if (readOnly) return;
      if (!sel) return;
      props.onApplyBorders && props.onApplyBorders({ r1: sel.r1, r2: sel.r2, c1: sel.c1, c2: sel.c2 }, sides, weight);
    },
    applyFill(color) {
      if (readOnly) return;
      if (!rows.length || !columns.length) return;
      let range = selRange;
      if (!range && active) {
        const ci = colIdxMap[active.key] ?? 0;
        range = { r1: active.r, r2: active.r, c1: ci, c2: ci };
      }
      if (!range) return;
      const newRows = rows.map((row, ri) => {
        if (ri < range.r1 || ri > range.r2) return row;
        const nr = { ...row };
        for (let c = range.c1; c <= range.c2; c++) {
          const k = allKeys[c];
          if (!k) continue;
          if (color) nr["__" + k] = color;
          else delete nr["__" + k];
        }
        return nr;
      });
      onChange(newRows);
    },
    applyStyle(patch, scope = "selection") {
      if (readOnly) return;
      if (!rows.length || !columns.length) return;
      let range = selRange;
      if ((!range || scope === "cell") && active) {
        const ci = colIdxMap[active.key] ?? 0;
        range = { r1: active.r, r2: active.r, c1: ci, c2: ci };
      }
      if (!range) return;
      const newRows = rows.map((row, ri) => {
        if (ri < range.r1 || ri > range.r2) return row;
        const nr = { ...row };
        for (let c = range.c1; c <= range.c2; c++) {
          const k = allKeys[c];
          if (!k) continue;
          const set = (pfx, val) => {
            if (val === null || val === undefined || val === false) delete nr[pfx + k];
            else nr[pfx + k] = val;
          };
          if ("bold" in patch) set("__b_", patch.bold);
          if ("italic" in patch) set("__i_", patch.italic);
          if ("underline" in patch) set("__u_", patch.underline);
          if ("fc" in patch) set("__fc_", patch.fc);
          if ("sz" in patch) set("__sz_", patch.sz);
          if ("ha" in patch) set("__ha_", patch.ha);
          if ("va" in patch) set("__va_", patch.va);
          if ("wrap" in patch) set("__wr_", patch.wrap);
          if ("fn" in patch) set("__fn_", patch.fn);
          if ("nf" in patch) set("__nf_", patch.nf);
        }
        return nr;
      });
      onChange(newRows);
    },
    goNextMatch() {
      const q = (props.searchQuery || "").toLowerCase();
      if (!q || !rows.length) return 0;
      const matches = [];
      for (let r = 0; r < rows.length; r++) {
        if (hiddenRows && hiddenRows.has(r)) continue;
        for (let c = 0; c < allKeys.length; c++) {
          const v = rows[r][allKeys[c]];
          if (v !== null && v !== undefined && String(v).toLowerCase().includes(q)) {
            matches.push({ r, c });
          }
        }
      }
      if (!matches.length) return 0;
      let idx = 0;
      if (active) {
        const ai = allKeys.indexOf(active.key);
        const found = matches.findIndex((m) => m.r > active.r || (m.r === active.r && m.c > ai));
        if (found >= 0) idx = found;
      }
      const t = matches[idx];
      selectCell(t.r, allKeys[t.c]);
      scrollToCell(t.r, t.c);
      return matches.length;
    },
    scrollToCell(r, ci) {
      requestAnimationFrame(() => {
        const sc = sheetRef.current;
        if (!sc) return;
        // Baris sudah ada di window (DOM): scrollIntoView biasa.
        const el = sc.querySelector(`td[data-r="${r}"][data-ci="${ci}"]`);
        if (el) {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          return;
        }
        // Baris belum dirender (di luar window virtual): geser kontainer dulu,
        // lalu window akan direndernya.
        let cLeft = 0;
        for (let i = 0; i < ci && i < allColWidth.length; i++) cLeft += allColWidth[i] || DEFAULT_COL_WIDTH;
        const cl = allColWidth[ci] || DEFAULT_COL_WIDTH;
        if (cLeft + cl > sc.clientWidth + sc.scrollLeft) sc.scrollLeft = Math.max(0, cLeft + cl - sc.clientWidth);
        else if (cLeft < sc.scrollLeft) sc.scrollLeft = Math.max(0, cLeft);
        const top = visCumByRow.get(r);
        if (top != null) sc.scrollTop = Math.max(0, top - Math.floor((sc.clientHeight || 800) / 2));
      });
    },
  }));

  const nativeSheet = React.useMemo(
    () => rows && rows.some((r) => r && Object.keys(r).some((k) => k.startsWith("__cv_"))),
    [rows]
  );

  const renderCell = (r, ci) => {
    const key = allKeys[ci];
    const col = colByMap.get(key);
    // Kolom tersembunyi dari file (mis. kolom D–K di sheet Oil) tidak dirender,
    // konsisten dengan header (col.hidden => null) — layout mengikuti Excel.
    if (col && col.hidden) return null;
    const occ = mergeMap.get(`${r}:${ci}`);
    if (occ && (occ.r1 !== r || occ.c1 !== ci)) return null;
    const span =
      occ && (occ.r2 !== r || occ.c2 !== ci)
        ? { rowSpan: occ.r2 - occ.r1 + 1, colSpan: occ.c2 - occ.c1 + 1 }
        : null;
    const isActive = active !== null && active.r === r && active.key === key;
    const inSel = isInRange(r, ci);
    const rw = rows[r] || {};
    const cached = rw["__cv_" + key];
    const hasCached = cached !== undefined && cached !== "";
    const cellFmt = rw["__nf_" + key] || (col && col.numFmt);
    const rawVal = rw[key];
    let value = computed ? computed.get(`${r}:${key}`) : rawVal;
    const isFormula = typeof rawVal === "string" && rawVal.startsWith("=");
    const computedError =
      (typeof value === "string" && value.startsWith("#")) ||
      (typeof rawVal === "string" && rawVal.startsWith("#"));
    // Sheet hasil impor Excel (native): angka dari sel ber-rumus ditampilkan
    // PERSIS dari nilai cached hasil Excel, bukan dari hitung-ulang evaluator
    // klien — sehingga (1), 7.251,11, tahun, dan total selalu sama dengan file.
    // Untuk sheet buatan manual, nilai cached dipakai hanya jika evaluasi gagal.
    if (isFormula && hasCached && (nativeSheet || computedError)) {
      value = cached;
    }
    let err =
      (typeof value === "string" && value.startsWith("#")) ||
      (typeof rawVal === "string" && rawVal.startsWith("#"));
    const isNum = typeof value === "number" || (value === undefined && typeof rawVal === "number");

    // Style inline per-sel: di-CACHE per (row object, key). Objek row hasil
    // import bersifat stabil di memori — selama row yang sama masih direfer,
    // komputasi border/merge/font di-SKIP seluruhnya (hanya 1x per sel).
    let cellStyle = null;
    if (!cellStyleCacheRef.current) cellStyleCacheRef.current = { widths: null, map: new WeakMap() };
    const csc = cellStyleCacheRef.current;
    if (csc.widths !== allColWidth || csc.merges !== merges) {
      csc.map = new WeakMap();
      csc.widths = allColWidth;
      csc.merges = merges;
    }
    let rowStyles = csc.map.get(rw);
    if (!rowStyles) {
      rowStyles = new Map();
      csc.map.set(rw, rowStyles);
    }
    cellStyle = rowStyles.get(key);
    if (!cellStyle) {
      const cellBg = rw["__" + key];
      const bd = rw["__bd_" + key];
      const bold = rw["__b_" + key];
      const italic = rw["__i_" + key];
      const underline = rw["__u_" + key];
      const sz = rw["__sz_" + key];
      const fn = rw["__fn_" + key];
      const fc = rw["__fc_" + key];
      // Teks yang kontrasnya terlalu rendah terhadap latar (nyaris putih/nyaris
      // menyatu) ditimpa warna terbaca — sisanya dipertahankan apa adanya.
      let textColor = fc;
      if (fc) {
        const effBg = cellBg || "#ffffff";
        const ratio = colorContrastRatio(fc, effBg);
        if (ratio !== null && ratio < FONT_CONTRAST_MIN) textColor = readableColorOn(effBg);
      }
      const ha = rw["__ha_" + key];
      const va = rw["__va_" + key];
      const wrap = rw["__wr_" + key];
      const rh = rows[r] && rows[r].height && rows[r].height > 0 ? rows[r].height * zoom : 0;
      const baseW = { minWidth: allColWidth[ci] || DEFAULT_COL_WIDTH, width: allColWidth[ci] || DEFAULT_COL_WIDTH };
      const borders = {};
      if (!occ || !span) {
        for (const s of ["t", "r", "b", "l"]) {
          const cssKey = { t: "borderTop", r: "borderRight", b: "borderBottom", l: "borderLeft" }[s];
          const v = bd && bd[s] ? borderSideCss(bd[s]) : s === "r" || s === "b" ? GRID_LINE : undefined;
          if (v) borders[cssKey] = v;
        }
      } else {
        const m = occ;
        const inb = (rr, cc, side) => {
          if (rr < 0 || rr >= rows.length) return null;
          const k = allKeys[cc];
          if (!k) return null;
          const xb = rows[rr] ? rows[rr]["__bd_" + k] : null;
          return xb && xb[side] ? xb[side] : null;
        };
        const pick = (arr) => {
          for (const x of arr) if (x) return borderSideCss(x);
          return null;
        };
        const topArr = [];
        const bottomArr = [];
        for (let c = m.c1; c <= m.c2; c++) {
          topArr.push(inb(m.r1 - 1, c, "b"));
          bottomArr.push(inb(m.r2 + 1, c, "t"));
        }
        const t = pick(topArr) || (bd && bd.t ? borderSideCss(bd.t) : undefined);
        const b = pick(bottomArr) || (bd && bd.b ? borderSideCss(bd.b) : GRID_LINE);
        const l = pick([inb(m.r1, m.c1 - 1, "r")]) || (bd && bd.l ? borderSideCss(bd.l) : undefined);
        const r2b = pick([inb(m.r1, m.c2 + 1, "l")]) || (bd && bd.r ? borderSideCss(bd.r) : GRID_LINE);
        if (t) borders.borderTop = t;
        if (b) borders.borderBottom = b;
        if (l) borders.borderLeft = l;
        if (r2b) borders.borderRight = r2b;
      }
      cellStyle = {
        ...baseW,
        // Tinggi baris dari metadata file (hpt) — inline menimpa min-height
        // CSS default agar baris pendek/tipis (separator) tetap setinggi Excel.
        ...(rh ? { minHeight: rh, height: rh } : undefined),
        ...(cellBg ? { backgroundColor: cellBg } : undefined),
        ...(bold ? { fontWeight: 700 } : undefined),
        ...(italic ? { fontStyle: "italic" } : undefined),
        ...(underline ? { textDecoration: "underline" } : undefined),
        ...(sz ? { fontSize: Math.max(8, Math.round(Math.min(72, sz) * 1.3333 * zoom)) } : { fontSize: Math.max(8, Math.round(12 * zoom)) }),
        ...(fn ? { fontFamily: fn } : undefined),
        ...(textColor ? { color: textColor } : undefined),
        ...(ha ? { textAlign: ha } : isNum ? { textAlign: "right" } : undefined),
        ...(va ? { verticalAlign: va } : undefined),
        ...(wrap ? { whiteSpace: "pre-wrap" } : undefined),
        ...borders,
      };
      rowStyles.set(key, cellStyle);
    }
    // Freeze pane (file impor): kolom &/atau baris pertama "beku" — pakai
    // position:sticky dengan offset asal (left = cumW[ci], top = headH +
    // tinggi baris beku sebelumnya) sehingga tersemat saat di-scroll, persis
    // Excel. Latar diberi warna solid agar isi yang menggulir tak tembus.
    const frCol = freezeCols > 0 && ci < freezeCols;
    const frRow = freezeRows > 0 && r < freezeRows;
    if (frCol || frRow) {
      const fBg = rw["__" + key] || "#ffffff";
      const sticky = {
        position: "sticky",
        ...(frCol ? { left: cumW[ci] ?? 0, backgroundColor: fBg } : {}),
        ...(frRow ? { top: (headH || 26) + (visCumByRow.get(r) || 0), backgroundColor: fBg } : {}),
        zIndex: ci < 2 ? (frRow ? 5 : 4) : frCol && frRow ? 3 : 2,
      };
      cellStyle = { ...cellStyle, ...sticky };
      rowStyles.set(key, cellStyle);
    }
    // Overlay Lock/Unlock (Penugasan Tabel): tint + outline di atas tampilan asli.
    const hl = highlights.get(`${r}:${ci}`);
    if (hl) {
      cellStyle = {
        ...cellStyle,
        outline: hl === "lock" ? "2px solid #dc2626" : "2px solid #059669",
        outlineOffset: "-1px",
        boxShadow: `inset 0 0 0 1000px ${hl === "lock" ? "rgba(220,38,38,0.10)" : "rgba(5,150,105,0.10)"}`,
      };
      rowStyles.set(key, cellStyle);
    }
    if (isActive && inline) {
      return (
        <td
          key={key}
          rowSpan={span?.rowSpan}
          colSpan={span?.colSpan}
          className={`cell active editing${isNum ? " number" : ""}${ci === 0 ? " col-a" : ci === 1 ? " col-b" : ""}`}
          style={cellStyle}
        >
          <input
            ref={editInputRef}
            className="cell-input"
            defaultValue={(draftRef.current ?? draft) ?? ""}
            autoFocus
            onChange={(e) => {
              draftRef.current = e.target.value;
            }}
            onKeyDown={onInputKeyDown}
            onBlur={() => commit()}
          />
        </td>
      );
    }

    const display =
      computed && value !== undefined
        ? formatCellValue(value, { ...(col || {}), numFmt: cellFmt })
        : formatCellValue(rawVal, { ...(col || {}), numFmt: cellFmt });
    const matched = !!sq && rawVal !== null && rawVal !== undefined && String(rawVal).toLowerCase().includes(sq);
    const isFillAnchor = !!sel && r === sel.r2 && ci === sel.c2;
    return (
      <td
        key={key}
        rowSpan={span?.rowSpan}
        colSpan={span?.colSpan}
        data-r={r}
        data-ci={ci}
        className={`cell${isActive ? " active" : ""}${inSel ? " in-range" : ""}${
          err ? " cell-error" : ""
        }${isNum ? " number" : ""}${matched ? " cell-match" : ""}${ci === 0 ? " col-a" : ci === 1 ? " col-b" : ""}`}
        style={cellStyle}
        onMouseDown={(e) => onCellMouseDown(r, key, e)}
        onMouseOver={() => onCellMouseOver(r, key)}
        onClick={() => onCellClick(r, key)}
        onDoubleClick={() => beginEdit(r, key)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, r, ci });
        }}
      >
        {display}
        {isFillAnchor && (
          <div
            className="ee-fill-handle"
            title="Seret untuk isi (Auto fill / deret angka)"
            onMouseDown={(e) => onFillHandleDown(e, sel)}
          />
        )}
      </td>
    );
  };

  return (
    <div className="spreadsheet excel-grid">
      <div className="sheet-scroll" tabIndex={0} ref={sheetRef} onKeyDown={onSheetKeyDown} onScroll={handleSheetScroll}>
        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="big">&#128202;</div>
            <p>Belum ada data. Mulai ketik di cell atau import file Excel.</p>
          </div>
        ) : (
          <div
            className="sheet-spacer"
            style={{ height: (headH || 26) + (visCum[visCum.length - 1] || 0) }}
          >
            <div className="sheet-sel-preview" ref={previewRef} />
            {images && images.length > 0 ? (
              <ImagesLayer
                images={images}
                cumW={cumW}
                cumH={cumH}
                zoom={zoom}
                winTop={visCum[win[0]] || 0}
                winBottom={visCum[win[1] + 1] || visCum[visCum.length - 1] || 1000000}
                selected={imgSel}
                float={imgFloat}
                onMouseDownImg={beginImgDrag}
                onDoubleClickImg={beginImgEdit}
                onResizeImg={beginImgResize}
              />
            ) : null}
            {imgEdit != null &&
            images[imgEdit.idx] &&
            images[imgEdit.idx].type === "shape" &&
            rows.length > 0 ? (
              (() => {
                const im = images[imgEdit.idx];
                const ex = Math.max(0, Math.round(cumW[im.col] + (im.dxPx || 0) * zoom));
                const ey = Math.max(0, Math.round(cumH[im.row] + (im.dyPx || 0) * zoom));
                const ew =
                  im.type === "twoCellAnchor"
                    ? (cumW[im.col + (im.colSpan || 0)] || cumW[cumW.length - 1]) - cumW[im.col] + (im.dToXPx || 0) * zoom
                    : (im.w || 80) * zoom;
                const eh =
                  im.type === "twoCellAnchor"
                    ? (cumH[im.row + (im.rowSpan || 0)] || cumH[cumH.length - 1]) - cumH[im.row] + (im.dToYPx || 0) * zoom
                    : (im.h || 80) * zoom;
                return (
                  <div
                    className="img-edit-box"
                    style={{
                      position: "absolute",
                      left: ex,
                      top: ey,
                      width: Math.max(40, Math.round(ew)),
                      height: Math.max(24, Math.round(eh)),
                      zIndex: 2000,
                    }}
                  >
                    <textarea
                      className="img-edit-input"
                      value={imgEdit.text}
                      onChange={(e) => setImgEdit({ ...imgEdit, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitImgEdit();
                        }
                        if (e.key === "Escape") setImgEdit(null);
                      }}
                      onBlur={commitImgEdit}
                      autoFocus
                    />
                  </div>
                );
              })()
            ) : null}
            <div className="sheet-stick">
              <table
                className={`sheet${frozen || freezeRows > 0 || freezeCols > 0 ? "" : " no-freeze"}`}
                style={{
                  "--stick-a": `${cumW[0] ?? RX_NUM * zoom}px`,
                  "--stick-b": `${cumW[1] ?? RX_NUM * zoom}px`,
                  "--headrow-h": `${headRowH || 26}px`,
                }}
              >
            <thead ref={theadRef}>
              {banner && banner.label ? (
                <tr className="sheet-banner">
                  <th colSpan={allKeys.length + 1} style={{ ...(banner.bg ? { backgroundColor: banner.bg } : undefined), fontSize: Math.round(13 * zoom) }}>
                    {banner.label}
                  </th>
                </tr>
              ) : null}
              <tr>
                <th className="corner" title="Pilih semua" onClick={selectAllCells} style={{ width: RX_NUM * zoom, minWidth: RX_NUM * zoom }} />
                {allKeys.map((key, i) => {
                  const col = colByMap.get(key);
                  if (col && col.hidden) return null;
                  const w = allColWidth[i] || DEFAULT_COL_WIDTH;
                  const colActive = active !== null && allKeys.indexOf(active.key) === i;
                  const colActiveFilter =
                    !!colFilter && Array.isArray(colFilter[key]) && colFilter[key].length > 0;
                  return (
                    <th
                      key={key}
                      data-cidx={i}
                      colSpan={col && col.span && col.span > 1 ? col.span : undefined}
                      className={`col-label${col && col.label ? "" : " empty"}${colActive ? " active" : ""}${i === 0 ? " col-a" : i === 1 ? " col-b" : ""}`}
                      style={{
                        minWidth: w,
                        width: w,
                        position: "sticky",
                        fontSize: Math.round(11.5 * zoom),
                        ...(col && col.bg ? { backgroundColor: col.bg } : undefined),
                        ...(freezeCols > 0 && i < freezeCols
                          ? { position: "sticky", left: cumW[i] ?? 0, zIndex: i < 2 ? 7 : 4 }
                          : undefined),
                      }}
                      title={col && col.label ? col.label : ""}
                      onMouseDown={(e) => onColHeaderMouseDown(i, e)}
                      onMouseOver={() => onColHeaderMouseOver(i)}
                      onClick={(e) => {
                        if (e.target.closest && e.target.closest(".col-resize-handle")) return;
                        if (e.target.closest && e.target.closest(".ee-col-filter-btn")) return;
                        if (didDragRef.current) {
                          didDragRef.current = false;
                          return;
                        }
                        selectColumn(i, e);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, r: 0, ci: i });
                      }}
                    >
                      <span>{col?.label || colName(i)}</span>
                      {filterMode && onApplyColFilter ? (
                        <button
                          className={`ee-col-filter-btn${colActiveFilter ? " active" : ""}`}
                          title="Filter kolom ini"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setFilterPopover((cur) =>
                              cur && cur.ci === i
                                ? null
                                : { ci: i, x: rect.right, y: rect.bottom + 6 }
                            );
                          }}
                        >
                          &#128269;
                        </button>
                      ) : null}
                      <div
                        className="col-resize-handle"
                        onMouseDown={(e) => onColResizeStart(i, e)}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const frEnd = Math.min(freezeRows, visIdx.length);
                const wStart = Math.max(win[0], frEnd);
                const showWindow = wStart <= win[1] ? visIdx.slice(wStart, win[1] + 1) : [];
                const spacerNeeded = win[0] > frEnd;
                return (
                  <>
                    {spacerNeeded ? (
                      <tr className="sheet-top-spacer">
                        <td
                          colSpan={allKeys.length + 1}
                          style={{ height: visCum[win[0]] - visCum[frEnd] || 0, border: "none" }}
                        />
                      </tr>
                    ) : null}
                    {visIdx.slice(0, frEnd).concat(showWindow).map((r) => {
                      const row = rows[r];
                      const rowActive = active !== null && active.r === r;
                      const isFrozenRow = r < frEnd;
                      return (
                        <tr
                          key={row.id ?? `row-${r}`}
                          data-r={r}
                          className={`data-row${rowActive ? " row-active" : ""}${isFrozenRow ? " frz-row" : ""}`}
                        >
                          <th
                            className={`row-num${rowActive ? " active" : ""}`}
                            style={{
                              height: row.height && row.height > 0 ? Math.round(row.height * zoom) : undefined,
                              width: RX_NUM * zoom,
                              minWidth: RX_NUM * zoom,
                              fontSize: Math.round(11 * zoom),
                              ...(isFrozenRow
                                ? {
                                    position: "sticky",
                                    top: (headH || 26) + (visCumByRow.get(r) || 0),
                                    zIndex: 5,
                                  }
                                : undefined),
                            }}
                            onMouseDown={(e) => {
                              if (e.target.closest && e.target.closest(".row-resize-handle")) return;
                              onRowHeaderMouseDown(r, e);
                            }}
                            onMouseOver={() => onRowHeaderMouseOver(r)}
                            onClick={(e) => {
                              if (e.target.closest && e.target.closest(".row-resize-handle")) return;
                              if (didDragRef.current) {
                                didDragRef.current = false;
                                return;
                              }
                              selectRow(r, e);
                            }}
                            title={`Pilih baris ${r + 1}`}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({ x: e.clientX, y: e.clientY, r, ci: 0 });
                            }}
                          >
                            <span>{r + 1}</span>
                            <div
                              className="row-resize-handle"
                              onMouseDown={(e) => onRowResizeStart(r, e)}
                            />
                          </th>
                          {colKeys.map((ci) => renderCell(r, ci))}
                        </tr>
                      );
                    })}
                  </>
                );
              })()}
              <tr className="sheet-fill">
                <td
                  colSpan={allKeys.length + 1}
                  style={{
                    height: Math.max(
                      0,
                      (visCum[visCum.length - 1] || 0) - (visCum[win[1] + 1] !== undefined ? visCum[win[1] + 1] : visCum[visCum.length - 1] || 0)
                    ),
                    border: "none",
                  }}
                />
              </tr>
            </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {filterPopover != null && filterMode && onApplyColFilter && (
        <div className="ee-filter-popover" style={{ left: Math.min(filterPopover.x, window.innerWidth - 260), top: filterPopover.y }}>
          <div className="ee-filter-title">Filter {columns[filterPopover.ci]?.label || colName(filterPopover.ci)}</div>
          <div className="ee-filter-actions">
            <button
              onClick={() => {
                onApplyColFilter(allKeys[filterPopover.ci], null);
                setFilterPopover(null);
              }}
            >
              Hapus filter
            </button>
            <button
              onClick={() => {
                const keys = allKeys[filterPopover.ci];
                const vals = [];
                for (const row of rows) {
                  const v = row[keys];
                  const sv = v === null || v === undefined ? "" : String(v);
                  if (!vals.includes(sv)) vals.push(sv);
                }
                onApplyColFilter(keys, vals);
              }}
            >
              Pilih semua
            </button>
          </div>
          <div className="ee-filter-list">
            {(() => {
              const keys = allKeys[filterPopover.ci];
              const cur = colFilter && Array.isArray(colFilter[keys]) ? colFilter[keys] : null;
              const vals = [];
              for (const row of rows) {
                const v = row[keys];
                const sv = v === null || v === undefined ? "" : String(v);
                if (!vals.includes(sv)) vals.push(sv);
              }
              const all = cur === null || cur.length === vals.length;
              const toggle = (v) => {
                if (all || cur.length >= vals.length) {
                  onApplyColFilter(keys, vals.filter((x) => x !== v));
                } else if (cur.includes(v)) {
                  const next = cur.filter((x) => x !== v);
                  onApplyColFilter(keys, next.length ? next : vals.filter((x) => x !== v));
                } else {
                  onApplyColFilter(keys, [...cur, v].sort());
                }
              };
              return vals.slice(0, 200).map((v) => (
                <label key={v} className="ee-filter-item">
                  <input
                    type="checkbox"
                    checked={all || (cur && cur.includes(v))}
                    onChange={() => toggle(v)}
                  />
                  <span title={v}>{v === "" ? "(kosong)" : v}</span>
                </label>
              ));
            })()}
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="sheet-context" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => { handleCopy(); setContextMenu(null); }}>
            <span className="sc-key">Ctrl+C</span> Salin
          </button>
          <button onClick={() => { handleCopy(true); setContextMenu(null); }}>
            <span className="sc-key">Ctrl+X</span> Potong
          </button>
          <button onClick={() => { handlePaste(); setContextMenu(null); }}>
            <span className="sc-key">Ctrl+V</span> Tempel
          </button>
          <div className="sheet-context-sep" />
          <button onClick={() => {
            if (active) beginEdit(active.r, active.key);
            setContextMenu(null);
          }}>
            <span className="sc-key">F2</span> Edit Sel
          </button>
          <button onClick={() => {
            if (active) {
              onChange(rows.map((x, i) => (i === active.r ? { ...x, [active.key]: null } : x)));
              setDraft("");
            }
            setContextMenu(null);
          }}>
            <span className="sc-key">Del</span> Hapus Isi
          </button>
          <div className="sheet-context-sep" />
          <button onClick={() => {
            const range = sel || (active ? { r1: active.r, r2: active.r, c1: colIdxMap[active.key] ?? 0, c2: colIdxMap[active.key] ?? 0 } : null);
            if (range) onMergeCells && onMergeCells(range);
            setContextMenu(null);
          }}>
            <span className="sc-key">&#8862;</span> Gabung Sel (Merge)
          </button>
          <button onClick={() => {
            const range = sel || (active ? { r1: active.r, r2: active.r, c1: colIdxMap[active.key] ?? 0, c2: colIdxMap[active.key] ?? 0 } : null);
            if (range) onUnmergeCells && onUnmergeCells(range);
            setContextMenu(null);
          }}>
            <span className="sc-key">&#8863;</span> Pisahkan Sel (Unmerge)
          </button>
          <div className="sheet-context-sep" />
          <button onClick={() => {
            const at = typeof contextMenu.r === "number" ? contextMenu.r : active?.r ?? 0;
            onInsertRow?.(at, 1);
            setContextMenu(null);
          }}>
            <span className="sc-key">&#8681;</span> Sisip Baris Di Atas
          </button>
          <button onClick={() => {
            const at = typeof contextMenu.r === "number" ? contextMenu.r : active?.r ?? 0;
            onInsertRow?.(at + 1, 1);
            setContextMenu(null);
          }}>
            <span className="sc-key">&#8681;</span> Sisip Baris Di Bawah
          </button>
          <button onClick={() => {
            if (sel) onDeleteRows?.(sel.r1, sel.r2);
            setContextMenu(null);
          }}>
            <span className="sc-key">Del</span> Hapus Baris Terpilih
          </button>
          <div className="sheet-context-sep" />
          <button onClick={() => {
            const ci = typeof contextMenu.ci === "number" ? contextMenu.ci : (active ? colIdxMap[active.key] : 0);
            onInsertColumn?.(ci - 1, 1);
            setContextMenu(null);
          }}>
            <span className="sc-key">&#8680;</span> Sisip Kolom Kiri
          </button>
          <button onClick={() => {
            const ci = typeof contextMenu.ci === "number" ? contextMenu.ci : (active ? colIdxMap[active.key] : 0);
            onInsertColumn?.(ci, 1);
            setContextMenu(null);
          }}>
            <span className="sc-key">&#8680;</span> Sisip Kolom Kanan
          </button>
          <button onClick={() => {
            if (sel) onDeleteColumns?.(sel.c1, sel.c2);
            setContextMenu(null);
          }}>
            <span className="sc-key">Del</span> Hapus Kolom Terpilih
          </button>
        </div>
      )}
    </div>
  );
});

export default ExcelGrid;
