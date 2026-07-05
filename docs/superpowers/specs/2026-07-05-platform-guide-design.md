# 平台功能指南 — 设计文档

- **日期：** 2026-07-05
- **状态：** 待审核
- **模块：** guide（新建）

## 1. 需求概述

为新人提供平台功能使用说明。在 Header 放一个按钮，点击后从右侧滑出 Drawer，按模块分 Tab 展示功能介绍文字。部门负责人及以上角色可以编辑、添加、删除指南条目。

## 2. 核心决策

| 决策项 | 选择 |
|--------|------|
| 数据存储 | Supabase 新表 `platform_guides` |
| 展示形式 | 右侧 Drawer（宽度 420px） |
| 按钮位置 | Header 顶部导航栏右侧（头像左边） |
| 覆盖模块 | 任务管理、部门公告、部门论坛、个人中心 |
| 编辑权限 | `hasMinRole(role, 'dept_head')` 为 true |
| 内容格式 | 纯文本（pre-wrap） |

## 3. 数据库设计

### 新表：`platform_guides`

```sql
CREATE TABLE platform_guides (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  module_key  TEXT NOT NULL,       -- 'tasks' | 'notices' | 'forum' | 'profile'
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

### RLS 策略

```sql
-- 所有人可读
CREATE POLICY "Anyone can read guides"
  ON platform_guides FOR SELECT
  USING (true);

-- 部门负责人及以上可写
CREATE POLICY "Dept head+ can insert guides"
  ON platform_guides FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid()
    AND role IN ('dept_head','presidium','president','teacher','developer')
  ));

CREATE POLICY "Dept head+ can update guides"
  ON platform_guides FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid()
    AND role IN ('dept_head','presidium','president','teacher','developer')
  ));

CREATE POLICY "Dept head+ can delete guides"
  ON platform_guides FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid()
    AND role IN ('dept_head','presidium','president','teacher','developer')
  ));
```

### 初始数据（4 条）

每个模块 1 条默认介绍，由 `developer` 角色创建（`created_by` 后续手动指定）。

| module_key | title | content |
|------------|-------|---------|
| tasks | 如何查看与提交任务 | 介绍任务列表、状态筛选、提交审核流程 |
| notices | 部门公告的使用 | 介绍公告类型、置顶规则、关联任务功能 |
| forum | 部门论坛介绍 | 介绍发帖分类、Markdown 编辑、知识库模板 |
| profile | 个人中心功能概览 | 介绍统计面板、任务日历、热力图、通讯录 |

## 4. 组件架构

### 目录结构

```
src/modules/guide/           ← 新建
├── index.tsx                 # 集中导出
├── GuideDrawer.tsx           # 主抽屉组件
├── GuideForm.tsx             # 编辑弹窗（负责人+可见）
├── guideService.ts           # Supabase CRUD + 类型
└── guide.module.css          # 样式
```

### 组件关系

```
AppLayout.tsx (Header 加按钮)
  └─ QuestionCircleOutlined 图标按钮
       └─ onClick → setGuideOpen(true)
            └─ GuideDrawer
                 ├─ Tabs: 任务管理 | 部门公告 | 部门论坛 | 个人中心
                 ├─ 条目卡片列表（title + Markdown content + 编辑者/时间）
                 ├─ 编辑/删除按钮（仅 hasMinRole ≥ dept_head 可见）
                 └─ +添加条目 按钮（仅负责人可见）
                      └─ GuideForm (Modal)
```

### 影响面

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/components/AppLayout.tsx` | 修改 | Header 加 1 个按钮 + state，改动 ≤10 行 |
| `src/modules/guide/` | 新建 5 文件 | 独立模块，不依赖其他业务模块 |
| `supabase-migration.sql` | 追加 | 建表 + RLS + 初始数据 |

- 路由：不变
- 其他模块：零影响
- 风险等级：低

## 5. UI 规格

### GuideButton

- 图标：`QuestionCircleOutlined`
- 位置：Header 右侧，用户头像左侧
- 样式：白色半透明，hover 高亮

### GuideDrawer

- 组件：Ant Design `Drawer`
- 宽度：420px
- 标题：📖 功能指南
- 内容布局：
  - 顶部 `Tabs`：任务管理 / 部门公告 / 部门论坛 / 个人中心
  - 每个 Tab 下：条目卡片列表
    - 卡片标题行：粗体 title + 右侧编辑/删除图标（负责人可见）
    - 正文：纯文本渲染（`white-space: pre-wrap`），不引入额外依赖
    - 底部灰字：`{编辑者姓名} 编辑于 {时间}`
  - 空状态：Empty 组件 "该模块暂无指南"
  - 底部：`+ 添加条目` 虚线按钮（负责人可见，居中）

### GuideForm（Modal）

- 标题："添加指南" / "编辑指南"
- 表单字段：
  - 标题（Input，必填，max 100）
  - 内容（TextArea，必填，rows=8，提示"支持换行，建议分段描述"）
  - 排序（InputNumber，默认 0）
- 底部按钮：取消 / 保存

## 6. Service 层

```typescript
// guideService.ts

export interface GuideEntry {
  id: string;
  module_key: string;
  title: string;
  content: string;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // join 字段
  creator_name?: string;
  updater_name?: string;
}

// 按模块获取所有指南条目
fetchGuides(moduleKey: string): Promise<GuideEntry[]>

// 创建条目
createGuide(entry: {module_key, title, content, sort_order, created_by}): Promise<GuideEntry | null>

// 更新条目
updateGuide(id: string, updates: {title?, content?, sort_order?, updated_by}): Promise<boolean>

// 删除条目
deleteGuide(id: string): Promise<boolean>
```

## 7. 实现顺序

```
Step 1: supabase-migration.sql   → DDL + RLS + 初始数据
Step 2: guideService.ts          → CRUD + 类型
Step 3: GuideForm.tsx            → 编辑弹窗
Step 4: GuideDrawer.tsx          → 主抽屉（Tabs + 条目渲染）
Step 5: AppLayout.tsx            → Header 加按钮 + state
Step 6: npm run build            → 验证
```

Step 2–4 可并行（独立模块，不影响其他文件），Step 5 因为依赖 GuideDrawer 的接口，建议 Step 4 完成后再做。

## 8. 验收标准

- [ ] Header 右侧显示 `?` 图标按钮，点击打开右侧 Drawer
- [ ] Drawer 按 4 个模块分 Tab，每个 Tab 展示对应指南条目
- [ ] 条目显示标题、正文、编辑者、时间
- [ ] 负责人以上角色可见编辑/删除按钮和添加按钮
- [ ] 普通成员只能查看，无编辑控件
- [ ] 编辑/添加/删除功能正常
- [ ] `npm run build` 无报错
- [ ] 不影响现有侧边栏、菜单、路由等其他功能
