import { Component, type ReactNode } from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { logger } from '../diagnostics';

interface Props {
  children: ReactNode;
  moduleName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ModuleErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    logger.for(`${this.props.moduleName}/ModuleErrorBoundary`).error(
      '模块渲染错误',
      error,
      { module: this.props.moduleName, stack: info.componentStack?.slice(0, 500) },
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, maxWidth: 480, margin: '40px auto' }}>
          <Alert
            type="warning"
            showIcon
            message={`「${this.props.moduleName}」模块加载失败`}
            description={
              <div style={{ marginTop: 8 }}>
                <p style={{ color: '#7f8c8d', fontSize: 13 }}>
                  {this.state.error?.message ?? '未知错误'}
                </p>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={() => window.location.reload()}
                  style={{ marginTop: 8 }}
                >
                  重新加载此模块
                </Button>
              </div>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
