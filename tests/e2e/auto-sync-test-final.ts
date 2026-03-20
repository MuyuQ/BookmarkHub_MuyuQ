import puppeteer from 'puppeteer-core';

const DEBUG_PORT = 9388;
const EXTENSION_ID = 'gcilfmcdkfniiaelcdpppjobfibgfffa';

async function main() {
  console.log('🚀 测试自动同步功能');
  console.log('========================================');
  
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: { width: 400, height: 600 },
  });
  
  // 打开 popup 记录当前状态
  const popupPage = await browser.newPage();
  await popupPage.goto(`chrome-extension://${EXTENSION_ID}/popup.html`, { waitUntil: 'networkidle0' });
  
  const beforeContent = await popupPage.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/本地:\s*(\d+)/);
    const remoteMatch = text.match(/远程:\s*(\d+)/);
    return {
      local: match ? parseInt(match[1]) : 0,
      remote: remoteMatch ? parseInt(remoteMatch[1]) : 0,
      raw: text
    };
  });
  
  console.log(`\n📊 同步前状态:`);
  console.log(`   本地书签: ${beforeContent.local}`);
  console.log(`   远程书签: ${beforeContent.remote}`);
  
  await popupPage.screenshot({ path: '/tmp/auto-sync-before.png' });
  
  // 添加新书签（通过扩展 API）
  console.log('\n📝 添加新书签...');
  const newBookmark = {
    title: `Auto Sync Test ${Date.now()}`,
    url: `https://auto-sync-test-${Date.now()}.com`
  };
  
  const addPage = await browser.newPage();
  await addPage.evaluateOnNewDocument((bm) => {
    // @ts-ignore
    chrome.bookmarks.create({
      parentId: '1',
      title: bm.title,
      url: bm.url
    }, (result: any) => {
      console.log('新书签已创建:', result?.title);
    });
  }, newBookmark);
  await addPage.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
  
  console.log(`   标题: ${newBookmark.title}`);
  console.log(`   URL: ${newBookmark.url}`);
  
  // 等待自动同步
  console.log('\n⏳ 等待自动同步触发 (15秒)...');
  for (let i = 15; i > 0; i--) {
    process.stdout.write(`\r   倒计时: ${i}秒... `);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\r   等待完成!           ');
  
  // 检查本地计数
  console.log('\n📊 检查本地计数刷新...');
  await popupPage.reload({ waitUntil: 'networkidle0' });
  await popupPage.screenshot({ path: '/tmp/auto-sync-after.png' });
  
  const afterContent = await popupPage.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/本地:\s*(\d+)/);
    const remoteMatch = text.match(/远程:\s*(\d+)/);
    return {
      local: match ? parseInt(match[1]) : 0,
      remote: remoteMatch ? parseInt(remoteMatch[1]) : 0,
      raw: text
    };
  });
  
  console.log(`   本地书签: ${afterContent.local}`);
  console.log(`   远程书签: ${afterContent.remote}`);
  
  // 结果分析
  console.log('\n========================================');
  console.log('📈 测试结果分析:');
  console.log('========================================');
  
  console.log(`\n   同步前: 本地 ${beforeContent.local} / 远程 ${beforeContent.remote}`);
  console.log(`   同步后: 本地 ${afterContent.local} / 远程 ${afterContent.remote}`);
  
  // 判断测试结果
  const localIncreased = afterContent.local > beforeContent.local;
  const remoteSynced = afterContent.local === afterContent.remote;
  
  console.log('\n✅ 验证结果:');
  
  if (localIncreased) {
    console.log(`   ✅ 本地计数已刷新: ${beforeContent.local} → ${afterContent.local}`);
  } else {
    console.log(`   ⚠️  本地计数未变化`);
  }
  
  if (remoteSynced) {
    console.log(`   ✅ 远程同步成功: 本地 = 远程 = ${afterContent.local}`);
  } else {
    console.log(`   ⚠️  远程未同步: 本地 ${afterContent.local} ≠ 远程 ${afterContent.remote}`);
  }
  
  // 最终结论
  if (localIncreased && remoteSynced) {
    console.log('\n🎉 自动同步测试通过!');
    console.log('   - 添加书签后本地计数刷新');
    console.log('   - 自动同步成功更新远程');
  } else if (localIncreased) {
    console.log('\n⚠️  部分通过:');
    console.log('   - 本地计数已刷新');
    console.log('   - 但远程同步可能需要更长时间');
  } else {
    console.log('\n❌ 测试失败');
  }
  
  console.log('\n📸 截图文件:');
  console.log('   - /tmp/auto-sync-before.png');
  console.log('   - /tmp/auto-sync-after.png');
  
  await browser.disconnect();
}

main().catch(console.error);
