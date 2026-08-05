"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("heatherDesktop", {
  status: () => ipcRenderer.invoke("desktop:status"),
  installRuntime: () => ipcRenderer.invoke("desktop:install-runtime"),
  saveNvidiaKey: (value) => ipcRenderer.invoke("desktop:save-nvidia-key", value),
  importOauth: () => ipcRenderer.invoke("desktop:import-oauth"),
  runNvidiaCheck: () => ipcRenderer.invoke("desktop:nvidia-check"),
  runYoutubeCheck: () => ipcRenderer.invoke("desktop:youtube-check"),
  restartWorker: () => ipcRenderer.invoke("desktop:restart-worker"),
  openLogs: () => ipcRenderer.invoke("desktop:open-logs"),
  onProgress: (listener) => {
    const wrapped = (_event, value) => listener(value);
    ipcRenderer.on("desktop:progress", wrapped);
    return () => ipcRenderer.removeListener("desktop:progress", wrapped);
  }
});
