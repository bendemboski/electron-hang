const { app, BrowserWindow } = require('electron');

let windowCount = parseInt(process.argv[2]) || 20;

app.on('ready', () => {
  let i = 0;
  while (i++ < windowCount) {
    console.log(`opening window ${i}`)
    let win = new BrowserWindow();
    win.loadURL('file:index.html');
    console.log(`closing window ${i}`)
    win.close();
  }

  app.quit();
});
