#!/usr/bin/env node
// Take a screenshot of a URL or local HTML file with Puppeteer (uses the installed Google Chrome).
//
// Usage:
//   node tools/screenshot.js <url-or-file> [options]
//
// Options:
//   --out <path>        Output PNG path (default: .tmp/screenshots/<name>-<timestamp>.png)
//   --width <px>        Viewport width (default: 1440)
//   --height <px>       Viewport height (default: 900)
//   --mobile            Phone viewport: 390x844 at 3x, touch enabled
//   --full              Capture the full scrollable page
//   --dark              Emulate prefers-color-scheme: dark
//   --selector <css>    Capture only the first element matching this selector
//   --wait <ms>         Extra wait after load, for animations/fonts (default: 500)
//
// Env:
//   CHROME_PATH         Override the browser executable

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = { width: 1440, height: 900, wait: 500, full: false, mobile: false, dark: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--width') opts.width = Number(argv[++i]);
    else if (a === '--height') opts.height = Number(argv[++i]);
    else if (a === '--wait') opts.wait = Number(argv[++i]);
    else if (a === '--selector') opts.selector = argv[++i];
    else if (a === '--full') opts.full = true;
    else if (a === '--mobile') opts.mobile = true;
    else if (a === '--dark') opts.dark = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
    else rest.push(a);
  }
  if (rest.length !== 1) throw new Error('Pass exactly one URL or file path.');
  opts.target = rest[0];
  return opts;
}

function resolveTarget(target) {
  if (/^(https?|file|data):/i.test(target)) return target;
  const file = path.resolve(target);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return pathToFileURL(file).href;
}

function defaultOut(target) {
  const base = path.basename(target).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 60) || 'page';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(ROOT, '.tmp', 'screenshots', `${base}-${stamp}.png`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = resolveTarget(opts.target);
  const out = path.resolve(opts.out || defaultOut(opts.target));
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const executablePath = process.env.CHROME_PATH || DEFAULT_CHROME;
  if (!fs.existsSync(executablePath)) throw new Error(`Chrome not found at ${executablePath}. Set CHROME_PATH.`);

  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport(opts.mobile
      ? { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : { width: opts.width, height: opts.height, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.dark ? 'dark' : 'light' }]);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    if (opts.wait > 0) await new Promise(r => setTimeout(r, opts.wait));

    if (opts.selector) {
      const el = await page.$(opts.selector);
      if (!el) throw new Error(`No element matches selector: ${opts.selector}`);
      await el.screenshot({ path: out });
    } else {
      await page.screenshot({ path: out, fullPage: opts.full });
    }
    console.log(out);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(`screenshot failed: ${err.message}`);
  process.exit(1);
});
