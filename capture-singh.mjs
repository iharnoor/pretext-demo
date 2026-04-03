import puppeteer from 'puppeteer';
import GIFEncoder from 'gif-encoder-2';
import { createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, 'assets');
const DEMO_URL = `file://${join(__dirname, 'cursor-demo.html')}`;

const WIDTH = 1280;
const HEIGHT = 720;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function generatePath(points, stepsPerSegment = 15) {
  const path = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      path.push([lerp(x1, x2, ease), lerp(y1, y2, ease)]);
    }
  }
  path.push(points[points.length - 1]);
  return path;
}

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', `--window-size=${WIDTH},${HEIGHT}`],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  await page.goto(DEMO_URL, { waitUntil: 'networkidle0' });
  await sleep(500);

  // Select "SINGH IN USA"
  await page.select('#textSelect', 'SINGH IN USA');
  await sleep(800);

  // ── Static screenshot ──
  console.log('Capturing SINGH IN USA static...');
  await page.screenshot({ path: join(ASSETS, 'singh-static.png') });

  // ── Repel screenshot ──
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  await page.mouse.move(cx, cy, { steps: 30 });
  await sleep(400);
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(cx + Math.sin(i * 0.5) * 50, cy + Math.cos(i * 0.5) * 35, { steps: 2 });
    await sleep(30);
  }
  await sleep(300);
  console.log('Capturing SINGH IN USA repel...');
  await page.screenshot({ path: join(ASSETS, 'singh-repel.png') });

  // ── Record GIF ──
  console.log('Recording SINGH IN USA GIF...');
  await page.mouse.move(-100, -100);
  await sleep(1500);

  const encoder = new GIFEncoder(WIDTH, HEIGHT, 'neuquant', true);
  encoder.setDelay(50);
  encoder.setQuality(10);
  encoder.setRepeat(0);

  const gifStream = createWriteStream(join(ASSETS, 'singh-demo.gif'));
  encoder.createReadStream().pipe(gifStream);
  encoder.start();

  // Sweep path — left to right through the text
  const pathPoints = [
    [80, cy],
    [cx * 0.5, cy - 40],
    [cx, cy],
    [cx * 1.2, cy + 30],
    [cx * 1.5, cy - 20],
    [WIDTH - 80, cy],
    [cx, cy],
    [cx * 0.7, cy + 40],
    [cx, cy - 30],
  ];

  const fullPath = generatePath(pathPoints, 14);

  for (let i = 0; i < fullPath.length; i++) {
    const [mx, my] = fullPath[i];
    await page.mouse.move(mx, my, { steps: 1 });
    await sleep(20);
    if (i % 2 === 0) {
      const frame = await page.screenshot({ encoding: 'binary' });
      const png = PNG.sync.read(Buffer.from(frame));
      encoder.addFrame(png.data);
    }
  }

  // Reform frames
  await page.mouse.move(-100, -100);
  for (let i = 0; i < 30; i++) {
    await sleep(50);
    if (i % 2 === 0) {
      const frame = await page.screenshot({ encoding: 'binary' });
      const png = PNG.sync.read(Buffer.from(frame));
      encoder.addFrame(png.data);
    }
  }

  encoder.finish();
  await new Promise(resolve => gifStream.on('finish', resolve));

  await browser.close();
  console.log('Done! SINGH IN USA assets saved.');
})();
