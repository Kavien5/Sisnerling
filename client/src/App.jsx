import React from "react";
import Layout from "./components/Layout.jsx";
import { ToastProvider, useToast } from "./components/Toast.jsx";
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
import { AdminUsers, AdminTables, AdminMaintenance, AdminBackup, AdminSettings, MaintenancePage } from "./pages/AdminPages.jsx";
import { loadFiles, saveFile, saveFileToServer, removeFile, generateId, clearAllFiles, hydrateFiles, ensureFileLoaded } from "./excelStorage.js";
import { api } from "./api.js";
import { getToken, getUser, setAuth, clearAuth, updateStoredUser, isSuperAdmin, hasMaintenanceBypass, canEditData } from "./auth.js";

// App hanya membungkus ToastProvider. Logika aplikasi ada di AppInner supaya
// useToast() dipakai DI DALAM provider (kalau tidak, toast tidak tampil).
export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const toast = useToast();
  const [page, setPage] = React.useState("spreadsheet");
  // Dimulai kosong, lalu diisi dari server (GET /api/files). Daftar file TIDAK
  // lagi diambil dari state browser, jadi tetap ada setelah refresh / logout /
  // login ulang / restart backend.
  const [importedFiles, setImportedFiles] = React.useState([]);
  const [filesLoading, setFilesLoading] = React.useState(true);
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

  // Muat daftar file dari server. Ini sumber kebenaran tunggal untuk halaman
  // File & Import maupun Spreadsheet — keduanya membaca workbook yang sama.
  React.useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    setFilesLoading(true);
    hydrateFiles()
      .then(() => {
        if (alive) setImportedFiles(loadFiles());
      })
      .catch(() => {
        if (alive) setImportedFiles(loadFiles());
      })
      .finally(() => {
        if (alive) setFilesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user]);

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
    // Hanya cache lokal browser yang dibersihkan. File di server milik
    // workspace dan TIDAK ikut terhapus — penghapusan file tetap harus lewat
    // tombol Hapus + konfirmasi dari Super Admin.
    clearAllFiles();
    setUser(null);
    setImportedFiles([]);
    setActiveFileId(null);
    setPage("spreadsheet");
  };

  const handleImport = async (data) => {
    const entry = {
      id: generateId(),
      fileName: data.fileName,
      workbook: data.workbook,
      sheetNames: data.sheetNames,
      rawBase64: data.rawBase64 || "",
    };
    // Simpan PERMANEN ke server terlebih dahulu. Byte asli .xlsx ditulis ke
    // disk server dan metadata sheet-nya ke MySQL, sehingga file tetap ada
    // setelah refresh, pindah halaman, logout/login, dan restart backend.
    // Import dianggap gagal bila penyimpanan server gagal — supaya user
    // tidak melihat file "berhasil" yang sebenarnya hilang saat refresh.
    try {
      const saved = await saveFileToServer(entry);
      setImportedFiles(loadFiles());
      setActiveFileId(saved.id);
      setPage("import-result");
      return saved;
    } catch (err) {
      const msg =
        err && err.message
          ? err.message
          : "File gagal disimpan ke server. File TIDAK tersimpan permanen.";
      toast(
        `File "${data.fileName}" gagal disimpan permanen: ${msg}`,
        "error"
      );
      return null;
    }
  };

  // Hapus file. File di server HANYA dihapus di sini karena pengguna menekan
  // tombol Hapus lalu mengonfirmasi di UI (dan route server mewajibkan
  // Super Admin). Tidak ada penghapusan otomatis saat refresh/logout/restart.
  const handleRemoveFile = async (fileId) => {
    try {
      await removeFile(fileId);
    } catch (err) {
      toast(
        `Gagal menghapus file: ${err && err.message ? err.message : "terjadi kesalahan"}`,
        "error"
      );
      return;
    }
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

  const handleRenameFile = async (fileId, namaBaru) => {
    const entry = importedFiles.find((f) => f.id === fileId);
    if (!entry) return;
    const trimmed = String(namaBaru || "").trim();
    if (!trimmed) return;
    // Rename menyentuh metadata di server; kode workbook (WB_xxx) sengaja
    // tidak berubah sehingga relasi Sheet/Formula/Penugasan tetap utuh.
    try {
      if (entry.workbookCode) await api.renameFile(entry.workbookCode, { fileName: trimmed });
    } catch (err) {
      toast(
        `Gagal mengganti nama file: ${err && err.message ? err.message : "terjadi kesalahan"}`,
        "error"
      );
      return;
    }
    saveFile({ id: entry.id, fileName: trimmed, workbook: entry.workbook, rawBase64: entry.rawBase64 });
    setImportedFiles(loadFiles());
  };

  // Pastikan byte asli file ada di memori sebelum dibuka. Kalau file berasal
  // dari server (mis. di-import di browser lain / setelah restart backend),
  // bytes-nya diunduh dari storage server lalu workbook ASLI dibangun dari
  // file itu — bukan dari salinan terpisah.
  const ensureFileReady = async (fileId) => {
    const existing = importedFiles.find((f) => f.id === fileId);
    if (existing && existing.workbook) return true;
    const loaded = await ensureFileLoaded(fileId);
    if (loaded) {
      setImportedFiles(loadFiles());
      return true;
    }
    toast("File tidak dapat dimuat dari server", "error");
    return false;
  };

  const handleSelectFile = async (fileId) => {
    // Jangan pindah halaman kalau byte aslinya gagal dimuat — Spreadsheet
    // hanya boleh menampilkan workbook yang benar-benar ada di server.
    if (!(await ensureFileReady(fileId))) return;
    setActiveFileId(fileId);
    setPage("import-result");
  };

  const handleOpenFileInSpreadsheet = async (fileId) => {
    if (!(await ensureFileReady(fileId))) return;
    setActiveFileId(fileId);
    setPage("spreadsheet");
  };

  const activeFile = importedFiles.find((f) => f.id === activeFileId) || null;

  // Tampilkan layar login/register selama belum selesai validasi sesi.
  if (!authReady) {
    return (
      <div className="auth-page">
        <div className="auth-loading">Memuat...</div>
      </div>
    );
  }

  if (!user) {
    return authMode === "register" ? (
      <Register onRegister={handleRegister} onSwitchToLogin={() => setAuthMode("login")} />
    ) : (
      <Login onLogin={handleLogin} onSwitchToRegister={() => setAuthMode("register")} />
    );
  }

  // Saat maintenance aktif, User & Admin hanya melihat halaman maintenance.
  if (maintenanceBlocking) {
    return <MaintenancePage maintenance={maintenance} onLogout={handleLogout} />;
  }

  return (
    <Layout
      page={page}
        setPage={setPage}
        importedFiles={importedFiles}
        user={user}
        onLogout={handleLogout}
        onUserUpdated={handleUserUpdated}
        onAccountDeleted={handleAccountDeleted}
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
            loadingFiles={filesLoading}
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
  );
}
