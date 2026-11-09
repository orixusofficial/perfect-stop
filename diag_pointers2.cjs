const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // Open skins, select pointer-2 (HTML iframe via srcDoc)
  await page.locator('button', { hasText: /^Skins$/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Skin 2")').first().click();
  await page.waitForTimeout(1200);

  const p2 = await page.evaluate(() => {
    const el = document.querySelector('[src*="pointer-2.svg"]') || document.querySelector('iframe[title="Pointer 2"]');
    if (!el) return { found: false };
    const doc = el.contentDocument;
    return {
      tag: el.tagName,
      hasSrc: !!el.getAttribute('src'),
      hasSrcDoc: el.getAttribute('srcdoc') ? 'yes(short)' : 'no',
      contentDoc: !!doc,
      body: doc ? (!!doc.body) : false,
      bodyChildren: doc && doc.body ? doc.body.children.length : 0,
      rect: el.getBoundingClientRect(),
    };
  });
  console.log('Pointer-2 (HTML, srcDoc):', JSON.stringify(p2, null, 2));

  // Now test pointer-6 (SVG img) through gameplay
  await page.locator('button', { hasText: /^Play/ }).first().click();
  await page.waitForTimeout(700);
  const ind = await page.evaluate(() => {
    const all = document.querySelectorAll('section#game [src*="pointer-6.svg"], section#game iframe[src*="pointer-6.svg"]');
    return all.map(el => ({ tag: el.tagName, src: el.getAttribute('src'), hasSrcDoc: !!el.getAttribute('srcdoc'), rect: el.getBoundingClientRect() }));
  });
  console.log('Pointer-6 elements in gameplay:', JSON.stringify(ind, null, 2));

  await browser.close();
})();
