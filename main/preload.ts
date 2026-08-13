const { contextBridge, ipcRenderer } = require('electron');

/**
 * Desktop bridge only (P0.6 Phase B1). Privileged business ops use HTTP + JWT/RBAC.
 * Restore accepts optional managed backup fileName — never absolute filesystem paths.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  backupDatabase: (pin?: string) => ipcRenderer.invoke('backup-database', pin),
  restoreBackup: (pin?: string, fileName?: string) => ipcRenderer.invoke('restore-backup', pin, fileName),
  getMasterPinStatus: () => ipcRenderer.invoke('master-pin-status'),

  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getStatus: () => ipcRenderer.invoke('get-status'),

  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  /** Owner/manager JWT required — never Master PIN. Status/check stay unauthenticated. */
  restartAndInstall: (token: string) => ipcRenderer.invoke('restart-and-install', token),
  onUpdateStatus: (callback: (status: any) => void) => {
    const handler = (_event: any, status: any) => callback(status);
    ipcRenderer.on('update-status', handler);
    return () => { ipcRenderer.removeListener('update-status', handler); };
  },

  onMenuAction: (callback: (channel: string) => void) => {
    const channels = [
      'new-order', 'quick-search', 'backup-database', 'restore-backup',
      'view-orders', 'report-daily', 'report-sales', 'report-x', 'report-z',
      'settings-business', 'settings-tax', 'settings-printer', 'settings-kitchen',
      'menu-db-health-check', 'menu-db-initialize', 'menu-master-pin',
    ];
    const handlers: (() => void)[] = [];
    channels.forEach((channel) => {
      const handler = () => callback(channel);
      ipcRenderer.on(channel, handler);
      handlers.push(() => ipcRenderer.removeListener(channel, handler));
    });
    return () => { handlers.forEach((remove) => remove()); };
  },

  platform: process.platform,
});
