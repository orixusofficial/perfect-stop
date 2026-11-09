const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const diag = await page.evaluate(() => {
    const findByText = (re) => {
      const els = Array.from(document.querySelectorAll('button'));
      return els.find((el) => re.test((el.textContent || '').trim()));
    };
    const info = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const describe = (node) => {
        if (!node) return null;
        let path = [];
        let n = node;
        while (n && n !== document.body) {
          const id = n.id ? `#${n.id}` : '';
          const cls = n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '';
          path.unshift(n.tagName.toLowerCase() + id + cls);
          n = n.parentElement;
        }
        return path.join(' > ');
      };
      let stack = [];
      if (top) {
        stack.push(describe(top));
        // walk up to see what contains point at various z
        let n = top;
        while (n && n !== document.body) { n = n.parentElement; }
      }
      return {
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        disabled: el.disabled,
        pointerEvents: getComputedStyle(el).pointerEvents,
        elementAtCenter: describe(top),
        elementIsButtonOrChild: !!(top && (top === el || el.contains(top))),
        center: { x: cx, y: cy },
      };
    };
    return {
      play: info(findByText(/^Play$/)),
      sound: info(document.querySelector('button[aria-label*="ute"]')),
      title: document.title,
      screenGuess: document.querySelector('.ps-panel') ? 'panel-visible' : 'no-panel',
    };
  });

  console.log(JSON.stringify({ diag, errors }, null, 2));
  await browser.close();
})();
