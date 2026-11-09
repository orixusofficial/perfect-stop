const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // Select skin 6 then Play
  await page.locator('button', { hasText: /^Skins$/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Skin 6")').first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: /Play/ }).first().click();
  await page.waitForTimeout(800);

  const info = await page.evaluate(() => {
    const section = document.querySelector('section#game');
    const allMedia = Array.from(section.querySelectorAll('img, iframe'));
    return {
      screen: document.documentElement.dataset.theme,
      sectionFound: !!section,
      allMedia: allMedia.map(el => ({ tag: el.tagName, src: el.getAttribute('src'), srcdoc: !!el.getAttribute('srcdoc'), rect: el.getBoundingClientRect() })),
      pointer6Direct: document.querySelector('section#game img[src*="pointer-6.svg"]') ? 'found-img' : 'not-found-img',
      pointer6Iframe: document.querySelector('section#game iframe[src*="pointer-6.svg"]') ? 'found-iframe' : 'not-found-iframe',
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
})();
