import { getToken, clearAuth } from "./auth.js";

async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (cause) {
    // fetch() gagal di level jaringan (server mati, koneksi putus, proxy mati).
    // Pesan bawaan browser ("Failed to fetch") tidak informatif, jadi diganti.
    const err = new Error("Tidak dapat terhubung ke server. Pastikan server API sedang berjalan.");
    err.status = 0;
    err.network = true;
    err.cause = cause;
    throw err;
  }
  if (res.status === 401) {
    clearAuth();
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* body may be empty */
  }
  if (!res.ok) {
    // 5xx tanpa pesan dari server biasanya berarti server mati / proxy gagal,
    // jadi beri petunjuk yang jelas alih-alih "Terjadi kesalahan" yang kabur.
    const fallback =
      res.status >= 500
        ? "Server tidak dapat dihubungi (bermasalah atau sedang mati). Coba muat ulang beberapa saat lagi."
        : "Terjadi kesalahan";
    const err = new Error(data.error || data.detail || fallback);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function appendParams(qs, params) {
  Object.entries(params).forEach(([k, v]) => {
    if (v === "" || v === undefined || v === null) return;
    if (Array.isArray(v)) qs.set(k, v.join(","));
    else qs.set(k, v);
  });
}

export const api = {
  register: (body) => request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request("/api/auth/me"),
  updateProfile: (body) => request("/api/auth/profile", { method: "PUT", body: JSON.stringify(body) }),
  deleteAccount: () => request("/api/auth/account", { method: "DELETE" }),
  stats: () => request("/api/stats"),
  getData: (params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    return request(`/api/data?${qs.toString()}`);
  },
  createData: (body) => request("/api/data", { method: "POST", body: JSON.stringify(body) }),
  updateData: (id, body) =>
    request(`/api/data/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteData: (id) => request(`/api/data/${id}`, { method: "DELETE" }),
  getKategori: () => request("/api/kategori"),
  createKategori: (body) =>
    request("/api/kategori", { method: "POST", body: JSON.stringify(body) }),
  updateKategori: (id, body) =>
    request(`/api/kategori/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteKategori: (id) => request(`/api/kategori/${id}`, { method: "DELETE" }),
  getSubKategori: (kategoriId) => request(`/api/kategori/${kategoriId}/subkategori`),
  createSubKategori: (kategoriId, body) =>
    request(`/api/kategori/${kategoriId}/subkategori`, { method: "POST", body: JSON.stringify(body) }),
  updateSubKategori: (id, body) =>
    request(`/api/subkategori/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSubKategori: (id) => request(`/api/subkategori/${id}`, { method: "DELETE" }),
  report: () => request("/api/report"),
  getYearlyData: (params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    return request(`/api/data/yearly?${qs.toString()}`);
  },
  getStatsYearly: () => request("/api/stats/yearly"),
  importExcel: (body) =>
    request("/api/import/excel", { method: "POST", body: JSON.stringify(body) }),
  importWorkbook: (body) =>
    request("/api/import/workbook", { method: "POST", body: JSON.stringify(body) }),
  deleteAllData: (kategoriId) =>
    request(`/api/data/bulk/kategori/${kategoriId}`, { method: "DELETE" }),
  getRiwayat: (params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    return request(`/api/riwayat?${qs.toString()}`);
  },
  getRiwayatDetail: (id) => request(`/api/riwayat/${id}`),
  createRiwayat: (body) => request("/api/riwayat", { method: "POST", body: JSON.stringify(body) }),
  deleteRiwayat: (id) => request(`/api/riwayat/${id}`, { method: "DELETE" }),
  restoreRiwayat: (id) => request(`/api/riwayat/${id}/pulihkan`, { method: "POST" }),
  exportUrl: (type = "excel", params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return `/api/export/${type}${suffix}`;
  },
  exportTemplateUrl: () => "/api/export/template",
  getSpreadsheet: () => request("/api/spreadsheet"),
  createSpreadsheet: (body) =>
    request("/api/spreadsheet", { method: "POST", body: JSON.stringify(body) }),
  updateSpreadsheet: (id, body) =>
    request(`/api/spreadsheet/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSpreadsheet: (id) => request(`/api/spreadsheet/${id}`, { method: "DELETE" }),
  deleteAllSpreadsheet: () => request("/api/spreadsheet", { method: "DELETE" }),
  getSpreadsheetData: (id) => request(`/api/spreadsheet/${id}/data`),
  getKlasifikasi: (params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    return request(`/api/klasifikasi?${qs.toString()}`);
  },
  klasifikasikan: (body) =>
    request("/api/klasifikasi/klasifikasikan", { method: "POST", body: JSON.stringify(body) }),
  getStatus: () => request("/api/status"),
  getAdminUsers: () => request("/api/admin/users"),
  createAdminUser: (body) => request("/api/admin/users", { method: "POST", body: JSON.stringify(body) }),
  updateAdminUser: (id, body) =>
    request(`/api/admin/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAdminUser: (id) => request(`/api/admin/users/${id}`, { method: "DELETE" }),
  getAdminPermissions: () => request("/api/admin/permissions"),
  // Penugasan berbasis cakupan (workbook/sheet/kolom/baris/range/cell)
  getAdminScopes: (params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    return request(`/api/admin/scopes?${qs.toString()}`);
  },
  createAdminScope: (body) =>
    request("/api/admin/scopes", { method: "POST", body: JSON.stringify(body) }),
  updateAdminScope: (id, body) =>
    request(`/api/admin/scopes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAdminScope: (id) => request(`/api/admin/scopes/${id}`, { method: "DELETE" }),
  getLocks: (params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    return request(`/api/locks?${qs.toString()}`);
  },
  createAdminPermission: (body) =>
    request("/api/admin/permissions", { method: "POST", body: JSON.stringify(body) }),
  updateAdminPermission: (id, body) =>
    request(`/api/admin/permissions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAdminPermission: (id) => request(`/api/admin/permissions/${id}`, { method: "DELETE" }),
  getAdminSections: (params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    return request(`/api/admin/sections?${qs.toString()}`);
  },
  createAdminSection: (body) =>
    request("/api/admin/sections", { method: "POST", body: JSON.stringify(body) }),
  updateAdminSection: (id, body) =>
    request(`/api/admin/sections/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAdminSection: (id) => request(`/api/admin/sections/${id}`, { method: "DELETE" }),
  getMaintenance: () => request("/api/admin/maintenance"),
  setMaintenance: (body) =>
    request("/api/admin/maintenance", { method: "PUT", body: JSON.stringify(body) }),
  getAdminSettings: () => request("/api/admin/settings"),
  setAdminSettings: (body) =>
    request("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }),
  getBackups: () => request("/api/admin/backups"),
  createBackup: (body = {}) =>
    request("/api/admin/backups", { method: "POST", body: JSON.stringify(body) }),
  deleteBackup: (id) => request(`/api/admin/backups/${id}`, { method: "DELETE" }),
  restoreBackup: (id) => request(`/api/admin/backups/${id}/restore`, { method: "POST" }),
  downloadBackupUrl: (id) => `/api/admin/backups/${id}`,
  getAuditLogs: (params = {}) => {
    const qs = new URLSearchParams();
    appendParams(qs, params);
    return request(`/api/audit/logs?${qs.toString()}`);
  },
  getAuditMeta: () => request("/api/audit/meta"),
  getAuditLogDetail: (id) => request(`/api/audit/logs/${id}`),
  getDashboardGreeting: () => request("/api/dashboard/greeting"),
  setDashboardGreeting: (body) =>
    request("/api/dashboard/greeting", { method: "PUT", body: JSON.stringify(body) }),
};

export const formatRupiah = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(n) || 0
  );

export const formatNumber = (n) => new Intl.NumberFormat("id-ID").format(Number(n) || 0);

export const formatTanggal = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};
