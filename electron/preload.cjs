const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edith", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (partial) => ipcRenderer.invoke("config:set", partial),
  ask: (text) => ipcRenderer.invoke("ask", text),
  transcribe: (wav) => ipcRenderer.invoke("stt", wav),
  synthesize: (text, voice) => ipcRenderer.invoke("tts", text, voice),
  clearMemory: () => ipcRenderer.invoke("memory:clear"),
  hide: () => ipcRenderer.send("window:hide"),
  getWindowPos: () => ipcRenderer.invoke("window:get-pos"),
  setWindowPos: (x, y) => ipcRenderer.send("window:set-pos", x, y),
  saveWindowPos: () => ipcRenderer.send("window:save-pos"),
  onHotkey: (cb) => listen("hotkey", () => cb()),
  onStatus: (cb) => listen("status", (_e, text) => cb(text)),
  onAnnounce: (cb) => listen("announce", (_e, text) => cb(text)),
  onConfirm: (cb) => listen("confirm:request", (_e, req) => cb(req)),
  answerConfirm: (id, ok) => ipcRenderer.send("confirm:response", { id, ok }),
});

function listen(channel, handler) {
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
