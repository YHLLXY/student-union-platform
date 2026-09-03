import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
  base: '/student-union-platform/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Rolldown 取代 manualChunks 的分组式分包（advancedChunks 已 deprecated）。
        // 目标：vendor 命名语义化 + 稳定缓存；正则用 [\\/] 兼容 Windows 路径。
        // 依据见 docs/research/05-构建优化与代码分割.md
        codeSplitting: {
          groups: [
            {
              name: 'react-core',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 10,
            },
            {
              name: 'supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 9,
            },
            {
              name: 'antd',
              test: /node_modules[\\/](antd|@ant-design|@rc-component|rc-)[\\/]/,
              priority: 8,
              // 按引用入口聚合：只有部分页面用到的重型组件（Table/Tree/DatePicker 等）
              // 拆进独立子块，避免全站为它们买单；小子组按阈值回并
              entriesAware: true,
              entriesAwareMergeThreshold: 40 * 1024,
            },
            {
              name: 'motion',
              test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/,
              priority: 8,
            },
            {
              // react-markdown 全家桶：仅论坛使用，独立成 chunk 利于懒加载缓存
              name: 'markdown',
              test: /node_modules[\\/](react-markdown|micromark|mdast-|hast-|unist-|unified|vfile|remark-|rehype-|property-information|decode-named-character-reference|character-entities|trim-lines|comma-separated-tokens|ccount|escape-string-regexp|devlop|longest-streak|zwitch|html-url-attributes)[\\/]/,
              priority: 7,
            },
            {
              // 其余零散第三方（dayjs/@babel/runtime/tslib 等）
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
});
