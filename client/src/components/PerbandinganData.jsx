import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import {
  toNum,
  detectColumnType,
  parsePeriod,
  periodLabel,
} from "../perbandinganUtils.js";
import { formatNumber } from "../api.js";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler
);

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#a855f7", "#f43f5e", "#84cc16", "#0ea5e9", "#6d28d9",
];

const CHART_KINDS = [
  { value: "bar", label: "Bar (Kolom)" },
  { value: "hbar", label: "Bar (Horizontal)" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
];

const colName = (i) => String.fromCharCode(65 + i);

const fmtVal = (n) => (isFinite(n) ? formatNumber(n) : "-");

const fmtPct = (pct) => {
  if (pct === null || !isFinite(pct)) return "-";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
};

export default function PerbandinganData({ tables = [], title, compact = false }) {
  tables = Array.isArray(tables) ? tables : [];

  const [groupBy, setGroupBy] = React.useState("year");
  const [periodCol, setPeriodCol] = React.useState(-1);
  const [metrics, setMetrics] = React.useState([]);
  const [chartKind, setChartKind] = React.useState("bar");
  const [chartMetric, setChartMetric] = React.useState(-1);
  const [selTables, setSelTables] = React.useState([]);
  const [selectedPeriods, setSelectedPeriods] = React.useState([]);

  const tableSig = tables.map((t) => t.name).join("|");

  // Deteksi kolom tanggal & numerik (gabungan semua tabel/sheet).
  const dateCols = React.useMemo(() => {
    const set = new Set();
    for (const t of tables) {
      for (let i = 0; i < (t.headers || []).length; i++) {
        if (detectColumnType((t.rows || []).map((r) => r[i])) === "date") set.add(i);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [tables]);

  const numCols = React.useMemo(() => {
    const set = new Set();
    for (const t of tables) {
      for (let i = 0; i < (t.headers || []).length; i++) {
        if (detectColumnType((t.rows || []).map((r) => r[i])) === "number") set.add(i);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [tables]);

  // Reset otomatis saat tabel/sheet berubah (mis. ganti file).
  React.useEffect(() => {
    setPeriodCol(-1);
    setMetrics([]);
    setChartMetric(-1);
    setSelTables([]);
    setSelectedPeriods([]);
  }, [tableSig]);

  React.useEffect(() => {
    setSelectedPeriods([]);
  }, [tableSig, groupBy]);

  const incTables = React.useMemo(
    () => {
      if (!selTables.length) return tables.map((_, i) => i);
      return selTables;
    },
    [selTables, tables]
  );
  const incTablesKey = incTables.join(",");

  const effPeriodCol = periodCol >= 0 && periodCol < dateCols.length ? dateCols[periodCol] : dateCols[0];
  const effectivePeriodIndex =
    dateCols.length && effPeriodCol !== undefined && dateCols.includes(effPeriodCol)
      ? dateCols.indexOf(effPeriodCol)
      : -1;
  const effectivePeriodCol = effectivePeriodIndex >= 0 ? effPeriodCol : -1;

  const effMetrics =
    metrics.length > 0
      ? [...metrics].sort((a, b) => a - b)
      : numCols.slice(0, Math.min(numCols.length, 4));
  const metricsKey = effMetrics.join(",");

  const metricLabel = (i) => {
    const src = tables.find((t) => (t.headers || [])[i] !== undefined);
    const lbl = src && src.headers[i] ? src.headers[i] : i < 26 ? colName(i) : `Kolom ${i + 1}`;
    return lbl;
  };

  const chartMetricIdx =
    chartMetric >= 0 && chartMetric < effMetrics.length
      ? chartMetric
      : effMetrics.length > 0
        ? 0
        : -1;

  // Periode yang tersedia dari data asli.
  const availablePeriods = React.useMemo(() => {
    const map = new Map();
    if (effectivePeriodCol < 0) return [];
    for (const ti of incTables) {
      const t = tables[ti];
      if (!t || !Array.isArray(t.rows)) continue;
      for (const row of t.rows) {
        const pk = parsePeriod(row[effectivePeriodCol], groupBy);
        if (pk !== null) map.set(pk, { key: pk, label: periodLabel(pk, groupBy) });
      }
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }, [tables, incTablesKey, effectivePeriodCol, groupBy]);

  React.useEffect(() => {
    setSelectedPeriods((prev) => {
      const avail = new Set(availablePeriods.map((p) => p.key));
      if (prev.length) {
        const keep = prev.filter((k) => avail.has(k));
        if (keep.length) return keep;
      }
      return availablePeriods.slice(0, Math.min(availablePeriods.length, 6)).map((p) => p.key);
    });
  }, [availablePeriods]);

  const displayPeriods = React.useMemo(
    () => availablePeriods.filter((p) => selectedPeriods.includes(p.key)),
    [availablePeriods, selectedPeriods]
  );

  // Agregasi per periode.
  const { agg, perTable, countRows } = React.useMemo(() => {
    const agg = new Map();
    const perTable = new Map();
    let countRows = 0;
    if (effectivePeriodCol < 0) return { agg, perTable, countRows };
    for (const ti of incTables) {
      const t = tables[ti];
      if (!t || !Array.isArray(t.rows)) continue;
      let pt = perTable.get(ti);
      if (!pt) { pt = new Map(); perTable.set(ti, pt); }
      for (const row of t.rows) {
        const pk = parsePeriod(row[effectivePeriodCol], groupBy);
        if (pk === null) continue;
        countRows++;
        let ag = agg.get(pk);
        if (!ag) { ag = { count: 0, sums: effMetrics.map(() => 0) }; agg.set(pk, ag); }
        ag.count++;
        let tpa = pt.get(pk);
        if (!tpa) { tpa = { count: 0, sums: effMetrics.map(() => 0) }; pt.set(pk, tpa); }
        tpa.count++;
        effMetrics.forEach((mi, k) => {
          const v = toNum(row[mi]);
          if (!isNaN(v)) { ag.sums[k] += v; tpa.sums[k] += v; }
        });
      }
    }
    return { agg, perTable, countRows };
  }, [tables, incTablesKey, effectivePeriodCol, metricsKey, groupBy]);

  const tableRows = displayPeriods.map((p) => {
    const a = agg.get(p.key) || { count: 0, sums: effMetrics.map(() => 0) };
    return { pk: p.key, label: p.label, vals: a.sums, count: a.count };
  });

  const grandTotal = {
    vals: effMetrics.map((_, k) => tableRows.reduce((s, r) => s + r.vals[k], 0)),
    count: tableRows.reduce((s, r) => s + r.count, 0),
  };

  const hasDate = dateCols.length > 0;
  const hasNum = numCols.length > 0;
  const showHint = !hasDate || !hasNum;

  const chartData = React.useMemo(() => {
    if (!displayPeriods.length || chartMetricIdx < 0 || !tables.length) return null;
    const labels = displayPeriods.map((p) => p.label);
    const datasets = incTables.map((ti, di) => {
      const color = CHART_COLORS[di % CHART_COLORS.length];
      const pt = perTable.get(ti) || new Map();
      const data = displayPeriods.map((p) => {
        const tpa = pt.get(p.key);
        return tpa ? tpa.sums[chartMetricIdx] || 0 : 0;
      });
      const isArea = chartKind === "area";
      const isLine = chartKind === "line" || isArea;
      return {
        label: tables[ti].name || `Sheet ${di + 1}`,
        data,
        backgroundColor: isArea ? color + "30" : color,
        borderColor: color,
        borderWidth: 2,
        fill: isArea,
        tension: isLine ? 0.35 : 0,
        pointRadius: isLine ? 3 : 1,
        pointBackgroundColor: color,
        pointBorderColor: "#fff",
        pointBorderWidth: 1,
      };
    });
    return { labels, datasets };
  }, [displayPeriods, chartMetricIdx, incTablesKey, perTable, tables, chartKind]);

  const chartOptions = React.useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    indexAxis: chartKind === "hbar" ? "y" : "x",
    plugins: {
      legend: { position: "top", labels: { usePointStyle: true, padding: 14, font: { size: 12 } } },
      tooltip: {
        backgroundColor: "rgba(15,23,42,0.9)",
        callbacks: {
          label: (ctx) => {
            const raw = ctx.raw ?? 0;
            return ` ${ctx.dataset.label}: ${formatNumber(raw)}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.06)" }, ticks: { font: { size: 11 } } },
    },
  }), [chartKind]);

  const renderChart = () => {
    if (!chartData) return null;
    if (chartKind === "line" || chartKind === "area") return <Line data={chartData} options={chartOptions} />;
    return <Bar data={chartData} options={chartOptions} />;
  };

  const toggleTable = (ti) => {
    setSelTables((prev) => {
      if (prev.includes(ti)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== ti);
      }
      return [...prev, ti];
    });
  };

  const togglePeriod = (pk) => {
    setSelectedPeriods((prev) =>
      prev.includes(pk) ? prev.filter((x) => x !== pk) : [...prev, pk]
    );
  };

  // Statistik besar kenaikan/penurunan untuk metrik pertama.
  const trendStats = React.useMemo(() => {
    if (tableRows.length < 2 || effMetrics.length === 0) return null;
    let inc = null;
    let dec = null;
    for (let i = 1; i < tableRows.length; i++) {
      const prev = tableRows[i - 1].vals[0];
      const cur = tableRows[i].vals[0];
      if (!isFinite(prev) || prev === 0) continue;
      const diff = cur - prev;
      const pct = (diff / Math.abs(prev)) * 100;
      if (pct > 0 && (inc === null || pct > inc.pct)) inc = { label: tableRows[i].label, pct, diff };
      if (pct < 0 && (dec === null || pct < dec.pct)) dec = { label: tableRows[i].label, pct, diff };
    }
    return { inc, dec };
  }, [tableRows, effMetrics]);

  return (
    <div className={`cmp-wrap${compact ? " cmp-compact" : ""}`}>
      {title && (
        <div className="card-header cmp-header">
          <h2>{title}</h2>
          {countRows > 0 && <span className="badge masuk">{formatNumber(countRows)} baris data</span>}
        </div>
      )}

      {showHint ? (
        <div className="card-body">
          <div className="empty-state">
            <div className="big">&#128200;</div>
            <p>
              {!hasDate
                ? "Belum ditemukan kolom tanggal/tahun pada data ini. Isi atau impor data berkolom tanggal agar bisa dibandingkan antar periode."
                : "Belum ditemukan kolom numerik (Jumlah/Nilai/Harga) untuk dibandingkan."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="card cmp-config">
            <div className="cmp-config-grid">
              <div className="form-group">
                <label>Kelompokkan Berdasarkan</label>
                <select
                  className="form-control"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                >
                  <option value="year">Tahun</option>
                  <option value="month">Bulan &amp; Tahun</option>
                </select>
              </div>
              <div className="form-group">
                <label>Kolom Periode (Tanggal/Tahun)</label>
                <select
                  className="form-control"
                  value={effectivePeriodIndex}
                  onChange={(e) => setPeriodCol(parseInt(e.target.value, 10))}
                >
                  {dateCols.map((idx, k) => (
                    <option key={idx} value={k}>{metricLabel(idx)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Metrik (Kolom Numerik)</label>
                <select
                  className="form-control"
                  value={chartMetricIdx}
                  onChange={(e) => setChartMetric(parseInt(e.target.value, 10))}
                >
                  {effMetrics.map((idx, k) => (
                    <option key={idx} value={k}>{metricLabel(idx)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Jenis Chart</label>
                <select
                  className="form-control"
                  value={chartKind}
                  onChange={(e) => setChartKind(e.target.value)}
                >
                  {CHART_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {tables.length > 1 && (
              <div className="form-group">
                <label>Sheet yang Dibandingkan</label>
                <div className="cmp-table-checks">
                  {tables.map((t, ti) => (
                    <label key={ti} className={`chart-y-check${incTables.includes(ti) ? " selected" : ""}`}>
                      <input type="checkbox" checked={incTables.includes(ti)} onChange={() => toggleTable(ti)} />
                      <span>{t.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {availablePeriods.length > 0 && (
              <div className="form-group">
                <label>
                  Periode (minimal 2) <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>&middot; {selectedPeriods.length} dipilih</span>
                </label>
                <div className="cmp-period-chips">
                  {availablePeriods.map((p) => {
                    const on = selectedPeriods.includes(p.key);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={`cmp-chip${on ? " on" : ""}`}
                        onClick={() => togglePeriod(p.key)}
                        title={on ? "Klik untuk hapus" : "Klik untuk pilih"}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="cmp-chip-actions">
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setSelectedPeriods(availablePeriods.map((p) => p.key))}>
                    Pilih Semua
                  </button>
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setSelectedPeriods(availablePeriods.slice(0, Math.min(2, availablePeriods.length)).map((p) => p.key))}>
                    2 Periode Terawal
                  </button>
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setSelectedPeriods([])}>
                    Kosongkan
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedPeriods.length < 2 && (
            <div className="cmp-warning">Pilih minimal 2 periode agar selisih dan persentase dapat dihitung.</div>
          )}

          {countRows > 0 && (
            <div className="stats-grid cmp-stats">
              <div className="stat-card">
                <div className="stat-icon blue"><span style={{ fontSize: 16 }}>#</span></div>
                <div className="stat-info"><span className="label">Periode Dibandingkan</span><span className="value">{displayPeriods.length}</span></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green"><span style={{ fontSize: 16 }}>&#128202;</span></div>
                <div className="stat-info"><span className="label">Total Data Diproses</span><span className="value">{formatNumber(countRows)}</span></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon purple"><span style={{ fontSize: 16 }}>&#9650;</span></div>
                <div className="stat-info">
                  <span className="label">Kenaikan Terbesar ({metricLabel(effMetrics[0])})</span>
                  <span className="value">
                    {trendStats?.inc ? `${trendStats.inc.label} (${fmtPct(trendStats.inc.pct)})` : "-"}
                  </span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon red"><span style={{ fontSize: 16 }}>&#9660;</span></div>
                <div className="stat-info">
                  <span className="label">Penurunan Terbesar ({metricLabel(effMetrics[0])})</span>
                  <span className="value">
                    {trendStats?.dec ? `${trendStats.dec.label} (${fmtPct(trendStats.dec.pct)})` : "-"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="card mt">
            <div className="card-header">
              <h2>Grafik Perbandingan</h2>
              <span className="badge pending">{chartKind === "bar" ? "Bar (Kolom)" : chartKind === "hbar" ? "Bar (Horizontal)" : chartKind === "line" ? "Line" : "Area"}</span>
            </div>
            <div className="cmp-chart">
              {chartData ? (
                <div className="excel-chart-canvas" style={{ height: compact ? 260 : 320 }}>{renderChart()}</div>
              ) : (
                <div className="empty-state" style={{ padding: "36px 16px" }}>
                  <p>Pilih minimal 2 periode untuk menampilkan grafik.</p>
                </div>
              )}
            </div>
          </div>

          <div className="cmp-tables">
            <div className="card">
              <div className="card-header"><h2>Total per Periode</h2></div>
              <div className="table-wrap">
                <table className="table cmp-table">
                  <thead>
                    <tr>
                      <th>Periode</th>
                      {effMetrics.map((mi, k) => (
                        <th key={mi} className="text-right">{metricLabel(mi)}</th>
                      ))}
                      <th className="text-right">Baris</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r) => (
                      <tr key={r.pk}>
                        <td className="font-bold">{r.label}</td>
                        {r.vals.map((v, k) => (
                          <td key={k} className="text-right">{fmtVal(v)}</td>
                        ))}
                        <td className="text-right">{formatNumber(r.count)}</td>
                      </tr>
                    ))}
                    <tr className="row-active" style={{ fontWeight: 700 }}>
                      <td>TOTAL</td>
                      {grandTotal.vals.map((v, k) => (
                        <td key={k} className="text-right">{fmtVal(v)}</td>
                      ))}
                      <td className="text-right">{formatNumber(grandTotal.count)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {tableRows.length >= 2 && (
              <div className="card">
                <div className="card-header"><h2>Selisih &amp; Persentase (vs Periode Sebelumnya)</h2></div>
                <div className="table-wrap">
                  <table className="table cmp-table">
                    <thead>
                      <tr>
                        <th>Periode</th>
                        {effMetrics.map((mi) => (
                          <React.Fragment key={mi}>
                            <th className="text-right">Selisih {metricLabel(mi)}</th>
                            <th className="text-right">%</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r, i) => {
                        const prevRow = i > 0 ? tableRows[i - 1] : null;
                        return (
                          <tr key={r.pk}>
                            <td className="font-bold">{r.label}</td>
                            {effMetrics.map((_mi, k) => {
                              if (!prevRow) return (
                                <React.Fragment key={k}>
                                  <td className="text-right text-muted">-</td>
                                  <td className="text-right text-muted">-</td>
                                </React.Fragment>
                              );
                              const diff = r.vals[k] - prevRow.vals[k];
                              const pct = prevRow.vals[k] !== 0 ? (diff / Math.abs(prevRow.vals[k])) * 100 : null;
                              const up = diff > 0;
                              const dn = diff < 0;
                              return (
                                <React.Fragment key={k}>
                                  <td className={`text-right ${up ? "text-up" : dn ? "text-down" : ""}`}>
                                    {up ? "▲ " : dn ? "▼ " : ""}{fmtVal(diff)}
                                  </td>
                                  <td className={`text-right ${up ? "text-up" : dn ? "text-down" : ""}`}>
                                    {fmtPct(pct)}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {incTables.length > 1 && chartMetricIdx >= 0 && (
              <div className="card">
                <div className="card-header"><h2>Perincian per Sheet — {metricLabel(effMetrics[chartMetricIdx])}</h2></div>
                <div className="table-wrap">
                  <table className="table cmp-table">
                    <thead>
                      <tr>
                        <th>Periode</th>
                        {incTables.map((ti) => (
                          <th key={ti} className="text-right">{tables[ti].name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r) => (
                        <tr key={r.pk}>
                          <td className="font-bold">{r.label}</td>
                          {incTables.map((ti) => {
                            const pt = perTable.get(ti) || new Map();
                            const tpa = pt.get(r.pk);
                            return <td key={ti} className="text-right">{fmtVal(tpa ? tpa.sums[chartMetricIdx] : 0)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}