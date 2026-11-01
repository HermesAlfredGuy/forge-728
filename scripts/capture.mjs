// Record a real gameplay capture of FORGE 728.
// Run: node scripts/capture.mjs [url]
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.argv[2] || "http://127.0.0.1:8321/";
const OUT = new URL("../out/", import.meta.url).pathname;
fs.mkdirSync(OUT + "raw", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = "/opt/data/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ["--force-device-scale-factor=1", "--no-sandbox"],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT + "raw", size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(BASE + "?capture=1", { waitUntil: "load" });
await page.waitForSelector(".tile");
await sleep(1900);

const clickSel = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); }, sel);
const clickTile = (n) => page.evaluate((i) => {
  const t = [...document.querySelectorAll(".grid .tile")].filter((x) => !x.hidden)[i];
  if (t) t.click();
}, n);
async function strike(times = 1, gap = 1500) {
  for (let i = 0; i < times; i++) {
    await page.click("#strikeBtn", { force: true });
    await sleep(gap);
  }
}

await page.evaluate("__game.select(395, false)");
await sleep(900);
await strike(1, 2100);

await page.evaluate("__game.select(402, false)");
await page.mouse.move(1180, 520);
await page.mouse.wheel(0, 900);
await sleep(1200);
await clickSel("#sort button[data-sort='dmg']");
await sleep(900);
await clickTile(1);
await sleep(900);
await strike(2, 1700);

await clickSel(".fam[data-fam='violet']");
await sleep(1000);
await clickTile(2);
await sleep(700);
await strike(2, 1600);

await clickSel(".fam");
await sleep(800);
await page.evaluate("__game.select(401, false)");
await sleep(700);
await strike(3, 1500);

await sleep(400);
await page.evaluate("__game.select(727, false)");
await sleep(900);
await strike(2, 1700);
await sleep(1200);

await ctx.close();
await browser.close();

const raws = fs.readdirSync(OUT + "raw").filter((f) => f.endsWith(".webm"));
raws.sort((a, b) => fs.statSync(OUT + "raw/" + b).mtimeMs - fs.statSync(OUT + "raw/" + a).mtimeMs);
const src = OUT + "raw/" + raws[0];
const mp4 = OUT + "forge728.mp4";
execFileSync("ffmpeg", ["-y", "-i", src, "-c:v", "libx264", "-preset", "slow", "-crf", "20",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4], { stdio: "ignore" });
console.log("webm", src, fs.statSync(src).size);
console.log("mp4", mp4, fs.statSync(mp4).size);
