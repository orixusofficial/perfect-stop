const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const all = [];
  page.on('response', (r) => all.push({ url: r.url(), status: r.status(), type: r.request().resourceType() }));
  page.on('requestfailed', (r) => all.push({ url: r.url(), failed: r.failure() && r.failure().errorText }));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const bad = all.filter(x => (x.status && x.status >= 400) || x.failed);
  const scripts = all.filter(x => x.type === 'script').map(x => x.url);

  const rootInfo = await page.evaluate(() => {
    const body = document.body;
    const keys = Object.keys(body).filter(k => k.startsWith('__react'));
    const nextRoot = document.querySelector('[data-reactroot], #__next, nextjs-portal');
    // Check for react event listeners on document/body via a probe click
    let clickReceived = false;
    const probe = document.createElement('div');
    probe.style.cssText='position:fixed;top:0;left:0;width:10px;height:10px;z-index:9999';
    document.body.appendChild(probe);
    const onClick = () => { clickReceived = true; };
    document.addEventListener('click', onClick, {once:true, capture:true});
    probe.click();
    document.removeEventListener('click', onClick, true);
    probe.remove();
    return {
      bodyReactKeys: keys,
      hasNextRoot: !!nextRoot,
      nextRootTag: nextRoot ? nextRoot.tagName + (nextRoot.id?'#'+nextRoot.id:'') : null,
      documentClickWorks: clickReceived,
      htmlDatasetTheme: document.documentElement.dataset.theme,
      scriptCount: document.scripts.length,
    };
  });

  console.log(JSON.stringify({ bad, scriptCount: scripts.length, scripts: scripts.slice(0,10), rootInfo }, null, 2));
  await browser.close();
})();
