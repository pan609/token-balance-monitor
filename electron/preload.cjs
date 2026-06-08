const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("balancePet", {
  getBalances: () => ipcRenderer.invoke("balances:get"),
  setPrimaryProvider: (providerId) =>
    ipcRenderer.invoke("balances:set-primary-provider", providerId),
  collapse: (collapsed) => ipcRenderer.invoke("window:collapse", collapsed),
  pin: (pinned) => ipcRenderer.invoke("window:pin", pinned),
  openDashboard: () => ipcRenderer.invoke("window:open-dashboard"),
  hide: () => ipcRenderer.invoke("window:hide"),
  onBalancesUpdated: (callback) => {
    ipcRenderer.on("balances:data", (_event, data) => callback(data));
  },
  onBalanceError: (callback) => {
    ipcRenderer.on("balances:error", (_event, message) => callback(message));
  },
  onRefreshRequested: (callback) => {
    ipcRenderer.on("balances:refresh", () => callback());
  },
  setSummary: (summary) => ipcRenderer.send("balances:summary", summary),
  quit: () => ipcRenderer.invoke("window:quit")
});
