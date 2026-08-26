import { Skeleton, Card } from 'antd';

/* === 骨架屏组件库 ===
   设计原则（docs/research/02）：骨架必须贴近真实布局，否则加载完成会跳动；
   页面级/内容等待用骨架，动作提交仍用按钮 loading（Spin 只保留在弹层内部与小组件）。 */

/** 路由切换通用骨架：Suspense fallback */
export function RouteSkeleton() {
  return (
    <div style={{ paddingTop: 8 }}>
      <Skeleton active title={{ width: '28%' }} paragraph={{ rows: 1, width: '46%' }} />
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 24,
          flexWrap: 'wrap',
        }}
      >
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton.Button
            key={i}
            active
            block
            style={{ height: 56, borderRadius: 'var(--radius-lg)', flex: '1 1 180px' }}
          />
        ))}
      </div>
      <Card style={{ marginTop: 24 }}>
        <Skeleton active title paragraph={{ rows: 4 }} />
      </Card>
    </div>
  );
}

/** 卡片流骨架：公告/帖子/票券等 Card 列表页 */
export function CardStreamSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} style={{ marginBottom: 16 }}>
          <Skeleton active title={{ width: '42%' }} paragraph={{ rows: 1, width: ['72%', '45%'] }} />
        </Card>
      ))}
    </>
  );
}

/** 行列表骨架：成员目录、任务列表等；avatar 对应带头像的行 */
export function ListSkeleton({ count = 5, avatar = false }: { count?: number; avatar?: boolean }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <Skeleton active avatar={avatar} title={false} paragraph={{ rows: 1, width: '62%' }} />
        </div>
      ))}
    </div>
  );
}

/** 工作台首页骨架：欢迎语 → 快捷入口行 → 三统计卡 → 动态卡（与真实结构一致） */
export function DashboardSkeleton() {
  return (
    <div>
      <Skeleton active title={{ width: '30%' }} paragraph={{ rows: 1, width: '48%' }} />
      <div style={{ display: 'flex', gap: 12, margin: '20px 0', flexWrap: 'wrap' }}>
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton.Button
            key={i}
            active
            block
            style={{ height: 50, borderRadius: 'var(--radius-lg)', flex: '1 1 140px' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} style={{ flex: 1, minWidth: 160 }} styles={{ body: { padding: 20 } }}>
            <Skeleton active title={false} paragraph={{ rows: 2, width: ['38%', '66%'] }} />
          </Card>
        ))}
      </div>
      <Card>
        <Skeleton active title={{ width: '18%' }} paragraph={{ rows: 3 }} />
      </Card>
    </div>
  );
}
