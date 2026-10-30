// component tests opt into the interactive renderer; gallery boundary tests keep production locks
export async function enablePreviewInteractions(page, routes = ['settings', 'library']) {
  await page.evaluate(routes => {
    if (!window.NP?.booted) throw new Error('preview fixtures require the app to finish booting');
    for (const route of routes) {
      const host = document.querySelector('[data-app-preview="' + route + '"]');
      if (!host?._appPreview) throw new Error('missing preview component: ' + route);
      host.removeAttribute('data-preview-readonly');
      host._appPreview.render();
    }
  }, routes);
  await enablePlayerInteractions(page);
}

// component fixtures expose the menu renderer without changing the public demo boundary
export async function enablePlayerInteractions(page, selectors = ['#phPlay', '#phLyrics']) {
  await page.evaluate(selectors => {
    if (!window.NP?.booted) throw new Error('player fixtures require the app to finish booting');
    for (const selector of selectors) {
      const phone = document.querySelector(selector);
      if (!phone) throw new Error('missing player component: ' + selector);
      phone.removeAttribute('data-player-demo');
      phone.querySelectorAll('[data-player-disabled]').forEach(control => {
        control.disabled = false;
        control.removeAttribute('data-player-disabled');
      });
    }
  }, selectors);
}
