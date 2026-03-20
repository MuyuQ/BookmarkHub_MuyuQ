import puppeteer from 'puppeteer-core';

const DEBUG_PORT = 9388;
const EXTENSION_ID = 'gcilfmcdkfniiaelcdpppjobfibgfffa';

async function main() {
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: { width: 800, height: 600 },
  });
  
  // 打开 options 页面检查设置
  console.log('⚙️  检查扩展设置...');
  const optionsPage = await browser.newPage();
  await optionsPage.goto(`chrome-extension://${EXTENSION_ID}/options.html`, { waitUntil: 'networkidle0' });
  
  await optionsPage.screenshot({ path: '/tmp/options-settings.png', fullPage: true });
  console.log('📸 设置截图: /tmp/options-settings.png');
  
  // 获取设置状态
  const settings = await optionsPage.evaluate(() => {
    const getValue = (id: string, type: string = 'checkbox') => {
      const el = document.querySelector(`#${id}`) as HTMLInputElement;
      if (!el) return null;
      if (type === 'checkbox') return el.checked;
      if (type === 'text' || type === 'number') return el.value;
      return null;
    };
    
    return {
      githubToken: getValue('githubToken', 'text') ? '(已设置)' : '(未设置)',
      gistID: getValue('gistID', 'text') || '(未设置)',
      enableAutoSync: getValue('enableAutoSync'),
      enableEventSync: getValue('enableEventSync'),
      enableIntervalSync: getValue('enableIntervalSync'),
      syncInterval: getValue('syncInterval', 'number'),
    };
  });
  
  console.log('\n📋 当前设置:');
  console.log(`   GitHub Token: ${settings.githubToken}`);
  console.log(`   Gist ID: ${settings.gistID}`);
  console.log(`   启用自动同步: ${settings.enableAutoSync ? '✅ 开启' : '❌ 关闭'}`);
  console.log(`   启用事件触发同步: ${settings.enableEventSync ? '✅ 开启' : '❌ 关闭'}`);
  console.log(`   启用定时同步: ${settings.enableIntervalSync ? '✅ 开启' : '❌ 关闭'}`);
  console.log(`   同步间隔: ${settings.syncInterval} 分钟`);
  
  if (!settings.enableEventSync) {
    console.log('\n⚠️  事件触发同步未开启，正在开启...');
    
    const eventSyncCheckbox = await optionsPage.$('#enableEventSync');
    if (eventSyncCheckbox) {
      await eventSyncCheckbox.click();
      console.log('   ✓ 已开启事件触发同步');
      
      // 保存
      const saveBtn = await optionsPage.$('button[type="submit"]');
      if (saveBtn) {
        await saveBtn.click();
        console.log('   ✓ 已保存设置');
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  } else {
    console.log('\n✅ 事件触发同步已开启');
  }
  
  await browser.disconnect();
}

main().catch(console.error);
