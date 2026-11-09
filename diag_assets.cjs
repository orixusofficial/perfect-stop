const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('button', { hasText: /Pointer Skins/ }).first().click();
  await page.waitForTimeout(1500);
  const imgs = await page.evaluate(() => {
    const modal = document.querySelector('[data-testid="pointer-skins-modal"]');
    return Array.from(modal.querySelectorAll('img')).map((i) => ({
      src: i.getAttribute('src'),
      naturalWidth: i.naturalWidth,
      naturalHeight: i.naturalHeight,
      complete: i.complete,
    }));
  });
  console.log('HTTP >=400:');
  for (const b of bad) console.log('  ', b);
  console.log('Image load status:');
  for (const i of imgs) console.log('  ', i.src, '->', i.naturalWidth + 'x' + i.naturalHeight, i.complete ? '(complete)' : '(incomplete)');
  await browser.close();
})();
