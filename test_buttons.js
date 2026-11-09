const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const playBtn = page.locator('button').filter({ hasText: /^Play$/ }).first();
    console.log('Play button count:', await playBtn.count());

    if (await playBtn.count() > 0) {
      const box = await playBtn.boundingBox();
      console.log('Play button box:', box);
      console.log('Play button disabled:', await playBtn.isDisabled());

      await playBtn.click();
      await page.waitForTimeout(1000);

      const stopBtn = page.locator('button').filter({ hasText: 'STOP' }).first();
      console.log('After Play click - STOP button visible:', await stopBtn.count() > 0);
    }

    const soundBtn = page.locator('button').filter({ hasText: /Sound/ }).first();
    console.log('Sound button count:', await soundBtn.count());
    if (await soundBtn.count() > 0) {
      console.log('Sound button disabled:', await soundBtn.isDisabled());
    }

    const skinsBtn = page.locator('button').filter({ hasText: 'Skins' }).first();
    console.log('Skins button count:', await skinsBtn.count());
  } catch (e) {
    console.error('Error:', e.message);
  }

  await browser.close();
})();