// Renders promo/carousel/frame-*.html to 1080x1350 PNGs with Playwright and
// warns about any text smaller than the phone-legibility floor.
//
//   node promo/carousel.mjs

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const CONFIG = { width: 1080, height: 1350, minFontPx: 40 };

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'carousel');
const frames = (await readdir(dir)).filter(name => /^frame-\d+\.html$/.test(name)).sort();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: CONFIG.width, height: CONFIG.height }, deviceScaleFactor: 1 });
  for (const name of frames) {
    await page.goto(pathToFileURL(join(dir, name)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const small = await page.evaluate(floor => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const found = new Set();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const size = parseFloat(getComputedStyle(node.parentElement).fontSize);
        if (size < floor) found.add(`${Math.round(size)}px "${node.textContent.trim().slice(0, 40)}"`);
      }
      return [...found];
    }, CONFIG.minFontPx);
    if (small.length) console.warn(`[${name}] text under ${CONFIG.minFontPx}px: ${small.join('; ')}`);
    const out = join(dir, name.replace('.html', '.png'));
    await page.screenshot({ path: out, type: 'png' });
    console.log(`[${name}] rendered to promo/carousel/${name.replace('.html', '.png')}`);
  }
} finally {
  await browser.close();
}
