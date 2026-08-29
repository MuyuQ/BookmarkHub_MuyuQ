import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.output/**',
      '.wxt/**',
      'dist/**',
      'coverage/**',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    rules: {
      // 本项目约定
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'error',
      // 遗留代码中的大量非空断言，逐步收敛而非一次性报错
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  {
    // logger 是 console 的唯一合法出口
    files: ['src/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    rules: {
      // 挂载时异步加载设置/popup 计数是本项目的既有模式，
      // 该规则（新版 react-hooks）对 async 加载误报，暂关闭
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // 测试与 mock 允许更宽松的断言
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
