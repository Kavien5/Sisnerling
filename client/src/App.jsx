import React from "react";
import Layout from "./components/Layout.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import KategoriPage from "./pages/KategoriPage.jsx";
import Laporan from "./pages/Laporan.jsx";
import ExcelResult from "./pages/ExcelResult.jsx";
import ExcelEditor from "./pages/ExcelEditor.jsx";
import FilesPage from "./pages/FilesPage.jsx";
import Panduan from "./pages/Panduan.jsx";
import AuditLogs from "./pages/AuditLogs.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import { AdminUsers, AdminTables, AdminMaintenance, AdminBackup, AdminSettings, MaintenancePage, AdminMaintenanceBlockedPage } from "./pages/AdminPages.jsx";
import { loadFiles, saveFile, removeFile, generateId, clearAllFiles, hydrateFiles } from "./excelStorage.js";
import { api } from "./api.js";
import { getToken, getUser, setAuth, clearAuth, updateStoredUser, isSuperAdmin, hasMaintenanceBypass, canEditData } from "./auth.js";

export default function App() {
  const [page, setPage] = React.useState("spreadsheet");
  const [importedFiles, setImportedFiles] = React.useState(() => loadFiles());
  const [activeFileId, setActiveFileId] = React.useState(null);

  const [user, setUser] = React.useState(() => getUser());
  const [authReady, setAuthReady] = React.useState(false);
  const [authMode, setAuthMode] = React.useState("login");
  const [maintenance, setMaintenance] = React.useState(null);

  // Cek status maintenance secara berkala (dipakai untuk gerbang halaman).
  const pollMaintenance = React.useCallback(async () => {
    try {
      const res = await api.getStatus();
      setMaintenance(res.maintenance || null);
    } catch {
      /* abaikan; jika server mati biarkan status sebelumnya */
    }
  }, []);

  React.useEffect(() => {
    pollMaintenance();
    const t = setInterval(pollMaintenance, 45000);
    return () => clearInterval(t);
  }, [pollMaintenance]);

  // Pertahanan ekstra: halaman terbatas untuk role (hanya dieksekusi saat sudah login).
  React.useEffect(() => {
    if (user) {
      if (!isSuperAdmin(user) && (page.startsWith("admin-") || page === "audit-log")) {
        setPage("dashboard");
      }
    }
  }, [page, user]);

  // Apakah maintenance sedang aktif untuk pengguna ini (semua kecuali Super Admin).
  const maintenanceBlocking = !!(maintenance && maintenance.active && !hasMaintenanceBypass(user));

  // Validasi ulang sesi yang tersimpan pada saat aplikasi dibuka.
  React.useEffect(() => {
    let alive = true;
    const token = getToken();
    if (!token) {
      setUser(null);
      setAuthReady(true);
      return;
    }
    api
      .me()
      .then((res) => {
        if (alive) {
          // Jangan pernah menimpa token yang tersimpan dengan undefined —
          // endpoint /me boleh tidak mengembalikan token, token lama dipertahankan
          // agar sesi tetap valid setelah refresh.
          setAuth(res.token || getToken(), res.user);
          setUser(res.user);
        }
      })
      .catch(() => {
        clearAuth();
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setAuthReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Pulihkan file terimport dari IndexedDB (kuota localStorage tidak cukup untuk
  // file Excel berukuran besar) lalu segarkan daftar file di UI. Setelah ini,
  // localStorage juga ikut disinkronkan sebagai cache kilat.
  React.useEffect(() => {
    let alive = true;
    hydrateFiles()
      .then(() => {
        if (alive) setImportedFiles(loadFiles());
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (importedFiles.length > 0) {
      saveFile(importedFiles[importedFiles.length - 1]);
    }
  }, [importedFiles]);

  const handleLogin = (token, u) => {
    setAuth(token, u);
    setUser(u);
    setPage("dashboard");
  };

  const handleRegister = (token, u) => {
    setAuth(token, u);
    setUser(u);
    setPage("dashboard");
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* abaikan error saat logout */
    }
    clearAuth();
    setUser(null);
    setPage("spreadsheet");
  };

  const handleUserUpdated = (u) => {
    updateStoredUser(u);
    setUser(u);
  };

  const handleAccountDeleted = () => {
    clearAuth();
    clearAllFiles();
    setUser(null);
    setImportedFiles([]);
    setActiveFileId(null);
    setPage("spreadsheet");
  };

  const handleImport = (data) => {
    const id = generateId();
    const entry = {
      id,
      fileName: data.fileName,
      workbook: data.workbook,
      sheetNames: data.sheetNames,
      rawBase64: data.rawBase64 || "",
    };
    setImportedFiles((prev) => [...prev, entry]);
    setActiveFileId(id);
    setPage("import-result");
  };

  const handleRemoveFile = (fileId) => {
    removeFile(fileId);
    setImportedFiles((prev) => {
      const next = prev.filter((f) => f.id !== fileId);
      if (next.length === 0) {
        setPage("files");
        setActiveFileId(null);
      } else if (activeFileId === fileId) {
        setActiveFileId(next[next.length - 1].id);
      }
      return next;
    });
  };

  const handleRenameFile = (fileId, namaBaru) => {
    const entry = importedFiles.find((f) => f.id === fileId);
    if (!entry) return;
    const trimmed = String(namaBaru || "").trim();
    if (!trimmed) return;
    saveFile({ id: entry.id, fileName: trimmed, workbook: entry.workbook, rawBase64: entry.rawBase64 });
    setImportedFiles(loadFiles());
  };

  const handleSelectFile = (fileId) => {
    setActiveFileId(fileId);
    setPage("import-result");
  };

  const handleOpenFileInSpreadsheet = (fileId) => {
    setActiveFileId(fileId);
    setPage("spreadsheet");
  };

  const activeFile = importedFiles.find((f) => f.id === activeFileId) || null;

  // Tampilkan layar login/register selama belum selesai validasi sesi.
  if (!authReady) {
    return (
      <ToastProvider>
        <div className="auth-page">
          <div className="auth-loading">Memuat...</div>
        </div>
      </ToastProvider>
    );
  }

  if (!user) {
    return (
      <ToastProvider>
        {authMode === "register" ? (
          <Register onRegister={handleRegister} onSwitchToLogin={() => setAuthMode("login")} />
        ) : (
          <Login onLogin={handleLogin} onSwitchToRegister={() => setAuthMode("register")} />
        )}
      </ToastProvider>
    );
  }

  // Saat maintenance aktif: User & Admin lihat halaman blokir baru per-role.
  // Super Admin tidak diblokir (lihat banner di halaman utama via Layout).
  if (maintenanceBlocking) {
    const isAdmin = user?.role === "admin";
    return (
      <ToastProvider>
        {isAdmin ? (
          <AdminMaintenanceBlockedPage maintenance={maintenance} user={user} onLogout={handleLogout} />
        ) : (
          <MaintenancePage maintenance={maintenance} user={user} onLogout={handleLogout} />
        )}
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <Layout
        page={page}
        setPage={setPage}
        importedFiles={importedFiles}
        user={user}
        onLogout={handleLogout}
        onUserUpdated={handleUserUpdated}
        onAccountDeleted={handleAccountDeleted}
        maintenance={maintenance}
      >
        {page === "dashboard" && <Dashboard user={user} onNavigate={setPage} />}
        {page === "spreadsheet" && (
          <ExcelEditor
            importedFiles={importedFiles}
            onFilesChanged={() => setImportedFiles(loadFiles())}
            readOnly={!canEditData(user)}
            openFileId={activeFileId}
          />
        )}
        {page === "files" && (
          <FilesPage
            files={importedFiles}
            onOpen={handleOpenFileInSpreadsheet}
            onRemove={handleRemoveFile}
            onRename={handleRenameFile}
            onImport={handleImport}
            canImport={isSuperAdmin(user)}
          />
        )}
        {page === "kategori" && <KategoriPage />}
        {page === "laporan" && <Laporan />}
        {page === "panduan" && <Panduan user={user} />}
        {isSuperAdmin(user) && page === "audit-log" && <AuditLogs user={user} />}
        {page === "import-result" && activeFile && (
          <ExcelResult
            importedData={activeFile}
            allFiles={importedFiles}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
            onRemoveFile={handleRemoveFile}
            onImportMore={() => setPage("files")}
          />
        )}
        {isSuperAdmin(user) && page === "admin-users" && <AdminUsers user={user} />}
        {isSuperAdmin(user) && page === "admin-tables" && <AdminTables />}
        {isSuperAdmin(user) && page === "admin-maintenance" && <AdminMaintenance />}
        {isSuperAdmin(user) && page === "admin-backup" && <AdminBackup />}
        {isSuperAdmin(user) && page === "admin-settings" && <AdminSettings />}
      </Layout>
    </ToastProvider>
  );
}
