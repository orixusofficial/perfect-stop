const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const report = {};

  const screenState = async () => page.evaluate(() => {
    const panel = document.querySelector('.ps-panel');
    const stop = Array.from(document.querySelectorAll('button')).find(b => /STOP/.test(b.textContent||''));
    const play = Array.from(document.querySelectorAll('button')).find(b => /^Play$/.test((b.textContent||'').trim()));
    return {
      hasPanel: !!panel,
      panelText: panel ? (panel.textContent||'').slice(0,60) : null,
      hasStop: !!stop,
      hasPlay: !!play,
    };
  });

  report.initial = await screenState();

  // Click Play
  const playBtn = page.getByRole('button', { name: /^Play$/ });
  try {
    await playBtn.click({ timeout: 3000 });
    report.playClick = 'clicked';
  } catch (e) {
    report.playClick = 'FAILED: ' + e.message.split('\n')[0];
  }
  await page.waitForTimeout(600);
  report.afterPlay = await screenState();

  // If playing, try clicking STOP
  if (report.afterPlay.hasStop) {
    const stopBtn = page.getByRole('button', { name: /STOP/ });
    try { await stopBtn.click({ timeout: 3000 }); report.stopClick = 'clicked'; }
    catch (e) { report.stopClick = 'FAILED: ' + e.message.split('\n')[0]; }
    await page.waitForTimeout(1200);
    report.afterStop = await screenState();
  }

  // Sound toggle test from current screen
  const soundBefore = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label*="ute"]');
    return b ? b.getAttribute('aria-label') : null;
  });
  try {
    const s = page.locator('button[aria-label*="ute"]');
    await s.click({ timeout: 3000 });
    report.soundClick = 'clicked';
  } catch (e) {
    report.soundClick = 'FAILED: ' + e.message.split('\n')[0];
  }
  await page.waitForTimeout(300);
  const soundAfter = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label*="ute"]');
    return b ? b.getAttribute('aria-label') : null;
  });
  report.sound = { before: soundBefore, after: soundAfter };

  // Game-over buttons if panel is over screen
  report.overButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.ps-panel button')).map(b => ({
      text: (b.textContent||'').trim(),
      disabled: b.disabled,
      rect: (() => { const r=b.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })(),
      pe: getComputedStyle(b).pointerEvents,
    }));
  });

  console.log(JSON.stringify({ report, errors }, null, 2));
  await browser.close();
})();
