/**
 * 自动同步功能测试脚本
 * 
 * 测试流程：
 * 1. 启动Chrome浏览器并加载扩展
 * 2. 配置Token和Gist ID
 * 3. 开启自动同步
 * 4. 添加书签
 * 5. 验证自动同步是否触发
 * 6. 验证本地计数是否刷新
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试配置
const CONFIG = {
  githubToken: process.env.GITHUB_TOKEN || '',
  gistId: process.env.GIST_ID || '',
  extensionPath: '/home/muyu/git_repositories/BookmarkHub_MuyuQ/.output/chrome-mv3',
  chromePath: '/opt/google/chrome/chrome',
  debugPort: 10000 + Math.floor(Math.random() * 55535),
  testBookmark: {
    title: 'Test Bookmark - Auto Sync Test',
    url: 'https://example.com/test-auto-sync-' + Date.now(),
  },
  waitTimeForSync: 10000,
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 扩展ID存储
let extensionId: string = '';

/**
 * 启动浏览器并加载扩展
 */
async function launchBrowser(): Promise<Browser> {
  log('🚀 启动Chrome浏览器...', 'cyan');
  
  const { execSync } = await import('child_process');
  
  try {
    execSync('pkill -9 -f chrome 2>/dev/null || true');
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch {
    // 忽略错误
  }
  
  const extensionDir = CONFIG.extensionPath;
  const userDataDir = `/tmp/chrome-test-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const chromeCmd = `${CONFIG.chromePath} \
    --remote-debugging-port=${CONFIG.debugPort} \
    --user-data-dir=${userDataDir} \
    --no-first-run \
    --no-sandbox \
    --load-extension=${extensionDir} \
    about:blank > /tmp/chrome-test.log 2>&1 &`;
  
  execSync(chromeCmd, { stdio: 'ignore', shell: '/bin/bash' });
  
  log('   等待Chrome启动...', 'blue');
  
  let browser: Browser | null = null;
  const maxRetries = 10;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${CONFIG.debugPort}`,
        defaultViewport: null,
      });
      log('✅ 浏览器启动成功', 'green');
      return browser;
    } catch (error) {
      log(`   尝试 ${i + 1}/${maxRetries}...`, 'yellow');
    }
  }
  
  throw new Error('无法连接到Chrome浏览器，请检查Chrome是否正确启动');
}

/**
 * 获取扩展ID
 */
async function getExtensionId(browser: Browser): Promise<string> {
  log('🔍 获取扩展ID...', 'cyan');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const targets = await browser.targets();
  
  // 查找service worker或background page
  const serviceWorker = targets.find(
    target => target.type() === 'service_worker'
  );
  
  if (serviceWorker && serviceWorker.url()) {
    const match = serviceWorker.url().match(/chrome-extension:\/\/([a-z]+)\//);
    if (match) {
      const id = match[1];
      log(`✅ 扩展ID: ${id}`, 'green');
      return id;
    }
  }
  
  // 如果找不到service worker，尝试从其他目标中获取
  const allTargets = targets.map(t => ({ type: t.type(), url: t.url() }));
  log('所有targets: ' + JSON.stringify(allTargets, null, 2), 'yellow');
  
  // 尝试从 background_page 获取扩展ID
  const backgroundPage = targets.find(
    target => target.type() === 'background_page' && target.url().includes('chrome-extension://')
  );
  
  if (backgroundPage && backgroundPage.url()) {
    const match = backgroundPage.url().match(/chrome-extension:\/\/([a-z]+)\//);
    if (match) {
      const id = match[1];
      log(`✅ 从 background_page 获取扩展ID: ${id}`, 'green');
      return id;
    }
  }
  
  // 使用固定的扩展ID（从manifest中获取或使用默认值）
  const extensionId = 'nkeimhogjdpnpccoofpliimaahmaaome';
  log(`使用扩展ID: ${extensionId}`, 'yellow');
  return extensionId;
}

/**
 * 打开扩展选项页面并配置设置
 */
async function configureExtension(browser: Browser): Promise<void> {
  log('⚙️  配置扩展设置...', 'cyan');
  
  // 等待扩展完全加载
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const page = await browser.newPage();
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  
  log(`   打开选项页面: ${optionsUrl}`, 'blue');
  
  try {
    await page.goto(optionsUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch (error) {
    log(`   页面加载错误: ${error}`, 'yellow');
    throw error;
  }

  // 等待页面加载
  await page.waitForSelector('#githubToken', { timeout: 5000 });

  // 填写GitHub Token
  await page.evaluate((token) => {
    const input = document.querySelector('#githubToken') as HTMLInputElement;
    if (input) {
      input.value = token;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, CONFIG.githubToken);
  log('   ✓ 填写GitHub Token', 'blue');

  // 填写Gist ID
  await page.evaluate((gistId) => {
    const input = document.querySelector('#gistID') as HTMLInputElement;
    if (input) {
      input.value = gistId;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, CONFIG.gistId);
  log('   ✓ 填写Gist ID', 'blue');

  // 开启自动同步
  await page.evaluate(() => {
    const checkbox = document.querySelector('#enableAutoSync') as HTMLInputElement;
    if (checkbox && !checkbox.checked) {
      checkbox.click();
    }
  });
  log('   ✓ 开启自动同步', 'blue');

  // 开启事件触发同步（添加书签时触发）
  await page.evaluate(() => {
    const checkbox = document.querySelector('#enableEventSync') as HTMLInputElement;
    if (checkbox && !checkbox.checked) {
      checkbox.click();
    }
  });
  log('   ✓ 开启事件触发同步', 'blue');

  // 保存设置
  const saveButton = await page.$('button[type="submit"]');
  if (saveButton) {
    await saveButton.click();
    log('   ✓ 保存设置', 'blue');
  }

  // 等待保存完成
  await new Promise(resolve => setTimeout(resolve, 1000));

  log('✅ 扩展配置完成', 'green');
  
  // 保持页面打开以便观察
  // await page.close();
}

/**
 * 添加书签
 */
async function addTestBookmark(browser: Browser): Promise<void> {
  log('📝 添加测试书签...', 'cyan');
  
  const page = await browser.newPage();
  await page.goto('about:blank');
  
  // 使用Chrome扩展API添加书签
  const extensionPage = await browser.newPage();
  const backgroundUrl = `chrome-extension://${extensionId}/background.html`;
  
  // 通过background page添加书签
  await extensionPage.evaluateOnNewDocument((bookmark) => {
    // @ts-ignore - Chrome API
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      // @ts-ignore
      chrome.bookmarks.create({
        title: bookmark.title,
        url: bookmark.url,
      }, (result: any) => {
        console.log('书签创建结果:', result);
      });
    }
  }, CONFIG.testBookmark);

  await extensionPage.goto(backgroundUrl, { waitUntil: 'load' });
  
  log(`   ✓ 书签已添加: ${CONFIG.testBookmark.title}`, 'blue');
  log(`   URL: ${CONFIG.testBookmark.url}`, 'blue');
  
  log('✅ 测试书签添加完成', 'green');
}

/**
 * 验证自动同步是否触发
 */
async function verifyAutoSync(browser: Browser): Promise<boolean> {
  log('⏳ 验证自动同步是否触发...', 'cyan');
  log(`   等待 ${CONFIG.waitTimeForSync / 1000} 秒以检测同步...`, 'yellow');
  
  // 打开扩展popup查看同步状态
  const popupPage = await browser.newPage();
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  
  await popupPage.goto(popupUrl, { waitUntil: 'networkidle0' });
  
  // 等待一段时间让同步完成
  await new Promise(resolve => setTimeout(resolve, CONFIG.waitTimeForSync));

  // 刷新popup页面查看最新状态
  await popupPage.reload({ waitUntil: 'networkidle0' });

  // 获取同步状态和书签计数
  const status = await popupPage.evaluate(() => {
    const localCountEl = document.querySelector('.local-count');
    const remoteCountEl = document.querySelector('.remote-count');
    const statusEl = document.querySelector('.sync-status');

    return {
      localCount: localCountEl?.textContent || 'N/A',
      remoteCount: remoteCountEl?.textContent || 'N/A',
      status: statusEl?.textContent || 'N/A',
    };
  });

  log(`   本地书签数: ${status.localCount}`, 'blue');
  log(`   远程书签数: ${status.remoteCount}`, 'blue');
  log(`   同步状态: ${status.status}`, 'blue');

  // 验证同步是否成功
  const isSynced = status.localCount !== 'N/A' && status.localCount === status.remoteCount;
  
  if (isSynced) {
    log('✅ 自动同步验证成功 - 本地和远程书签数一致', 'green');
  } else {
    log('⚠️  自动同步可能未完全完成，请检查网络连接和Gist权限', 'yellow');
  }

  return isSynced;
}

/**
 * 验证本地计数是否刷新
 */
async function verifyLocalCount(browser: Browser): Promise<void> {
  log('🔢 验证本地计数是否刷新...', 'cyan');
  
  const popupPage = await browser.newPage();
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  
  await popupPage.goto(popupUrl, { waitUntil: 'networkidle0' });

  // 获取本地书签数
  const count = await popupPage.evaluate(() => {
    const localCountEl = document.querySelector('.local-count');
    return localCountEl?.textContent || 'N/A';
  });

  log(`   当前本地书签数: ${count}`, 'blue');
  
  if (count !== 'N/A' && parseInt(count) > 0) {
    log('✅ 本地计数刷新成功', 'green');
  } else {
    log('❌ 本地计数未正确刷新', 'red');
  }
}

/**
 * 查看控制台日志
 */
async function checkConsoleLogs(browser: Browser): Promise<void> {
  log('📋 检查控制台日志...', 'cyan');
  
  const page = await browser.newPage();
  const backgroundUrl = `chrome-extension://${extensionId}/background.html`;
  
  page.on('console', msg => {
    log(`   [Console] ${msg.type()}: ${msg.text()}`, 'yellow');
  });

  await page.goto(backgroundUrl, { waitUntil: 'load' });
  
  // 等待一段时间收集日志
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * 主测试函数
 */
async function runTest(): Promise<void> {
  log('\n========================================', 'cyan');
  log('  BookmarkHub 自动同步功能测试', 'cyan');
  log('========================================\n', 'cyan');

  let browser: Browser | null = null;

  try {
    // 1. 启动浏览器
    browser = await launchBrowser();

    // 2. 获取扩展ID
    extensionId = await getExtensionId(browser);

    // 3. 配置扩展
    await configureExtension(browser);

    // 4. 添加书签
    await addTestBookmark(browser);

    // 5. 验证自动同步
    await verifyAutoSync(browser);

    // 6. 验证本地计数
    await verifyLocalCount(browser);

    // 7. 检查控制台日志
    await checkConsoleLogs(browser);

    log('\n========================================', 'green');
    log('  ✅ 测试完成！', 'green');
    log('========================================', 'green');
    log('\n请检查浏览器中的扩展popup页面，验证书签是否已同步到Gist。', 'cyan');
    log('测试书签信息:', 'cyan');
    log(`  标题: ${CONFIG.testBookmark.title}`, 'blue');
    log(`  URL: ${CONFIG.testBookmark.url}`, 'blue');

    // 保持浏览器打开以便用户验证
    log('\n浏览器将保持打开状态，请手动验证结果。', 'yellow');
    log('按 Ctrl+C 关闭浏览器并退出测试。', 'yellow');

    // 等待用户手动关闭
    await new Promise(() => {});

  } catch (error) {
    log('\n❌ 测试失败:', 'red');
    console.error(error);
    
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

// 运行测试
runTest();