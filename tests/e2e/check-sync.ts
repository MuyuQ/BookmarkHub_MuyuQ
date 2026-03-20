import puppeteer from 'puppeteer-core';

const DEBUG_PORT = 9388;
const EXTENSION_ID = 'gcilfmcdkfniiaelcdpppjobfibgfffa';

async function main() {
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: { width: 400, height: 600 },
  });
  
  // 等待更多时间
  console.log('⏳ 等待更多时间让同步完成 (20秒)...');
  await new Promise(r => setTimeout(r, 20000));
  
  // 检查 popup
  const popupPage = await browser.newPage();
  await popupPage.goto(`chrome-extension://${EXTENSION_ID}/popup.html`, { waitUntil: 'networkidle0' });
  
  const content = await popupPage.evaluate(() => document.body.innerText);
  console.log('\n📄 Popup 当前状态:');
  console.log(content);
  
  // 手动触发上传测试
  console.log('\n📤 手动点击上传按钮...');
  const buttons = await popupPage.$$('button');
  if (buttons[0]) {
    await buttons[0].click();
    await new Promise(r => setTimeout(r, 5000));
  }
  
  // 再次检查
  await popupPage.reload({ waitUntil: 'networkidle0' });
  const afterContent = await popupPage.evaluate(() => document.body.innerText);
  console.log('\n📄 上传后状态:');
  console.log(afterContent);
  
  await browser.disconnect();
}

main().catch(console.error);
