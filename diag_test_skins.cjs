const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const results = [];
  const check = (condition, label) => results.push({ label, pass: !!condition });

  const MODAL = '[data-testid="pointer-skins-modal"]';

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

  // Clean storage first
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('ps-pointer-skin'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const playBtn = page.locator('button', { hasText: /Play/ }).first();
  const psBtn = page.locator('button', { hasText: /^Skins$/ }).first();

  // 1. Home screen: Play + Skins buttons
  check(await playBtn.count() > 0, 'Play button exists on home screen');
  check(await psBtn.count() > 0, 'Skins button exists on home screen (label "Skins")');
  check(await page.locator('button', { hasText: /Pointer Skins/ }).count() === 0, 'No "Pointer Skins" label remains');
  check(await page.locator('.ps-panel').count() === 1, 'Home panel visible on home screen');
  check(await page.locator('[data-testid="pointer-skins-modal"]').count() === 0, 'No overlay modal present');

  // 2. Open Skins screen
  await psBtn.click();
  await page.waitForTimeout(500);
  check(await page.locator('.ps-panel').count() === 1, 'Exactly one panel (skins screen) shown');
  check(await page.locator('h2:text("Skins")').count() > 0 || await page.locator('h2:text("Choose Your Skin")').count() > 0, 'Skins heading present');
  check(await page.locator('button', { hasText: /^Back$/ }).count() > 0, 'Back button present at top-left');
  check(await page.locator('button', { hasText: /Close/ }).count() === 0, 'No "Close" button');
  check(await page.locator('button', { hasText: /Apply/ }).count() === 0 && await page.locator('button', { hasText: /Confirm/ }).count() === 0 && await page.locator('button', { hasText: /Select/ }).count() === 0, 'No Apply/Confirm/Select button');

  // 3. All 8 skins rendered with visible content
  const skinBtns = page.locator('button').filter({ hasText: /^Skin \d$/ });
  check(await skinBtns.count() === 8, `Exactly 8 skin buttons (found ${await skinBtns.count()})`);

  await page.waitForTimeout(800);
  const contentCheck = await page.evaluate(() => {
    const out = [];
    for (let i = 1; i <= 8; i++) {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === `Skin ${i}`);
      const el = btn ? btn.querySelector('img, iframe') : null;
      if (!el) { out.push({ i, ok: false }); continue; }
      if (el.tagName === 'IMG') out.push({ i, ok: el.naturalWidth > 0 });
      else {
        const doc = el.contentDocument;
        out.push({ i, ok: !!(doc && doc.body && doc.body.children.length > 0) });
      }
    }
    return out;
  });
  for (const c of contentCheck) check(c.ok, `Skin ${c.i} preview has visible content`);

  // Default skin = pointer-1 highlighted
  const defCls = await page.locator('button:has-text("Skin 1")').first().getAttribute('class');
  check(defCls.includes('accent-soft'), 'Skin 1 highlighted by default (no prior selection)');

  // Select skin 6 -> immediate, screen closes, returns home
  await page.locator('button:has-text("Skin 6")').first().click();
  await page.waitForTimeout(400);
  check(await page.locator('button').filter({ hasText: /^Skin \d/ }).count() === 0, 'Skins screen unmounted after selection (back to home)');
  check(await page.locator('[src*="pointer-6.svg"]').count() > 0, 'Pointer 6 shown in game indicator');
  check((await page.evaluate(() => localStorage.getItem('ps-pointer-skin'))) === 'pointer-6', 'localStorage saved pointer-6');

  // Play and check indicator in gameplay
  await playBtn.click();
  await page.waitForTimeout(700);
  check(await page.locator('button', { hasText: /STOP/ }).count() > 0, 'Game starts (STOP button appears)');
  const ind = await page.evaluate(() => {
    const el = document.querySelector('section#game [src*="pointer-6.svg"]');
    return el ? { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height } : null;
  });
  // Indicator mounts shortly after play starts; poll up to ~2s
  let indOk = ind && ind.w > 0 && ind.h > 0;
  for (let k = 0; k < 4 && !indOk; k++) {
    await page.waitForTimeout(300);
    const ind2 = await page.evaluate(() => {
      const el = document.querySelector('section#game [src*="pointer-6.svg"]');
      return el ? { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height } : null;
    });
    indOk = ind2 && ind2.w > 0 && ind2.h > 0;
  }
  check(indOk, `Pointer 6 visible during gameplay`);

  // Indicator actually moves during gameplay
  const left1 = await page.evaluate(() => { const el = document.querySelector('section#game [src*="pointer-6.svg"]'); return el ? el.getBoundingClientRect().left : null; });
  await page.waitForTimeout(500);
  const left2 = await page.evaluate(() => { const el = document.querySelector('section#game [src*="pointer-6.svg"]'); return el ? el.getBoundingClientRect().left : null; });
  check(left1 !== null && left2 !== null && Math.abs(left1 - left2) > 1, 'Pointer moves during gameplay');

  // 5. Persistence after refresh
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check(await page.locator('[src*="pointer-6.svg"]').count() > 0, 'Pointer 6 restored after refresh');
  await psBtn.click();
  await page.waitForTimeout(400);
  const s6Cls = await page.locator('button:has-text("Skin 6")').first().getAttribute('class');
  check(s6Cls.includes('accent-soft'), 'Skin 6 shows selected state after refresh');
  await page.locator('button', { hasText: /^Back$/ }).first().click();
  await page.waitForTimeout(300);
  check(await page.locator('button').filter({ hasText: /^Skin \d/ }).count() === 0, 'Back button returns to home (skins screen unmounted)');

  // 6. Test all 8 skins individually
  for (let i = 1; i <= 8; i++) {
    await psBtn.click();
    await page.waitForTimeout(200);
    await page.locator('button:has-text("Skin ' + i + '")').first().click();
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => localStorage.getItem('ps-pointer-skin'));
    const screensClosed = await page.locator('button').filter({ hasText: /^Skin \d/ }).count() === 0;
    check(saved === `pointer-${i}` && screensClosed, `Skin ${i}: selects, renders, persists`);
  }

  await page.close();

  // 7. Mobile layout
  const m = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await m.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await m.waitForTimeout(900);
  const mPs = m.locator('button', { hasText: /^Skins$/ }).first();
  check(await mPs.count() > 0, 'Mobile: Skins button exists');
  await mPs.click();
  await m.waitForTimeout(500);
  check(await m.locator('.ps-panel').count() === 1, 'Mobile: exactly one panel (skins screen)');
  check(await m.locator('button', { hasText: /^Back$/ }).count() > 0, 'Mobile: Back button present');
  check(await m.locator('button').filter({ hasText: /^Skin \d/ }).count() === 8, 'Mobile: 8 skin buttons');
  const box = await m.locator('.ps-panel').boundingBox();
  check(box && box.width <= 375 && box.height <= 812, `Mobile: panel fits viewport (${box && Math.round(box.width)}x${box && Math.round(box.height)})`);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(overflow, 'Mobile: no horizontal overflow');
  await m.locator('button:has-text("Skin 7")').first().click();
  await m.waitForTimeout(300);
  check(await m.locator('button').filter({ hasText: /^Skin \d/ }).count() === 0, 'Mobile: skins screen unmounted (back to home)');
  check(await m.locator('.ps-panel').count() === 1, 'Mobile: home panel visible after back');
  check((await m.evaluate(() => localStorage.getItem('ps-pointer-skin'))) === 'pointer-7', 'Mobile: pointer 7 selected & persisted');
  await m.close();

  let failures = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}: ${r.label}`);
    if (!r.pass) failures++;
  }
  console.log(`\n${results.length - failures}/${results.length} passed, ${failures} failure(s)`);
  if (logs.length) {
    console.log('\nConsole errors:');
    for (const l of logs) console.log('  ', l.split('\n')[0]);
  }
  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
})();
