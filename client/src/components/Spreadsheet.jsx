import React from "react";
import { colName, cellAddress, evaluateGrid, formatCellValue, normalizeCell } from "../spreadsheet.js";
import { IconTrash } from "./Icons.jsx";

const EXTRA_COLS = 20;

export default function Spreadsheet({
  rows,
  columns,
  onChange,
  onAddRow,
  loading,
  onDeleteRequest,
  onActiveChange,
  onHeaderEdit,
}) {
  const [active, setActiveState] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const [inline, setInline] = React.useState(false);
  const [headerEditIndex, setHeaderEditIndex] = React.useState(null);
  const [headerDraft, setHeaderDraft] = React.useState("");
  const [selRange, setSelRange] = React.useState(null);
  const [copyClip, setCopyClip] = React.useState(null);
  const [contextMenu, setContextMenu] = React.useState(null);
  const sheetRef = React.useRef(null);
  const fxRef = React.useRef(null);

  const computed = React.useMemo(() => evaluateGrid(rows, columns), [rows, columns]);

  const colIdxMap = React.useMemo(
    () => Object.fromEntries(columns.map((c, i) => [c.key, i])),
    [columns]
  );

  const allKeys = React.useMemo(() => {
    const keys = columns.map((c) => c.key);
    for (let i = 0; i < EXTRA_COLS; i++) {
      keys.push(`__empty_${i}`);
    }
    return keys;
  }, [columns]);

  const allColWidth = React.useMemo(() => {
    const widths = columns.map((c, ci) => {
      if (c && c.manual) return c.width || 120;
      const header = c && c.label ? String(c.label) : colName(ci);
      let maxChars = Math.max(3, header.length);
      for (let r = 0; r < rows.length; r++) {
        const cv = computed.get(`${r}:${c.key}`);
        const v = cv !== undefined && cv !== null ? String(cv) : (rows[r] && rows[r][c.key] !== null && rows[r] && rows[r][c.key] !== undefined ? String(rows[r][c.key]) : "");
        const lines = v.split("\n");
        const lineChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
        maxChars = Math.max(maxChars, lineChars);
      }
      return Math.max(34, Math.min(320, maxChars * 6.8 + 34));
    });
    for (let i = 0; i < EXTRA_COLS; i++) {
      widths.push(120);
    }
    return widths;
  }, [columns, rows, computed]);

  const isExtra = (ci) => ci >= columns.length;

  const raw = (r, key) => {
    if (!key || key.startsWith("__empty_")) return "";
    const v = rows[r] && rows[r][key];
    return v === null || v === undefined ? "" : String(v);
  };

  React.useEffect(() => {
    if (rows.length === 0) {
      if (active !== null) setActiveState(null);
      return;
    }
    if (active === null || active.r >= rows.length) {
      setActiveState({ r: 0, key: columns[0].key });
      setDraft(raw(0, columns[0].key));
    }
  }, [rows.length, active && active.r]);

  React.useEffect(() => {
    onActiveChange?.(active === null ? null : rows[active.r] ?? null);
  }, [active]);

  React.useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  const commit = React.useCallback(() => {
    if (!active) return;
    if (isExtra(colIdxMap[active.key] ?? columns.length)) return;
    const col = columns.find((c) => c.key === active.key);
    if (!col) return;
    const norm = normalizeCell(col, draft);
    const cur = rows[active.r] ? rows[active.r][active.key] : "";
    if (String(norm ?? "") !== String(cur ?? "")) {
      onChange(
        rows.map((r, i) => (i === active.r ? { ...r, [active.key]: norm } : r))
      );
    }
  }, [active, draft, columns, rows, onChange]);

  const moveTo = (ci2, r2) => {
    if (!rows.length) return;
    const nc = Math.max(0, Math.min(allKeys.length - 1, ci2));
    const nr = Math.max(0, Math.min(rows.length - 1, r2));
    const key = allKeys[nc];
    setActiveState({ r: nr, key });
    setDraft(raw(nr, key));
    setInline(false);
    setSelRange(null);
  };

  const selectCell = (r, key) => {
    commit();
    setActiveState({ r, key });
    setDraft(raw(r, key));
    setInline(false);
    setSelRange(null);
    sheetRef.current?.focus();
  };

  const beginEdit = (r, key) => {
    if (isExtra(colIdxMap[key] ?? columns.length)) return;
    setActiveState({ r, key });
    setDraft(raw(r, key));
    setInline(true);
  };

  const beginHeaderEdit = (i) => {
    if (isExtra(i)) return;
    setHeaderEditIndex(i);
    setHeaderDraft(columns[i] ? columns[i].label ?? "" : "");
  };

  const commitHeader = () => {
    if (headerEditIndex === null) return;
    const idx = headerEditIndex;
    const val = headerDraft;
    setHeaderEditIndex(null);
    if (columns[idx] && String(columns[idx].label ?? "") !== String(val)) {
      onHeaderEdit?.(idx, val);
    }
  };

  const commitAndMove = (dc, dr) => {
    commit();
    const ci = colIdxMap[active.key] ?? 0;
    if (dr > 0 && active.r >= rows.length - 1 && onAddRow) {
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
  };

  const onCellMouseDown = (r, key, e) => {
    if (e.button !== 0) return;
    const ci = allKeys.indexOf(key);
    if (e.shiftKey && active) {
      const aci = allKeys.indexOf(active.key);
      setSelRange({
        r1: Math.min(active.r, r),
        r2: Math.max(active.r, r),
        c1: Math.min(aci, ci),
        c2: Math.max(aci, ci),
      });
      return;
    }
    if (active && (active.r !== r || active.key !== key)) commit();
    selectCell(r, key);
  };

  const onCellMouseOver = (r, key) => {
    if (selRange) {
      const ci = allKeys.indexOf(key);
      if (selRange.r2 !== r || selRange.c2 !== ci) {
        const aci = allKeys.indexOf(active?.key) ?? 0;
        setSelRange((prev) => ({
          ...prev,
          r2: r,
          c2: Math.max(aci, ci),
        }));
      }
    }
  };

  const isInRange = (r, ci) => {
    if (!selRange) return false;
    return r >= selRange.r1 && r <= selRange.r2 && ci >= selRange.c1 && ci <= selRange.c2;
  };

  const onCellClick = (r, key) => {
    setSelRange(null);
    if (active && (active.r !== r || active.key !== key)) commit();
    selectCell(r, key);
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
      setDraft(raw(active.r, active.key));
      setInline(false);
    } else if (e.key === "ArrowUp" && e.target.selectionStart === 0) {
      e.preventDefault();
      commitAndMove(0, -1);
    } else if (e.key === "ArrowDown" && e.target.selectionEnd === draft.length) {
      e.preventDefault();
      commitAndMove(0, 1);
    }
  };

  const onSheetKeyDown = (e) => {
    if (contextMenu) return;
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
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (isExtra(ci)) return;
      if (selRange) {
        const newRows = rows.map((row, ri) => {
          if (ri < selRange.r1 || ri > selRange.r2) return row;
          const newRow = { ...row };
          for (let c = selRange.c1; c <= selRange.c2; c++) {
            const key = allKeys[c];
            if (key && !key.startsWith("__empty_")) newRow[key] = null;
          }
          return newRow;
        });
        onChange(newRows);
        setDraft("");
      } else {
        const { r, key } = active;
        if (isExtra(ci)) return;
        if (rows[r][key] !== "" && rows[r][key] !== null && rows[r][key] !== undefined) {
          onChange(rows.map((x, i) => (i === r ? { ...x, [key]: null } : x)));
        }
        setDraft("");
      }
      setInline(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      beginEdit(active.r, active.key);
      setDraft(e.key);
    }
  };

  const handleCopy = (cut = false) => {
    if (!active) return;
    if (selRange) {
      const data = [];
      for (let r = selRange.r1; r <= selRange.r2; r++) {
        const row = [];
        for (let c = selRange.c1; c <= selRange.c2; c++) {
          const key = allKeys[c];
          row.push(key && !key.startsWith("__empty_") ? raw(r, key) : "");
        }
        data.push(row);
      }
      const text = data.map((row) => row.join("\t")).join("\n");
      navigator.clipboard?.writeText(text).catch(() => {});
      setCopyClip({ data, range: { ...selRange }, cut });
      if (cut) {
        const newRows = rows.map((row, ri) => {
          if (ri < selRange.r1 || ri > selRange.r2) return row;
          const newRow = { ...row };
          for (let c = selRange.c1; c <= selRange.c2; c++) {
            const key = allKeys[c];
            if (key && !key.startsWith("__empty_")) newRow[key] = null;
          }
          return newRow;
        });
        onChange(newRows);
        setSelRange(null);
      }
    } else {
      const val = raw(active.r, active.key);
      navigator.clipboard?.writeText(val).catch(() => {});
      const ci = allKeys.indexOf(active.key);
      setCopyClip({ data: [[val]], range: { r1: active.r, r2: active.r, c1: ci, c2: ci }, cut });
      if (cut) {
        onChange(rows.map((x, i) => (i === active.r ? { ...x, [active.key]: null } : x)));
        setDraft("");
      }
    }
  };

  const handlePaste = async () => {
    if (!active) return;
    if (copyClip) {
      const startR = active.r;
      const startC = allKeys.indexOf(active.key);
      const newRows = [...rows.map((r) => ({ ...r }))];
      for (let dr = 0; dr < copyClip.data.length; dr++) {
        const ri = startR + dr;
        if (ri >= newRows.length) {
          if (onAddRow) {
            onAddRow();
            newRows.push({});
          } else break;
        }
        for (let dc = 0; dc < copyClip.data[dr].length; dc++) {
          const ci = startC + dc;
          if (ci >= allKeys.length) break;
          const key = allKeys[ci];
          if (key.startsWith("__empty_")) continue;
          const col = columns.find((c) => c.key === key);
          const val = copyClip.data[dr][dc];
          if (col && col.type === "number") {
            const n = parseFloat(val);
            newRows[ri][key] = isNaN(n) ? val : n;
          } else {
            newRows[ri][key] = val || null;
          }
        }
      }
      onChange(newRows);
      return;
    }
    try {
      const text = await navigator.clipboard?.readText();
      if (!text) return;
      const lines = text.split("\n").filter((l) => l.length > 0);
      const startR = active.r;
      const startC = allKeys.indexOf(active.key);
      const newRows = [...rows.map((r) => ({ ...r }))];
      for (let dr = 0; dr < lines.length; dr++) {
        const ri = startR + dr;
        if (ri >= newRows.length) {
          if (onAddRow) {
            onAddRow();
            newRows.push({});
          } else break;
        }
        const cells = lines[dr].split("\t");
        for (let dc = 0; dc < cells.length; dc++) {
          const ci = startC + dc;
          if (ci >= allKeys.length) break;
          const key = allKeys[ci];
          if (key.startsWith("__empty_")) continue;
          const col = columns.find((c) => c.key === key);
          const val = cells[dc];
          if (col && col.type === "number") {
            const n = parseFloat(val.replace(/[Rp\s,.]/gi, ""));
            newRows[ri][key] = isNaN(n) ? val : n;
          } else {
            newRows[ri][key] = val || null;
          }
        }
      }
      onChange(newRows);
    } catch (_) {}
  };

  const onSelectChange = (e, r, key) => {
    const v = e.target.value;
    const cur = rows[r][key] ?? "";
    if (String(v) !== String(cur)) {
      onChange(rows.map((x, i) => (i === r ? { ...x, [key]: v } : x)));
    }
    setDraft(v);
    setActiveState({ r, key });
  };

  const renderCell = (r, ci) => {
    const key = allKeys[ci];
    const extra = ci >= columns.length;
    const isActive = active !== null && active.r === r && active.key === key;
    const inSel = isInRange(r, ci);
    const value = extra ? "" : computed.get(`${r}:${key}`);
    const col = extra ? null : columns.find((c) => c.key === key);
    const isFormula =
      !extra && typeof rows[r]?.[key] === "string" && rows[r][key].trim().startsWith("=");
    const err = typeof value === "string" && value.startsWith("#");
    const cellBg = !extra && rows[r] ? rows[r]["__" + key] : undefined;

    if (extra) {
      return (
        <td
          key={key}
          className={`cell${isActive ? " active" : ""}${inSel ? " in-range" : ""}`}
          style={{ minWidth: allColWidth[ci] || 120, width: allColWidth[ci] || 120 }}
          onMouseDown={(e) => onCellMouseDown(r, key, e)}
          onMouseOver={() => onCellMouseOver(r, key)}
          onClick={() => onCellClick(r, key)}
        />
      );
    }

    if (isActive && inline && col?.type === "select") {
      return (
        <td
          key={key}
          className="cell active editing"
          style={{ minWidth: allColWidth[ci] || 120, width: allColWidth[ci] || 120 }}
        >
          <select
            className="cell-select"
            value={String(draft ?? "")}
            autoFocus
            onChange={(e) => onSelectChange(e, r, key)}
          >
            {col.options.map((o) => (
              <option key={String(o.value)} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </td>
      );
    }
    if (isActive && inline && col?.type === "date") {
      return (
        <td
          key={key}
          className="cell active editing"
          style={{ minWidth: allColWidth[ci] || 120, width: allColWidth[ci] || 120 }}
        >
          <input
            className="cell-input"
            type="date"
            value={draft ?? ""}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onInputKeyDown}
            onBlur={() => commit()}
          />
        </td>
      );
    }
    if (isActive && inline) {
      return (
        <td
          key={key}
          className={`cell active editing ${col?.type === "number" ? "number" : ""}`}
          style={{ minWidth: allColWidth[ci] || 120, width: allColWidth[ci] || 120 }}
        >
          <input
            className="cell-input"
            value={draft ?? ""}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onInputKeyDown}
            onBlur={() => commit()}
          />
        </td>
      );
    }

    const display = formatCellValue(value, col);
    return (
      <td
        key={key}
        className={`cell${isActive ? " active" : ""}${inSel ? " in-range" : ""}${col?.type === "number" ? " number" : ""}${
          err ? " cell-error" : ""
        }${isFormula ? " cell-formula" : ""}`}
        style={{ minWidth: allColWidth[ci] || 120, width: allColWidth[ci] || 120, ...(cellBg ? { backgroundColor: cellBg } : undefined) }}
        onMouseDown={(e) => onCellMouseDown(r, key, e)}
        onMouseOver={() => onCellMouseOver(r, key)}
        onClick={() => onCellClick(r, key)}
        onDoubleClick={() => beginEdit(r, key)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {isFormula && <span className="fx-badge">fx</span>}
        {display}
      </td>
    );
  };

  const fxValue = inline && active ? draft : (active ? raw(active.r, active.key) : "");
  const fxRefText = active
    ? cellAddress(allKeys.indexOf(active.key), active.r)
    : "";

  const onFxKeyDown = (e) => {
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
  };

  const onFxChange = (e) => {
    setDraft(e.target.value);
    if (!inline && active) setInline(true);
  };

  if (loading) {
    return (
      <div className="loading">
        <div>
          <div className="spinner" />
          <span>Memuat spreadsheet...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="spreadsheet">
      <div className="fx-bar">
        <span className="fx-ref">{fxRefText}</span>
        <span className="fx-icon">fx</span>
        <input
          ref={fxRef}
          className="fx-input"
          placeholder="Ketik rumus atau nilai, contoh: =SUM(D1:D10)"
          value={fxValue}
          onChange={onFxChange}
          onKeyDown={onFxKeyDown}
          onFocus={() => {
            if (active) setInline(true);
          }}
          disabled={!active}
        />
      </div>

      <div className="sheet-scroll" tabIndex={0} ref={sheetRef} onKeyDown={onSheetKeyDown}>
        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="big">📊</div>
            Belum ada baris data. Gunakan tombol <b>Tambah Baris</b> untuk mulai.
          </div>
        ) : (
          <table className="sheet">
            <thead>
              <tr>
                <th className="corner" />
                {allKeys.map((key, i) => (
                  <th
                    key={key}
                    className="col-letter"
                    style={{ minWidth: allColWidth[i], width: allColWidth[i] }}
                  >
                    {colName(i)}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="corner corner2" />
                {allKeys.map((key, i) => {
                  if (headerEditIndex === i) {
                    return (
                      <th key={key} className="col-label editing" style={{ minWidth: allColWidth[i] }}>
                        <input
                          className="cell-input"
                          value={headerDraft}
                          autoFocus
                          onChange={(e) => setHeaderDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitHeader();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              setHeaderEditIndex(null);
                            }
                          }}
                          onBlur={commitHeader}
                        />
                      </th>
                    );
                  }
                  return (
                    <th
                      key={key}
                      className="col-label"
                      style={{ minWidth: allColWidth[i] }}
                      onClick={() => beginHeaderEdit(i)}
                      onDoubleClick={() => beginHeaderEdit(i)}
                      title={isExtra(i) ? "" : "Klik untuk mengubah nama kolom"}
                    >
                      {isExtra(i) ? "" : (columns[i]?.label ?? "")}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => {
                const rowActive = active !== null && active.r === r;
                return (
                  <tr key={row.id ?? `row-${r}`} className={rowActive ? "row-active" : ""}>
                    <th
                      className={`row-num${rowActive ? " active" : ""}`}
                      onClick={() => selectCell(r, allKeys[0])}
                    >
                      <span>{r + 1}</span>
                      <button
                        className="row-del"
                        title="Hapus baris"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRequest?.(row);
                        }}
                      >
                        <IconTrash size={12} />
                      </button>
                    </th>
                    {allKeys.map((key, ci) => renderCell(r, ci))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
            if (active && !isExtra(allKeys.indexOf(active.key))) {
              onChange(rows.map((x, i) => (i === active.r ? { ...x, [active.key]: null } : x)));
              setDraft("");
            }
            setContextMenu(null);
          }}>
            <span className="sc-key">Del</span> Hapus Isi
          </button>
        </div>
      )}
    </div>
  );
}
