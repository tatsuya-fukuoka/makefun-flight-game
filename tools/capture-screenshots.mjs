// Serves game/ locally, loads each demo scene in headless Chrome, reports console errors and saves the
// screenshots/ JPEGs. Puppeteer is not a dependency of the entry: point PUPPETEER_DIR at a node_modules
// folder that holds it, e.g. PUPPETEER_DIR=~/workspace/makefun-trial/token-radar/tools/node_modules.
//   node tools/capture-screenshots.mjs [--check-only]
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = join(repo, 'game');
const modules = process.env.PUPPETEER_DIR;
if (!modules) throw new Error('set PUPPETEER_DIR to a node_modules folder containing puppeteer');
const puppeteer = createRequire(join(modules, 'noop.js'))('puppeteer');
const checkOnly = process.argv.includes('--check-only');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  try {
    if (!path.startsWith(root) || !statSync(path).isFile()) throw new Error('missing');
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(8937, '127.0.0.1', r));

const shots = [
  ['1-rings.jpg', '?demo=1&scene=rings&freeze=1'],
  ['2-approach.jpg', '?demo=1&scene=approach&freeze=1'],
  ['3-bank.jpg', '?demo=1&scene=bank&freeze=1'],
  ['4-touchdown.jpg', '?demo=1&scene=touchdown&freeze=1'],
  [null, ''],
];
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.stack));
page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:8937/')) problems.push('external request: ' + r.url()); });
mkdirSync(join(repo, 'screenshots'), { recursive: true });
for (const [name, query] of shots) {
  await page.goto('http://127.0.0.1:8937/index.html' + query, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => document.body.classList.contains('ready'), { timeout: 60000 });
  } catch (err) {
    console.log('page never became ready:\n' + problems.join('\n'));
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1500));
  const state = await page.evaluate(() => {
    const g = window.aonami;
    const p = g.plane;
    return { mode: g.mode, alt: Math.round(p.pos.y), kt: Math.round(p.speed * 1.944), hdg: Math.round(p.heading * 57.3), bank: Math.round(p.bank * 57.3), ring: g.sortie.nextRing, crashed: p.crashed, onGround: p.onGround };
  });
  console.log(name || 'title', JSON.stringify(state));
  if (name && !checkOnly) await page.screenshot({ path: join(repo, 'screenshots', name), type: 'jpeg', quality: 86 });
}
await browser.close();
server.close();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no console errors, no external requests');
