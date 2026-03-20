import puppeteer from 'puppeteer-core';

const DEBUG_PORT = 9388;
const EXTENSION_ID = 'gcilfmcdkfniiaelcdpppjobfibgfffa';

async function main() {
  console.log('🔍 调试自动同步...\n');
  
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: { width: 800, height: 600 },
  });
  
  // 获取 service worker 页面
  const targets = await browser.targets();
  const swTarget = targets.find(t => 
    t.type() === 'service_worker' && 
    t.url().includes(EXTENSION_ID)
  );
  
  if (swTarget) {
    console.log('✅ 找到 Service Worker');
    
    const worker = await swTarget.worker();
    if (worker) {
      console.log('✅ 已连接到 Service Worker');
      
      // 检查事件监听器状态
      console.log('\n📋 检查事件监听器状态...');
      
      // 监听控制台输出
      worker.on('console', msg => {
        console.log(`  [SW] ${(msg as { text: () => string }).text()}`);
      });
      
      // 等待日志
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  // 打开 popup 触发检查
  const popupPage = await browser.newPage();
  await popupPage.goto(`chrome-extension://${EXTENSION_ID}/popup.html`, { waitUntil: 'networkidle0' });
  
  console.log('\n📊 当前 Popup 状态:');
  const content = await popupPage.evaluate(() => document.body.innerText);
  console.log(content);
  
  // 添加书签并监听控制台
  console.log('\n📝 添加书签并观察日志...');
  
  const addPage = await browser.newPage();
  
  // 监听控制台
  addPage.on('console', msg => {
    const text = msg.text();
    if (text.includes('sync') || text.includes('Sync') || text.includes('listener') || text.includes('suppress')) {
      console.log(`  [Log] ${text}`);
    }
  });
  
  await addPage.evaluateOnNewDocument(() => {
    // @ts-ignore
    chrome.bookmarks.create({
      parentId: '1',
      title: `Debug Test ${Date.now()}`,
      url: `https://debug-test-${Date.now()}.com`
    }, (result: any) => {
      console.log('书签创建结果:', result ? '成功' : '失败');
    });
  });
  
  await addPage.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
  
  console.log('  等待 10 秒观察同步...');
  await new Promise(r => setTimeout(r, 10000));
  
  // 检查结果
  await popupPage.reload({ waitUntil: 'networkidle0' });
  const afterContent = await popupPage.evaluate(() => document.body.innerText);
  
  console.log('\n📊 更新后状态:');
  console.log(afterContent);
  
  await browser.disconnect();
}

main().catch(console.error);
