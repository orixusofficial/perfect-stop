const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /^Play$/.test((b.textContent||'').trim()));
    const out = { found: !!btn, reactKeys: [], listeners: {} };
    if (!btn) return out;
    out.reactKeys = Object.keys(btn).filter(k => k.startsWith('__react'));
    // inspect react props for onClick
    const propsKey = Object.keys(btn).find(k => k.startsWith('__reactProps'));
    if (propsKey) {
      const props = btn[propsKey];
      out.hasOnClick = typeof props.onClick === 'function';
      out.propKeys = Object.keys(props).slice(0,20);
    } else {
      out.hasOnClick = 'no-props-key';
    }

    // event propagation capture
    const events = [];
    const onCaptureDoc = (e) => events.push('doc-capture:' + e.type + ' target=' + (e.target && e.target.tagName));
    const onBubbleDoc = (e) => events.push('doc-bubble:' + e.type);
    const onBtn = (e) => events.push('btn:' + e.type + ' defaultPrevented=' + e.defaultPrevented);
    document.addEventListener('pointerdown', onCaptureDoc, true);
    document.addEventListener('click', onCaptureDoc, true);
    document.addEventListener('click', onBubbleDoc, false);
    btn.addEventListener('pointerdown', onBtn);
    btn.addEventListener('click', onBtn);
    btn.click();
    document.removeEventListener('pointerdown', onCaptureDoc, true);
    document.removeEventListener('click', onCaptureDoc, true);
    document.removeEventListener('click', onBubbleDoc, false);
    btn.removeEventListener('pointerdown', onBtn);
    btn.removeEventListener('click', onBtn);
    out.events = events;
    return out;
  });

  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    hasPanel: !!document.querySelector('.ps-panel'),
    hasStop: !!Array.from(document.querySelectorAll('button')).find(b => /STOP/.test(b.textContent||'')),
    hasAnnouncement: !!document.querySelector('.ps-announcement'),
  }));

  console.log(JSON.stringify({ result, after, logs: logs.slice(0,30) }, null, 2));
  await browser.close();
})();
