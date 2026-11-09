const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const failed = [];
  const responses = [];
  page.on('requestfailed', (r) => failed.push({ url: r.url(), err: r.failure() && r.failure().errorText }));
  page.on('response', (r) => { if (r.status() >= 400) responses.push({ url: r.url(), status: r.status() }); });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const hydration = await page.evaluate(() => {
    // React root markers
    const root = document.getElementById('__next') || document.querySelector('main') || document.body;
    const keys = Object.keys(root).filter(k => k.startsWith('__react'));
    // find any react fiber on buttons
    const btn = Array.from(document.querySelectorAll('button')).find(b => /^Play$/.test((b.textContent||'').trim()));
    const btnKeys = btn ? Object.keys(btn).filter(k => k.startsWith('__react')) : [];
    return { rootReactKeys: keys, buttonReactKeys: btnKeys, hasNextData: !!document.getElementById('__NEXT_DATA__') };
  });

  // Directly dispatch a native click via JS and via mouse, count listener firing
  const clickTest = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /^Play$/.test((b.textContent||'').trim()));
    let fired = 0;
    const h = () => fired++;
    btn.addEventListener('click', h);
    btn.click();
    btn.removeEventListener('click', h);
    const panelAfterNative = !!document.querySelector('.ps-panel');
    return { fired, panelAfterNative };
  });
  await page.waitForTimeout(500);
  const afterNative = await page.evaluate(() => ({
    hasPanel: !!document.querySelector('.ps-panel'),
    hasStop: !!Array.from(document.querySelectorAll('button')).find(b => /STOP/.test(b.textContent||'')),
  }));

  console.log(JSON.stringify({ hydration, clickTest, afterNative, failed, responses, logs: logs.slice(0,40) }, null, 2));
  await browser.close();
})();
