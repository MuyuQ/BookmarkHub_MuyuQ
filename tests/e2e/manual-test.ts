import puppeteer from 'puppeteer-core';

const DEBUG_PORT = 9388;
const EXTENSION_ID = 'gcilfmcdkfniiaelcdpppjobfibgfffa';

async function main() {
  console.log('🚀 连接到 Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: { width: 400, height: 600 },
  });
  
  console.log('✅ 已连接');
  
  // 添加测试书签到书签栏
  console.log('\n📝 添加测试书签到书签栏...');
  
  const testPage = await browser.newPage();
  await testPage.evaluateOnNewDocument(() => {
    // @ts-ignore
    chrome.bookmarks.create({
      parentId: '1', // 书签栏
      title: 'GitHub',
      url: 'https://github.com'
    }, (r: any) => console.log('添加 GitHub:', r));
    
    // @ts-ignore
    chrome.bookmarks.create({
      parentId: '1',
      title: 'Google',
      url: 'https://google.com'
    }, (r: any) => console.log('添加 Google:', r));
    
    // @ts-ignore
    chrome.bookmarks.create({
      parentId: '1', 
      title: `Test ${Date.now()}`,
      url: `https://test-${Date.now()}.com`
    }, (r: any) => console.log('添加 Test:', r));
  });
  
  await testPage.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('   ✓ 已添加 3 个测试书签');
  
  // 打开 popup 查看状态
  console.log('\n📊 打开 Popup 查看状态...');
  const popupPage = await browser.newPage();
  await popupPage.goto(`chrome-extension://${EXTENSION_ID}/popup.html`, { waitUntil: 'networkidle0' });
  
  await popupPage.screenshot({ path: '/tmp/popup-with-bookmarks.png' });
  console.log('📸 截图: /tmp/popup-with-bookmarks.png');
  
  const beforeContent = await popupPage.evaluate(() => document.body.innerText);
  console.log('\n📄 当前状态:');
  console.log(beforeContent);
  
  // 点击上传按钮
  console.log('\n📤 点击上传按钮...');
  const buttons = await popupPage.$$('button');
  const uploadBtn = buttons[0]; // 第一个按钮是上传
  if (uploadBtn) {
    await uploadBtn.click();
    console.log('   ✓ 已点击上传');
    await new Promise(r => setTimeout(r, 5000));
  }
  
  // 检查结果
  await popupPage.reload({ waitUntil: 'networkidle0' });
  await popupPage.screenshot({ path: '/tmp/popup-after-upload2.png' });
  
  const afterContent = await popupPage.evaluate(() => document.body.innerText);
  console.log('\n📄 上传后状态:');
  console.log(afterContent);
  
  // 检查 Gist
  console.log('\n🔍 检查 Gist 数据...');
  
  const gistResponse = await fetch(`https://api.github.com/gists/${process.env.GIST_ID || ''}`, {
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN || ''}`
    }
  });
  
  const gistData = await gistResponse.json();
  const mainFile = gistData.files['BookmarkHub'];
  
  if (mainFile && mainFile.content) {
    const content = JSON.parse(mainFile.content);
    console.log(`   Gist 书签数: ${content.bookmarks?.length || 0} 个文件夹`);
    
    // 检查书签栏是否有书签
    const toolbar = content.bookmarks?.find((b: any) => b.folderType === 'bookmarks-bar');
    if (toolbar && toolbar.children) {
      console.log(`   书签栏书签数: ${toolbar.children.length}`);
      if (toolbar.children.length > 0) {
        console.log('   ✅ 书签已成功同步到 Gist!');
      }
    }
  }
  
  console.log('\n✅ 测试完成!');
  await browser.disconnect();
}

main().catch(console.error);
