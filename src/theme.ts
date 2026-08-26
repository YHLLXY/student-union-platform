import type { ThemeConfig } from 'antd';

/* 设计令牌唯一来源（TS 侧）
   与 src/styles/variables.css 保持同步：改品牌色需同时改两处的同名字段 */

const BRAND_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";

const theme: ThemeConfig = {
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

export default theme;
