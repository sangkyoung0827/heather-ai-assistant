"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PRODUCT_VERSION = "0.5.0";
const WORKER_PORT = 8787;
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
const DEFAULT_WEB_URL = process.env.HEATHER_WEB_URL || "https://heather-ai-assistant-4y9qpq7v5.vercel.app/dashboard";
const WEB_FALLBACKS = [
  DEFAULT_WEB_URL,
  "https://heather-ai-assistant-web.vercel.app/dashboard",
  "https://heather-ai-assistant.vercel.app/dashboard"
];

let mainWindow = null;
let settingsWindow = null;
let workerProcess = null;
let workerLogStream = null;
let currentWebIndex = 0;

function appRoot() { return app.getPath("userData"); }
function workerInstallRoot() { return path.join(appRoot(), "runtime"); }
function workerDir() { return path.join(workerInstallRoot(), "heather-youtube-auto-editor"); }
function venvBin() { return path.join(workerDir(), ".venv", "bin"); }
function workerExecutable() { return path.join(venvBin(), "yt-auto-editor"); }
function configPath() { return path.join(workerDir(), "config.yaml"); }
function oauthPath() { return path.join(workerDir(), "secrets", "client_secret.json"); }
function tokenPath() { return path.join(workerDir(), "secrets", "youtube_token.json"); }
function encryptedKeyPath() { return path.join(appRoot(), "secrets", "nvidia-api-key.bin"); }
function logPath() { return path.join(appRoot(), "logs", "youtube-worker.log"); }

function bundledWorkerDir() {
  const packaged = path.join(process.resourcesPath, "youtube-auto-editor");
  if (fs.existsSync(packaged)) return packaged;
  return path.resolve(__dirname, "..", "..", "services", "youtube-auto-editor");
}

function runtimePath() {
  return [...new Set([venvBin(), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])]
    .filter(Boolean)
    .join(":");
}

function originFor(value) {
  try { return new URL(value).origin; }
  catch { return "https://heather-ai-assistant-4y9qpq7v5.vercel.app"; }
}

function workerEnvironment() {
  const origins = [...new Set(WEB_FALLBACKS.map(originFor))].join(",");
  return {
    ...process.env,
    PATH: runtimePath(),
    PYTHONUNBUFFERED: "1",
    NVIDIA_API_KEY: readNvidiaKey() || "",
    YT_AUTO_EDITOR_CONFIG: configPath(),
    YT_AUTO_EDITOR_HOST: "127.0.0.1",
    YT_AUTO_EDITOR_PORT: String(WORKER_PORT),
    YOUTUBE_CLIENT_SECRET: oauthPath(),
    YOUTUBE_TOKEN_FILE: tokenPath(),
    HEATHER_ORIGINS: origins
  };
}

function sendProgress(message) {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send("desktop:progress", String(message));
}

function ensureDirectory(target) { fs.mkdirSync(target, { recursive: true }); }
function appendLog(line) {
  ensureDirectory(path.dirname(logPath()));
  fs.appendFileSync(logPath(), `${new Date().toISOString()} ${line}\n`, "utf8");
}

function shellCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/zsh", ["-lc", command], {
      cwd: options.cwd || appRoot(),
      env: options.env || { ...process.env, PATH: runtimePath() }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString(); stdout += text;
      text.trim().split(/\r?\n/).filter(Boolean).forEach(sendProgress);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString(); stderr += text;
      text.trim().split(/\r?\n/).filter(Boolean).forEach(sendProgress);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `Command failed with exit code ${code}`));
    });
  });
}

async function commandPath(command) {
  try { return (await shellCommand(`command -v ${command}`)).stdout.trim(); }
  catch { return ""; }
}

function saveNvidiaKey(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned.startsWith("nvapi-")) throw new Error("NVIDIA API 키는 nvapi-로 시작해야 합니다.");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("macOS Keychain 암호화를 사용할 수 없습니다.");
  ensureDirectory(path.dirname(encryptedKeyPath()));
  fs.writeFileSync(encryptedKeyPath(), safeStorage.encryptString(cleaned), { mode: 0o600 });
}

function readNvidiaKey() {
  try {
    if (!fs.existsSync(encryptedKeyPath()) || !safeStorage.isEncryptionAvailable()) return "";
    return safeStorage.decryptString(fs.readFileSync(encryptedKeyPath()));
  } catch (error) {
    appendLog(`NVIDIA key read failed: ${error.message}`);
    return "";
  }
}

function validateOauthJson(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const installed = payload && payload.installed;
  if (!installed || !installed.client_id || !installed.auth_uri || !installed.token_uri) {
    throw new Error("Google OAuth 데스크톱 앱 JSON 형식이 아닙니다.");
  }
  const redirects = Array.isArray(installed.redirect_uris) ? installed.redirect_uris : [];
  if (!redirects.some((item) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(item))) {
    throw new Error("OAuth JSON에 localhost 또는 127.0.0.1 리디렉션이 없습니다.");
  }
  return { projectId: installed.project_id || "", clientId: installed.client_id };
}

async function importOauth() {
  const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
    title: "Google OAuth 데스크톱 앱 JSON 선택",
    properties: ["openFile"],
    filters: [{ name: "Google OAuth JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const source = result.filePaths[0];
  const meta = validateOauthJson(source);
  ensureDirectory(path.dirname(oauthPath()));
  fs.copyFileSync(source, oauthPath());
  fs.chmodSync(oauthPath(), 0o600);
  if (fs.existsSync(tokenPath())) fs.unlinkSync(tokenPath());
  return { canceled: false, ...meta };
}

function httpJson(url, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if ((response.statusCode || 500) >= 400) return reject(new Error(`HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON response")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Request timeout")));
    request.on("error", reject);
  });
}

async function workerHealth() {
  try { return await httpJson(`${WORKER_URL}/health`); }
  catch { return null; }
}

async function runtimeStatus() {
  const [python, ffmpeg, ffprobe] = await Promise.all([commandPath("python3"), commandPath("ffmpeg"), commandPath("ffprobe")]);
  const health = await workerHealth();
  let oauthProject = "";
  if (fs.existsSync(oauthPath())) {
    try { oauthProject = validateOauthJson(oauthPath()).projectId; }
    catch { oauthProject = "invalid"; }
  }
  return {
    appVersion: PRODUCT_VERSION,
    python,
    ffmpeg,
    ffprobe,
    workerInstalled: fs.existsSync(workerExecutable()),
    workerRunning: Boolean(health && health.status === "ok"),
    workerHealth: health,
    nvidiaConfigured: Boolean(readNvidiaKey()),
    oauthConfigured: fs.existsSync(oauthPath()) && oauthProject !== "invalid",
    youtubeAuthorized: fs.existsSync(tokenPath()),
    oauthProject,
    workerUrl: WORKER_URL,
    logPath: logPath()
  };
}

async function installRuntime() {
  sendProgress("로컬 영상 처리 구성 요소를 확인합니다.");
  let python = await commandPath("python3");
  let ffmpeg = await commandPath("ffmpeg");
  const brew = await commandPath("brew");
  if ((!python || !ffmpeg) && !brew) throw new Error("Python 3 또는 FFmpeg가 없고 Homebrew도 없습니다. 먼저 Homebrew를 설치해야 합니다.");
  if (!python) { sendProgress("Homebrew로 Python 3을 설치합니다."); await shellCommand("brew install python"); python = await commandPath("python3"); }
  if (!ffmpeg) { sendProgress("Homebrew로 FFmpeg를 설치합니다."); await shellCommand("brew install ffmpeg"); ffmpeg = await commandPath("ffmpeg"); }
  if (!python || !ffmpeg) throw new Error("Python 3 또는 FFmpeg 설치를 확인하지 못했습니다.");

  ensureDirectory(workerInstallRoot());
  const installer = path.join(bundledWorkerDir(), "install.py");
  if (!fs.existsSync(installer)) throw new Error(`Worker installer not found: ${installer}`);
  sendProgress("Heather 영상 워커를 Application Support에 설치합니다.");
  await shellCommand(`"${python}" "${installer}" --output "${workerInstallRoot()}"`);
  if (!fs.existsSync(configPath())) fs.copyFileSync(path.join(workerDir(), "config.example.yaml"), configPath());
  if (!fs.existsSync(path.join(workerDir(), ".venv", "bin", "python"))) {
    sendProgress("전용 Python 가상환경을 만듭니다.");
    await shellCommand(`"${python}" -m venv .venv`, { cwd: workerDir() });
  }
  sendProgress("Whisper·Google API·영상 처리 라이브러리를 설치합니다.");
  await shellCommand(`"${path.join(venvBin(), "python")}" -m pip install --upgrade pip && "${path.join(venvBin(), "python")}" -m pip install -e '.[all]'`, {
    cwd: workerDir(), env: workerEnvironment()
  });
  sendProgress("로컬 구성 요소 설치가 완료됐습니다.");
  await restartWorker();
  return runtimeStatus();
}

function stopWorker() {
  if (workerProcess && !workerProcess.killed) workerProcess.kill("SIGTERM");
  workerProcess = null;
  if (workerLogStream) { workerLogStream.end(); workerLogStream = null; }
}

async function waitForWorker() {
  for (let index = 0; index < 40; index += 1) {
    const health = await workerHealth();
    if (health && health.status === "ok") return health;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("로컬 영상 워커가 시작되지 않았습니다. 로그를 확인하세요.");
}

async function startWorker() {
  if (!fs.existsSync(workerExecutable())) return null;
  if (await workerHealth()) return workerHealth();
  ensureDirectory(path.dirname(logPath()));
  workerLogStream = fs.createWriteStream(logPath(), { flags: "a" });
  workerProcess = spawn(workerExecutable(), ["serve", "--host", "127.0.0.1", "--port", String(WORKER_PORT)], {
    cwd: workerDir(), env: workerEnvironment(), stdio: ["ignore", "pipe", "pipe"]
  });
  workerProcess.stdout.pipe(workerLogStream, { end: false });
  workerProcess.stderr.pipe(workerLogStream, { end: false });
  workerProcess.on("exit", (code, signal) => { appendLog(`worker exited code=${code} signal=${signal}`); workerProcess = null; });
  return waitForWorker();
}

async function restartWorker() { stopWorker(); return startWorker(); }

async function runWorkerCli(args) {
  if (!fs.existsSync(workerExecutable())) throw new Error("먼저 로컬 구성 요소를 설치하세요.");
  const quoted = args.map((item) => `"${String(item).replaceAll('"', '\\"')}"`).join(" ");
  const result = await shellCommand(`"${workerExecutable()}" ${quoted}`, { cwd: workerDir(), env: workerEnvironment() });
  return `${result.stdout}${result.stderr}`.trim();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 680,
    title: "Heather", backgroundColor: "#090b12", show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(`localStorage.setItem("heather.youtubeEditor.workerUrl", "${WORKER_URL}")`).catch(() => {});
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    appendLog(`web load failed ${code} ${description} ${url}`);
    currentWebIndex += 1;
    if (currentWebIndex < WEB_FALLBACKS.length) mainWindow.loadURL(WEB_FALLBACKS[currentWebIndex]);
  });
  mainWindow.loadURL(WEB_FALLBACKS[currentWebIndex]);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 820, height: 760, minWidth: 700, minHeight: 620,
    title: "Heather 로컬 설정", backgroundColor: "#090b12", parent: mainWindow || undefined,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => { settingsWindow = null; });
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Heather", submenu: [
      { label: "Heather 정보", role: "about" }, { type: "separator" },
      { label: "로컬 설정…", accelerator: "CommandOrControl+,", click: createSettingsWindow },
      { label: "영상 워커 다시 시작", click: () => restartWorker().catch((error) => dialog.showErrorBox("Worker error", error.message)) },
      { label: "영상 워커 로그 열기", click: () => { ensureDirectory(path.dirname(logPath())); if (!fs.existsSync(logPath())) fs.writeFileSync(logPath(), ""); shell.openPath(logPath()); } },
      { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }
    ] },
    { label: "편집", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "보기", submenu: [{ role: "reload" }, { role: "togglefullscreen" }] },
    { label: "도움말", submenu: [{ label: "GitHub 저장소", click: () => shell.openExternal("https://github.com/sangkyoung0827/heather-ai-assistant") }] }
  ]));
}

ipcMain.handle("desktop:status", runtimeStatus);
ipcMain.handle("desktop:install-runtime", installRuntime);
ipcMain.handle("desktop:save-nvidia-key", async (_event, value) => { saveNvidiaKey(value); await restartWorker(); return runtimeStatus(); });
ipcMain.handle("desktop:import-oauth", async () => { const result = await importOauth(); await restartWorker(); return { result, status: await runtimeStatus() }; });
ipcMain.handle("desktop:nvidia-check", async () => ({ output: await runWorkerCli(["nvidia-check"]), status: await runtimeStatus() }));
ipcMain.handle("desktop:youtube-check", async () => ({ output: await runWorkerCli(["youtube-check"]), status: await runtimeStatus() }));
ipcMain.handle("desktop:restart-worker", async () => ({ health: await restartWorker(), status: await runtimeStatus() }));
ipcMain.handle("desktop:open-logs", async () => { ensureDirectory(path.dirname(logPath())); if (!fs.existsSync(logPath())) fs.writeFileSync(logPath(), ""); await shell.openPath(logPath()); return true; });

app.whenReady().then(async () => {
  app.setName("Heather");
  installMenu();
  createMainWindow();
  try { await startWorker(); } catch (error) { appendLog(`startup worker error: ${error.message}`); }
  const status = await runtimeStatus();
  if (!status.workerInstalled || !status.nvidiaConfigured || !status.oauthConfigured) createSettingsWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});

app.on("before-quit", stopWorker);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
