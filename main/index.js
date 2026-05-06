const { app, BrowserWindow } = require('electron');
const path = require('path');

require('./ipc');

const isDev    = !app.isPackaged;
const iconPath = path.join(__dirname, '../build/icon-512.png');

function createWindow() {
  const win = new BrowserWindow({
    width:     1280,
    height:    800,
    minWidth:  900,
    minHeight: 600,
    // Icon alleen in dev — productie gebruikt de app bundle icns
    ...(isDev && process.platform !== 'darwin' ? { icon: iconPath } : {}),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Dock icon alleen in dev — in productie regelt de app bundle dit
  if (isDev && process.platform === 'darwin') {
    try { app.dock.setIcon(iconPath); } catch (_) {}
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
