import puppeteer from 'puppeteer';
import GIFEncoder from 'gif-encoder-2';
import { createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, 'assets');
const DEMO_URL = `file://${join(__dirname, 'cursor-demo.html')}`;

const WIDTH = 1280;
const HEIGHT = 720;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Smooth path interpolation
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function generatePath(points, stepsPerSegment = 20) {
  const path = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      // Ease in-out for natural feel
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

  // ── Screenshot 1: Static text (no cursor) ──
  console.log('Capturing static screenshot...');
  await page.screenshot({ path: join(ASSETS, 'static.png') });

  // ── Screenshot 2: Cursor in the middle, text scattered ──
  console.log('Capturing repel screenshot...');
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  await page.mouse.move(cx, cy, { steps: 30 });
  await sleep(600);
  // Wiggle a bit to scatter particles
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(cx + Math.sin(i) * 40, cy + Math.cos(i) * 30, { steps: 3 });
    await sleep(40);
  }
  await sleep(300);
  await page.screenshot({ path: join(ASSETS, 'repel.png') });

  // ── Screenshot 3: Vortex mode ──
  console.log('Capturing vortex screenshot...');
  await page.select('#mode', 'vortex');
  await page.mouse.move(cx, cy, { steps: 10 });
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(angle) * 60, cy + Math.sin(angle) * 60, { steps: 3 });
    await sleep(40);
  }
  await sleep(300);
  await page.screenshot({ path: join(ASSETS, 'vortex.png') });

  // ── Record GIF: Repel mode, cursor sweeps through text ──
  console.log('Recording GIF (this takes a moment)...');
  await page.select('#mode', 'repel');
  // Move mouse away first to let text reform
  await page.mouse.move(-100, -100);
  await sleep(1500);

  const encoder = new GIFEncoder(WIDTH, HEIGHT, 'neuquant', true);
  encoder.setDelay(50); // 20fps
  encoder.setQuality(10);
  encoder.setRepeat(0); // loop forever

  const gifStream = createWriteStream(join(ASSETS, 'demo.gif'));
  encoder.createReadStream().pipe(gifStream);
  encoder.start();

  // Generate a smooth sweep path through the text
  const pathPoints = [
    [100, cy - 100],         // start top-left
    [cx - 100, cy],          // approach center
    [cx, cy],                // center
    [cx + 100, cy - 50],     // sweep right-up
    [cx + 200, cy + 50],     // right-down
    [cx, cy + 30],           // back to center
    [cx - 150, cy - 40],     // left-up
    [cx, cy],                // center again
    [WIDTH - 100, cy - 80],  // sweep to far right
  ];

  const fullPath = generatePath(pathPoints, 12);
  const totalFrames = fullPath.length;

  // Also capture some "reform" frames at the end
  const reformFrames = 30;

  for (let i = 0; i < totalFrames; i++) {
    const [mx, my] = fullPath[i];
    await page.mouse.move(mx, my, { steps: 1 });
    await sleep(20);

    if (i % 2 === 0) { // capture every other frame to keep GIF size reasonable
      const frame = await page.screenshot({ encoding: 'binary' });
      const { PNG } = await import('pngjs');
      const png = PNG.sync.read(Buffer.from(frame));
      // gif-encoder-2 expects raw RGBA at the target resolution
      // Since we capture at 2x DPR, we need to resize. Let's recapture at 1x.
      encoder.addFrame(png.data);
    }
  }

  // Move mouse away, capture reform
  await page.mouse.move(-100, -100);
  for (let i = 0; i < reformFrames; i++) {
    await sleep(50);
    if (i % 2 === 0) {
      const frame = await page.screenshot({ encoding: 'binary' });
      const { PNG } = await import('pngjs');
      const png = PNG.sync.read(Buffer.from(frame));
      encoder.addFrame(png.data);
    }
  }

  encoder.finish();
  console.log('Waiting for GIF to flush...');
  await new Promise((resolve) => gifStream.on('finish', resolve));

  await browser.close();
  console.log('Done! Files saved to assets/');
})();
