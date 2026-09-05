import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

/* 设计令牌唯一来源（TS 侧）
   与 src/styles/variables.css 保持同步：改品牌色需同时改两处的同名字段 */

const BRAND_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";

/* 暗色下的品牌主色：#1a3a5c 在深底上对比度不足，提亮一档 */
const PRIMARY_DARK_MODE = '#2f6db3';

const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1a3a5c',
    colorSuccess: '#27ae60',
    colorWarning: '#e67e22',
    colorError: '#e74c3c',
    colorInfo: '#3498db',
    colorBgLayout: '#f0f2f5',
    colorBgContainer: '#ffffff',
    colorText: '#2c3e50',
    colorTextSecondary: '#7f8c8d',
    colorTextTertiary: '#95a5a6',
    colorTextQuaternary: '#bdc3c7',
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#f0f0f0',
    borderRadius: 8,
    fontFamily: BRAND_FONT,
  },
  components: {
    Layout: {
      headerBg: '#1a3a5c',
      siderBg: '#ffffff',
      headerHeight: 56,
    },
    Menu: {
      itemSelectedBg: '#e8f0fe',
      itemSelectedColor: '#1a3a5c',
    },
  },
};

const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: PRIMARY_DARK_MODE,
    colorSuccess: '#2ecc71',
    colorWarning: '#f39c12',
    colorError: '#e74c3c',
    colorInfo: '#3498db',
    colorBgLayout: '#101418',
    colorBgContainer: '#171c22',
    colorText: '#e8ecf1',
    colorTextSecondary: '#a0aab4',
    colorTextTertiary: '#7d8791',
    colorTextQuaternary: '#5a636d',
    colorBorder: '#3a4450',
    colorBorderSecondary: '#222932',
    borderRadius: 8,
    fontFamily: BRAND_FONT,
  },
  components: {
    Layout: {
      headerBg: '#0f151b',
      siderBg: '#171c22',
      headerHeight: 56,
    },
    Menu: {
      itemSelectedBg: '#1c2f42',
      itemSelectedColor: '#6fa8dc',
    },
  },
};

/** 按明暗模式构建 antd 主题配置 */
export function buildTheme(dark: boolean): ThemeConfig {
  return dark ? darkTheme : lightTheme;
}

export default lightTheme;
