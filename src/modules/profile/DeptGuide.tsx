import { useState, useEffect } from 'react';
import { Descriptions, List, Collapse, Empty, Spin, Typography, Button } from 'antd';
import { LinkOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useAuth } from '../../components/AuthContext';
import { fetchDeptGuide } from './profileService';
import type { DeptGuide } from './profileService';
import { getDepartmentLabel } from '../../utils/helpers';
import styles from './profile.module.css';

const { Text, Paragraph } = Typography;

export default function DeptGuidePanel() {
  const user = useAuth();
  const [guide, setGuide] = useState<DeptGuide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeptGuide(user.department).then((data) => {
      setGuide(data);
      setLoading(false);
    });
  }, [user.department]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <Spin />
      </div>
    );
  }

  if (!guide) {
    return (
      <Empty
        description={`暂无${getDepartmentLabel(user.department)}的新人指南`}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  const collapseItems = guide.faqs?.length
    ? [
        {
          key: 'faqs',
          label: `常见问题 (${guide.faqs.length})`,
          children: (
            <List
              size="small"
              dataSource={guide.faqs}
              renderItem={(faq) => (
                <List.Item>
                  <div>
                    <Text strong>
                      <QuestionCircleOutlined style={{ marginRight: 6, color: '#3498db' }} />
                      {faq.question}
                    </Text>
                    <Paragraph
                      style={{ marginTop: 4, marginBottom: 0, color: '#555', fontSize: 13 }}
                    >
                      {faq.answer}
                    </Paragraph>
                  </div>
                </List.Item>
              )}
            />
          ),
        },
      ]
    : [];

  return (
    <div>
      {/* 基本信息 */}
      <div className={styles.guideSection}>
        <h4>基本信息</h4>
        <Descriptions column={2} size="small" bordered>
          {guide.basic_info.leader && (
            <Descriptions.Item label="分管主席/部长">
              {guide.basic_info.leader}
            </Descriptions.Item>
          )}
          {guide.basic_info.teacher && (
            <Descriptions.Item label="指导老师">
              {guide.basic_info.teacher}
            </Descriptions.Item>
          )}
          {guide.basic_info.office && (
            <Descriptions.Item label="办公地点">
              {guide.basic_info.office}
            </Descriptions.Item>
          )}
          {guide.basic_info.group_chat && (
            <Descriptions.Item label="部门群号">
              {guide.basic_info.group_chat}
            </Descriptions.Item>
          )}
        </Descriptions>
        {!guide.basic_info.leader && !guide.basic_info.teacher && !guide.basic_info.office && !guide.basic_info.group_chat && (
          <Text type="secondary">暂无基本信息</Text>
        )}
      </div>

      {/* 常用模板 */}
      {guide.templates && guide.templates.length > 0 && (
        <div className={styles.guideSection}>
          <h4>常用模板 / 文档</h4>
          <List
            size="small"
            dataSource={guide.templates}
            renderItem={(tpl) => (
              <List.Item>
                <Button
                  type="link"
                  icon={<LinkOutlined />}
                  href={tpl.url}
                  target="_blank"
                  style={{ padding: 0 }}
                >
                  {tpl.title}
                </Button>
              </List.Item>
            )}
          />
        </div>
      )}

      {/* 常见问题 */}
      {collapseItems.length > 0 && (
        <div className={styles.guideSection}>
          <Collapse items={collapseItems} />
        </div>
      )}
    </div>
  );
}
