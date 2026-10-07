const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// tes

const root = path.resolve(__dirname, "..");
const logDir = path.join(root, "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// tes komen

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const children = [];
let cleaning = false;

function cleanup() {
  if (cleaning) return;
  cleaning = true;
  children.forEach(({ child, out }) => {
    try {
      if (isWin) {
        require("child_process").execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
      } else {
        child.kill();
      }
    } catch (_) { }
    try {
      out.end();
    } catch (_) { }
  });
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

const run = (name, cmd, args, cwd, logFile, opts = {}) => {
  const out = fs.createWriteStream(logFile, { flags: "a" });
  const child = spawn(cmd, args, {
    cwd,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  children.push({ child, out });
  child.on("error", (err) => {
    console.error(`[${name}] gagal dijalankan:`, err.message);
    cleanup();
  });
  child.on("exit", (code) => {
    console.log(`[${name}] berhenti (kode ${code})`);
    cleanup();
  });
  return child;
};

// Tunggu sampai server benar-benar menulis tanda siap di stdout-nya.
// Lebih deterministik daripada polling port TCP (tidak terpengaruh IPv4/IPv6,
// TIME_WAIT, atau proses lain yang sempat memakai port).
function waitServerReady(child, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Server API tidak siap dalam ${timeout}ms`));
    }, timeout);
    const onData = (buf) => {
      if (String(buf).includes("Server API berjalan")) {
        clearTimeout(timer);
        child.stdout.removeListener("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server API berhenti sebelum siap (kode ${code})`));
    });
  });
}

console.log("Menjalankan SISNERLING...");
console.log("  - Server API : http://localhost:3000");
console.log("  - Client     : http://localhost:5175");

// Pastikan port belum dipakai proses lain. Tanpa ini, server anak akan mati
// dengan EADDRINUSE dan script hanya menggantung sampai batas waktu 30 detik.
// Dicek dengan mencoba koneksi (bukan bind), supaya tetap terdeteksi walau
// proses lain hanya mendengarkan di IPv6 (::) atau IPv4 (0.0.0.0).
function probePort(port, host) {
  return new Promise((resolve) => {
    const sock = require("net").connect({ port, host });
    const done = (v) => { try { sock.destroy(); } catch (_) { } resolve(v); };
    sock.setTimeout(800);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}
async function portInUse(port) {
  const results = await Promise.all([probePort(port, "127.0.0.1"), probePort(port, "::1")]);
  return results.some(Boolean);
}

async function preflight() {
  const busy = [];
  for (const port of [3000, 5175]) {
    if (await portInUse(port)) busy.push(port);
  }
  if (busy.length) {
    console.error(`\n[startup] Port berikut sudah dipakai proses lain: ${busy.join(", ")}`);
    console.error("          Kemungkinan sesi 'npm run dev' lain masih berjalan.");
    for (const port of busy) {
      try {
        const out = require("child_process").execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
        const pids = [
          ...new Set(
            out
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => /\bLISTENING\b/.test(l))
              .map((l) => l.split(/\s+/).pop())
              .filter((x) => x && /^\d+$/.test(x) && x !== "0")
          ),
        ];
        if (pids.length) console.error(`          Port ${port} dipegang PID: ${pids.join(", ")}`);
      } catch (_) { }
    }
    console.error(`          Hentikan dulu, contoh (PowerShell):`);
    console.error(`            Get-NetTCPConnection -LocalPort ${busy[0]} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
    process.exit(1);
  }
}

preflight().then(() => {
  const server = run("server", process.execPath, ["server.js"], path.join(root, "server"), path.join(logDir, "server.log"));

  waitServerReady(server).then(() => {
    run("client", npmCmd, ["run", "dev"], path.join(root, "client"), path.join(logDir, "client.log"), {
      shell: isWin,
    });
  }).catch((err) => {
    console.error("[startup] Server tidak siap:", err.message);
    console.error("[startup] Lihat detail di", path.join(logDir, "server.log"));
    cleanup();
  });
});
