import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

interface OpenedFile {
  filePath: string
  fileName: string
}

// Fichiers reçus avant que l'interface ne soit prête à les afficher
let pendingFiles: OpenedFile[] = []
// Passe à true quand l'interface a récupéré les fichiers en attente
let rendererReady = false

const isPdfPath = (filePath: string) => filePath.toLowerCase().endsWith('.pdf')

// Extrait les PDF passés en argument (« Ouvrir avec », double-clic, ligne de commande)
function pdfFilesFromArgv(argv: string[], workingDirectory = process.cwd()): OpenedFile[] {
  const args = argv.slice(app.isPackaged ? 1 : 2)
  const files: OpenedFile[] = []
  for (const arg of args) {
    if (arg.startsWith('-')) continue
    const filePath = path.resolve(workingDirectory, arg.startsWith('file://') ? fileURLToPath(arg) : arg)
    if (isPdfPath(filePath) && fs.existsSync(filePath)) {
      files.push({ filePath, fileName: path.basename(filePath) })
    }
  }
  return files
}

function sendFilesToRenderer(files: OpenedFile[]) {
  if (files.length === 0) return
  if (win && rendererReady) {
    win.webContents.send('app:open-files', files)
  } else {
    pendingFiles.push(...files)
  }
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  if (!win) return []
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths.map((filePath) => ({
    filePath,
    fileName: path.basename(filePath),
  }))
})

ipcMain.handle('file:read', async (_event, filePath: string) => {
  if (typeof filePath !== 'string' || !isPdfPath(filePath)) {
    console.error('Refused to read non-PDF file:', filePath)
    return null
  }
  try {
    const buffer = await fs.promises.readFile(filePath)
    // Return Uint8Array for reliable IPC serialization
    return new Uint8Array(buffer)
  } catch (err) {
    console.error('Failed to read file:', err)
    return null
  }
})

ipcMain.handle('app:getPendingFiles', () => {
  rendererReady = true
  const files = pendingFiles
  pendingFiles = []
  return files
})

ipcMain.handle('window:minimize', () => {
  win?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
})

ipcMain.handle('window:close', () => {
  win?.close()
})

ipcMain.handle('window:isMaximized', () => {
  return win?.isMaximized() ?? false
})

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    icon: path.join(process.env.APP_ROOT, 'build', 'icon.png'),
  })

  win.webContents.on('did-start-loading', () => {
    rendererReady = false
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Une seule instance : un double-clic sur un autre PDF l'ouvre dans la fenêtre existante
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  pendingFiles = pdfFilesFromArgv(process.argv)

  app.on('second-instance', (_event, argv, workingDirectory) => {
    sendFilesToRenderer(pdfFilesFromArgv(argv, workingDirectory))
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
      win = null
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.whenReady().then(createWindow)
}
