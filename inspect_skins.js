const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  
  console.log('=== HOME SCREEN ===');
  const buttons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map(b => ({ text: b.textContent.trim(), cls: b.className, rect: b.getBoundingClientRect() }));
  });
  console.log(JSON.stringify(buttons, null, 2));
  
  await page.screenshot({ path: 'D:\\perfect_stop\\screenshot_home.png', fullPage: true });
  
  // Click Skins
  await page.click('button:has-text("Skins")');
  await page.waitForTimeout(1500);
  
  const skinsInfo = await page.evaluate(() => {
    const panel = document.querySelector('.ps-panel');
    const buttons = Array.from(document.querySelectorAll('button'));
    const panelRect = panel ? panel.getBoundingClientRect() : null;
    const btns = buttons.map(b => ({ text: b.textContent.trim(), cls: b.className, rect: b.getBoundingClientRect() }));
    return { panel: panelRect, buttons: btns };
  });
  console.log('=== SKINS SCREEN ===');
  console.log('Panel:', JSON.stringify(skinsInfo.panel));
  console.log('Buttons:', JSON.stringify(skinsInfo.buttons, null, 2));
  
  await page.screenshot({ path: 'D:\\perfect_stop\\screenshot_skins.png', fullPage: true });
  
  await browser.close();
})();