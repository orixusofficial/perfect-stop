const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // Open skins screen and select pointer-2 (HTML iframe)
  await page.locator('button', { hasText: /^Skins$/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Skin 2")').first().click();
  await page.waitForTimeout(1000);

  // Inspect pointer-2 iframe
  const p2 = await page.evaluate(() => {
    const el = document.querySelector('[src*="pointer-2.svg"]');
    if (!el) return { found: false };
    const doc = el.contentDocument;
    return {
      tag: el.tagName,
      found: true,
      rect: el.getBoundingClientRect(),
      contentDoc: !!doc,
      bodyChildren: doc && doc.body ? doc.body.children.length : 0,
      bodyHTML: doc && doc.body ? doc.body.innerHTML.slice(0, 200) : null,
    };
  });
  console.log('Pointer-2 iframe:', JSON.stringify(p2, null, 2));

  // Select pointer-6 and go to playing
  await page.locator('button', { hasText: /^Play/ }).first().click();
  await page.waitForTimeout(600);
  const ind = await page.evaluate(() => {
    const els = document.querySelectorAll('section#game [src*="pointer-6.svg"]');
    return els.map(el => ({ tag: el.tagName, rect: el.getBoundingClientRect(), src: el.getAttribute('src') }));
  });
  console.log('Pointer-6 in gameplay:', JSON.stringify(ind, null, 2));

  await browser.close();
})();
