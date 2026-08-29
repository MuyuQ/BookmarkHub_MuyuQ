#!/usr/bin/env node
/**
 * 校验 _locales 下所有语言包：
 * 1. UTF-8 BOM 检查（BOM 会导致部分解析器报错）
 * 2. JSON 可解析性（硬失败，退出码 1）
 * 3. 与 en 基准的键完整性对比（警告，不阻断；键补齐工作在 i18n 阶段）
 *
 * 用法：npm run validate:locales
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'public', '_locales');
const BASE_LOCALE = 'en';

let failed = false;
const keyCounts = {};

for (const locale of readdirSync(localesDir).sort()) {
    const file = join(localesDir, locale, 'messages.json');
    if (!existsSync(file)) {
        console.error(`✗ ${locale}: 缺少 messages.json`);
        failed = true;
        continue;
    }

    let content = readFileSync(file, 'utf8');
    if (content.charCodeAt(0) === 0xfeff) {
        console.error(`✗ ${locale}: 含 UTF-8 BOM，需去除`);
        failed = true;
        content = content.slice(1);
    }

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        console.error(`✗ ${locale}: JSON 解析失败 - ${error.message}`);
        failed = true;
        continue;
    }
    keyCounts[locale] = Object.keys(parsed).length;
}

if (keyCounts[BASE_LOCALE] !== undefined) {
    const baseKeys = Object.keys(JSON.parse(readFileSync(join(localesDir, BASE_LOCALE, 'messages.json'), 'utf8')));
    for (const [locale, count] of Object.entries(keyCounts)) {
        if (locale === BASE_LOCALE) continue;
        const missing = baseKeys.length - count;
        if (missing > 0) {
            console.warn(`⚠ ${locale}: 较 ${BASE_LOCALE} 缺少 ${missing} 个键（${count}/${baseKeys.length}）`);
        }
    }
}

for (const [locale, count] of Object.entries(keyCounts)) {
    console.log(`✓ ${locale}: ${count} 键`);
}

if (failed) {
    console.error('\n语言包校验未通过');
    process.exit(1);
}
console.log('\n语言包校验通过');
