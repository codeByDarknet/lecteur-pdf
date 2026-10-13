import { contextBridge, ipcRenderer, webFrame } from 'electron'

try {
  webFrame.setVisualZoomLevelLimits(1, 1)
} catch (err) {
  console.error('Error disabling window zoom:', err)
}

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  getPendingFiles: () => ipcRenderer.invoke('app:getPendingFiles'),
  onOpenFiles: (callback: (files: Array<{ filePath: string; fileName: string }>) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, files: Array<{ filePath: string; fileName: string }>) => callback(files)
    ipcRenderer.on('app:open-files', listener)
    return () => {
      ipcRenderer.removeListener('app:open-files', listener)
    }
  },
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
})
