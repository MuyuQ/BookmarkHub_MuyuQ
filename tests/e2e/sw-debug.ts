import puppeteer from 'puppeteer-core';

const DEBUG_PORT = 9388;
const EXTENSION_ID = 'gcilfmcdkfniiaelcdpppjobfibgfffa';

async function main() {
  console.log('🔍 Service Worker 状态调试\n');
  
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
  });
  
  // 列出所有 targets
  const targets = await browser.targets();
  
  console.log('📋 所有 Targets:');
  for (const t of targets) {
    const url = t.url();
    console.log(`  ${t.type()}: ${url.substring(0, 80)}`);
  }
  
  // 找到 Service Worker
  const swTarget = targets.find(t => 
    t.type() === 'service_worker' && 
    t.url().includes(EXTENSION_ID)
  );
  
  if (!swTarget) {
    console.log('\n❌ Service Worker 未找到!');
    await browser.disconnect();
    return;
  }
  
  console.log('\n✅ Service Worker 已找到');
  console.log(`   URL: ${swTarget.url()}`);
  
  // 尝试附加调试器
  try {
    const session = await swTarget.createCDPSession();
    console.log('\n✅ 已创建 CDP Session');
    
    // 启用 Runtime
    await session.send('Runtime.enable');
    console.log('   Runtime 已启用');
    
    // 监听控制台
    session.on('Runtime.consoleAPICalled', (params: any) => {
      const args = params.args || [];
      const messages = args.map((a: any) => {
        if (a.value !== undefined) return String(a.value);
        if (a.description) return a.description;
        return JSON.stringify(a);
      });
      console.log(`  [SW Console] ${messages.join(' ')}`);
    });
    
    // 执行脚本检查状态
    console.log('\n🔍 检查内部状态...');
    
    const result = await session.send('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          isSyncing: typeof isSyncing !== 'undefined' ? isSyncing : 'undefined',
          isSuppressingEvents: typeof isSuppressingEvents !== 'undefined' ? isSuppressingEvents : 'undefined',
          listenersRegistered: typeof listenersRegistered !== 'undefined' ? listenersRegistered : 'undefined',
          syncTimerId: typeof syncTimerId !== 'undefined' ? (syncTimerId ? 'set' : 'null') : 'undefined'
        })
      `,
      returnByValue: true
    });
    
    console.log('   状态:', result.result.value);
    
    // 等待控制台输出
    console.log('\n⏳ 等待 5 秒收集日志...');
    await new Promise(r => setTimeout(r, 5000));
    
    await session.detach();
  } catch (e) {
    console.log('   错误:', (e as Error).message);
  }
  
  await browser.disconnect();
}

main().catch(console.error);
