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
              // 拆进独立子块，避免全站为它们买单；小子组按阈值回并。
              //
              // ⚠️ 这个阈值直接决定「首屏要不要替次要页面买单」，改动前先测：
              // v4.4.0 加入积分/签到/二维码组件后，40KB 阈值下 rolldown 把带新组件名的 antd 块
              // 并进了「与入口共享」的块，而入口是静态 import 它们的 → 急加载 JS 从 319.5 KB gz
              // 涨到 380.3（破 340KB 预算）。阈值降到 8KB 后各入口保住自己的小块，回到 325.2。
              // 实测数据：16KB→329.5 / 8KB→327.3(含懒加载) / 0KB→329.3 / 200KB→535.4（更糟）。
              // 量法：dist/index.html 引用的全部 .js 的 gzip 之和（modulepreload 也要算，
              // 入口会静态 import 它们，是真会阻塞的）。
              entriesAware: true,
              entriesAwareMergeThreshold: 8 * 1024,
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
              // @dnd-kit 仅任务看板使用：独立分组防止它随 vendor（react-router 急加载）
              // "一人急加载、全组陪绑"地进入登录页关键路径
              name: 'dnd',
              test: /node_modules[\\/]@dnd-kit[\\/]/,
              priority: 7,
            },
            {
              // 二维码：仅票务用到，且只在「看签到码 / 开扫码」时才需要。
              // 必须独立成组——否则会被下面 priority 1 的 vendor 兜底分组吸进去，
              // 而 vendor 是首屏急加载的，等于每次进站都白付这份体积（v4.4.0 实测踩到）。
              name: 'qrcode',
              test: /node_modules[\\/](qrcode|html5-qrcode|dijkstrajs|encode-utf8)[\\/]/,
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
