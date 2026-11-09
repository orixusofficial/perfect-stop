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

  const info = await page.evaluate(() => {
    const out = {};

    // Check React global
    out.windowReact = typeof window.React !== 'undefined' ? 'present' : 'absent';
    out.windowReactDOM = typeof window.ReactDOM !== 'undefined' ? 'present' : 'absent';

    // Check document body for React root markers
    const body = document.body;
    out.bodyChildren = Array.from(body.children).map(c => ({
      tag: c.tagName,
      id: c.id || null,
      className: c.className || '',
      childCount: c.children.length,
      reactKeys: Object.keys(c).filter(k => k.startsWith('__react')).slice(0,5),
    }));

    // Check html element
    const html = document.documentElement;
    out.htmlReactKeys = Object.keys(html).filter(k => k.startsWith('__react')).slice(0,5);
    out.htmlTheme = html.dataset.theme;

    // Check event listeners on document (approximate - check if React's delegation exists)
    // React 19 attaches to root container. Check document.documentElement and body
    for (const el of [document, document.body, document.documentElement]) {
      const key = el === document ? 'document' : el === document.body ? 'body' : 'html';
      out[`${key}_reactKeys`] = Object.keys(el).filter(k => k.startsWith('__react')).slice(0,5);
    }

    // Check for React's event system - look for __reactEvents or similar
    for (const el of [document, document.body, document.documentElement]) {
      const keys = Object.keys(el).filter(k => k.includes('react') || k.includes('React'));
      out[`${el === document ? 'document' : el === document.body ? 'body' : 'html'}_reactLikeKeys`] = keys.slice(0,10);
    }

    // Check if there's a #__next or similar
    out.nextElement = document.getElementById('__next') ? 'found' : 'not-found';
    out.bodyInnerHTML = body.innerHTML.slice(0, 200);

    return out;
  });

  console.log(JSON.stringify({ info, logs: logs.slice(0,30) }, null, 2));
  await browser.close();
})();
