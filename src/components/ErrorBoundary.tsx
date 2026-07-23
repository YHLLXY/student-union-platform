import { Component, type ReactNode } from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { logger } from '../diagnostics';
import { trackEvent } from '../utils/analytics';

interface Props {
  children: ReactNode;
  message?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    logger.for('app/ErrorBoundary').error('全局渲染错误', error, {
      stack: info.componentStack?.slice(0, 500),
    });

    trackEvent({
      event_type: 'error',
      userId: 'unknown',
      module: 'error-boundary',
      action: 'render_error',
      metadata: {
        error: error.toString().slice(0, 500),
        componentStack: info.componentStack?.slice(0, 500) ?? '',
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 60, maxWidth: 500, margin: '80px auto' }}>
          <Alert
            type="error"
            showIcon
            message={this.props.message ?? '页面发生错误'}
            description={
              <div style={{ marginTop: 8 }}>
                <p style={{ color: '#7f8c8d', fontSize: 13 }}>
                  {this.state.error?.message ?? '未知错误'}
                </p>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={this.handleReload}
                  style={{ marginTop: 8 }}
                >
                  刷新页面
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
