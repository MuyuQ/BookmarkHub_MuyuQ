/**
 * 调试自动同步问题
 * 通过 CDP 检查 Service Worker 状态
 */
import puppeteer from 'puppeteer';

const EXTENSION_ID = 'gcilfmcdkfniiaelcdpppjobfibgfffa';
const GIST_TOKEN = process.env.GITHUB_TOKEN || '';
const GIST_ID = process.env.GIST_ID || '';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🔍 连接到 Chrome...');
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9388',
    defaultViewport: null,
  });

  const pages = await browser.pages();
  console.log(`📄 当前 ${pages.length} 个页面`);

  console.log('\n🔧 检查 Service Worker...');
  const extensionsPage = await browser.newPage();
  await extensionsPage.goto('chrome://extensions/');
  await wait(1000);

  console.log('\n📋 检查扩展设置...');
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
  await wait(500);

  await popup.screenshot({ path: 'debug-popup.png' });
  console.log('📸 Popup 截图已保存: debug-popup.png');

  console.log('\n⚙️ 检查存储设置...');
  const optionsPage = await browser.newPage();
  await optionsPage.goto(`chrome-extension://${EXTENSION_ID}/options.html`);
  await wait(1000);
  
  // 读取设置
  const settings = await optionsPage.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, (items) => {
        resolve(items);
      });
    });
  });
  console.log('当前设置:', JSON.stringify(settings, null, 2));

  // 4. 检查 local storage
  const localStorage = await optionsPage.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        resolve(items);
      });
    });
  });
  console.log('本地存储:', JSON.stringify(localStorage, null, 2));

  // 5. 测试添加书签并监控事件
  console.log('\n🧪 测试添加书签事件...');
  
  // 在 Service Worker 中执行检查
  // 由于无法直接访问 Service Worker，我们通过消息传递来检查
  
  // 创建一个测试页面来添加书签
  const testPage = await browser.newPage();
  await testPage.goto('https://example.com');
  await wait(500);

  // 在扩展页面中执行书签操作
  const bookmarkTest = await popup.evaluate(async () => {
    // 检查是否可以创建书签
    const bookmarks = await chrome.bookmarks.getTree();
    const toolbarId = bookmarks[0].children?.find((c: any) => c.id === '1')?.id || '1';
    
    // 创建一个测试书签
    const newBookmark = await chrome.bookmarks.create({
      parentId: toolbarId,
      title: 'Auto Sync Test ' + Date.now(),
      url: 'https://test-autosync.example.com/' + Date.now()
    });
    
    return { 
      created: newBookmark,
      bookmarkCount: await new Promise((resolve) => {
        chrome.bookmarks.getTree((tree) => {
          let count = 0;
          function countBookmarks(nodes: any[]) {
            for (const node of nodes) {
              if (node.url) count++;
              if (node.children) countBookmarks(node.children);
            }
          }
          countBookmarks(tree);
          resolve(count);
        });
      })
    };
  });
  
  console.log('创建的书签:', bookmarkTest);
  
  // 等待自动同步触发
  console.log('\n⏳ 等待 5 秒观察自动同步...');
  await new Promise(r => setTimeout(r, 5000));

  // 检查远程数据
  console.log('\n🌐 检查远程 Gist 数据...');
  const gistResponse = await fetch(
    `https://api.github.com/gists/${GIST_ID}`,
    {
      headers: {
        'Authorization': `token ${GIST_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );
  const gistData = await gistResponse.json();
  
  if (gistData.files) {
    const fileName = Object.keys(gistData.files)[0];
    const content = gistData.files[fileName].content;
    const parsed = JSON.parse(content);
    let remoteCount = 0;
    function countRemote(nodes: any[]) {
      for (const node of nodes) {
        if (node.url) remoteCount++;
        if (node.children) countRemote(node.children);
      }
    }
    if (parsed.bookmarks) {
      countRemote(parsed.bookmarks);
    }
    console.log(`远程书签数量: ${remoteCount}`);
  }

  // 清理测试书签
  console.log('\n🧹 清理测试书签...');
  await popup.evaluate(async () => {
    const bookmarks = await chrome.bookmarks.search({ url: 'https://test-autosync.example.com/' });
    // 搜索部分匹配
    const all = await chrome.bookmarks.getTree();
    let toDelete: string[] = [];
    function findTest(nodes: any[]) {
      for (const node of nodes) {
        if (node.url && node.url.includes('test-autosync.example.com')) {
          toDelete.push(node.id);
        }
        if (node.children) findTest(node.children);
      }
    }
    findTest(all);
    for (const id of toDelete) {
      await chrome.bookmarks.remove(id);
    }
  });

  console.log('\n✅ 调试完成');
  await browser.disconnect();
}

main().catch(console.error);