import type { ThemeConfig } from 'antd';

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
    borderRadius: 8,
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
