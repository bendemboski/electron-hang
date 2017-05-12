const { assert } = require('chai');
const { BrowserWindow } = require('electron');

function openWindow(url, options) {
  let win = new BrowserWindow(options);

  win.loadURL(url);

  return win;
}

describe('Window', function() {
  afterEach(function() {
    BrowserWindow.getAllWindows().forEach((win) => win.close());
  });

  describe('#open', function() {
    let i = 0;
    while (i < 10) {
      i++;
      it(`works #${i}`, function() {
        let win = openWindow('serve://dist', {
          webSecurity: false,
          allowRunningInsecureContent: false
        });
        let windows = BrowserWindow.getAllWindows();
        assert.equal(windows.length, 1);
        assert.equal(windows[0], win);
      });
    }
  });
});
