import { chromium } from 'playwright';

// 生成应用图标（build/icon.png，512×512，electron-builder 自动转换 ico）
const target = process.argv[2] ?? 'build/icon.png';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(
    [
      '<body style="margin:0">',
      '<div style="width:512px;height:512px;border-radius:96px;background:linear-gradient(160deg,#101820,#2b4a5f);display:grid;place-items:center">',
      '<div style="width:200px;height:200px;border-radius:40px;background:#2f6bdb;display:grid;place-items:center;color:#fff;font:700 130px/1 sans-serif">媒</div>',
      '</div>',
      '</body>',
    ].join(''),
  );
  await page.screenshot({ path: target });
  console.log(`icon generated: ${target}`);
} finally {
  await browser.close();
}