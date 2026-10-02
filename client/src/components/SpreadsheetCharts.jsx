import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { getSheets, getNonEmptyRows, sheetNumericTotal, sheetCellCount } from "../spreadsheetWorkbook.js";
import { formatNumber } from "../api.js";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler
);

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#a855f7", "#f43f5e", "#84cc16", "#0ea5e9", "#6d28d9",
];

export default function SpreadsheetCharts() {
  const [sheets, setSheets] = React.useState(() => getSheets());

  React.useEffect(() => {
    const listener = () => setSheets(getSheets());
    window.addEventListener("storage", listener);
    window.addEventListener("focus", listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("focus", listener);
    };
  }, []);

  if (!sheets || sheets.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="big">&#128202;</div>
          <p>Belum ada data spreadsheet. Buka halaman <b>Spreadsheet</b> lalu isi/import data terlebih dahulu.</p>
        </div>
      </div>
    );
  }

  const names = sheets.map((s) => s.name);
  const totalNilai = sheets.map((s) => sheetNumericTotal(s));
  const barisBerisi = sheets.map((s) => getNonEmptyRows(s).length);
  const selTerisi = sheets.map((s) => sheetCellCount(s));

  const sumVal = totalNilai.reduce((a, b) => a + b, 0);
  const sumBaris = barisBerisi.reduce((a, b) => a + b, 0);
  const sumSel = selTerisi.reduce((a, b) => a + b, 0);

  const barData = {
    labels: names,
    datasets: [{
      label: "Total Nilai Numerik",
      data: totalNilai,
      backgroundColor: COLORS,
      borderColor: "#fff",
      borderWidth: 1,
    }],
  };

  const donutData = {
    labels: names,
    datasets: [{
      label: "Distribusi Nilai",
      data: selTerisi,
      backgroundColor: COLORS,
      borderColor: "#fff",
      borderWidth: 2,
    }],
  };

  const lineData = {
    labels: names,
    datasets: [
      {
        label: "Baris Berisi",
        data: barisBerisi,
        borderColor: "#6366f1",
        backgroundColor: "#6366f130",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: "#6366f1",
      },
      {
        label: "Sel Terisi",
        data: selTerisi,
        borderColor: "#22c55e",
        backgroundColor: "#22c55e30",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: "#22c55e",
      },
    ],
  };

  return (
    <div className="sv-charts-wrap">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><span style={{ fontSize: 18 }}>#</span></div>
          <div className="stat-info">
            <div className="label">Total Sheet</div>
            <div className="value">{sheets.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><span style={{ fontSize: 18 }}>&#128194;</span></div>
          <div className="stat-info">
            <div className="label">Total Baris Berisi</div>
            <div className="value">{formatNumber(sumBaris)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><span style={{ fontSize: 18 }}>&#128202;</span></div>
          <div className="stat-info">
            <div className="label">Total Sel Terisi</div>
            <div className="value">{formatNumber(sumSel)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><span style={{ fontSize: 18 }}>&#128176;</span></div>
          <div className="stat-info">
            <div className="label">Total Nilai Numerik</div>
            <div className="value" style={{ fontSize: 15 }}>{formatNumber(sumVal)}</div>
          </div>
        </div>
      </div>

      <div className="sv-chart-row">
        <div className="card sv-chart-card">
          <div className="card-header"><h2>Total Nilai Numerik per Sheet</h2></div>
          <div className="sv-chart-canvas">
            <Bar data={barData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(15,23,42,0.9)" } },
              scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.06)" } } },
            }} />
          </div>
        </div>
        <div className="card sv-chart-card">
          <div className="card-header"><h2>Komposisi Isi per Sheet</h2></div>
          <div className="sv-chart-canvas">
            <Doughnut data={donutData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: "bottom", labels: { padding: 12, usePointStyle: true, font: { size: 11 } } } },
            }} />
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="card-header"><h2>Progres Data per Sheet</h2></div>
        <div className="sv-chart-canvas sv-chart-tall">
          <Line data={lineData} options={{
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: "index" },
            plugins: { legend: { position: "top", labels: { usePointStyle: true, font: { size: 11 } } }, tooltip: { backgroundColor: "rgba(15,23,42,0.9)" } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.06)" } } },
          }} />
        </div>
      </div>
    </div>
  );
}
