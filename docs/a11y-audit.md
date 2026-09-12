# 无障碍审计报告（自动生成）

> 生成时间：2026-09-12T16:06:14.437Z · 工具：axe-core（wcag2a / wcag2aa / wcag21a / wcag21aa）
> 扫描页面：登录页 · 工作台 · 任务管理 · 部门公告 · 部门论坛 · 活动抢票 · 权限管理 · 个人中心
> 重新生成：`npx playwright test tests/e2e/a11y.spec.ts`（会同时跑回归门禁）

## 总览

| 影响级别 | 条数 | 含义 |
|---------|------|------|
| critical | 0 | 读屏用户完全无法使用，**门禁卡这一级** |
| serious  | 8 | 明显障碍，本轮修高频路径，其余留待下轮 |
| moderate | 0 | 体验受损 |
| minor    | 0 | 吹毛求疵 |

合计 8 条规则命中。

## 明细

| 页面 | 规则 | 级别 | 问题 | 节点 | 命中位置 |
|------|------|------|------|:----:|------|
| 部门公告 | `color-contrast` | serious | Elements must meet minimum color contrast ratio thresholds | 5 | `._subtitle_n77m5_38` `.ant-tag` `._cardTitle_lr7ug_38` |
| 部门论坛 | `color-contrast` | serious | Elements must meet minimum color contrast ratio thresholds | 6 | `._subtitle_n77m5_38` `.ant-card.ant-card-bordered._postCard_1aptr_30:nth-child(2) > .ant-card-body > ._postTitle_1aptr_45` `.ant-card.ant-card-bordered._postCard_1aptr_30:nth-child(2) > .ant-card-body > ._postMeta_1aptr_51 > .ant-tag.ant-tag-filled.css-var-_r_0_` |
| 登录页 | `color-contrast` | serious | Elements must meet minimum color contrast ratio thresholds | 2 | `.ant-btn-link > span:nth-child(2)` `._tipText_14an7_145` |
| 个人中心 | `color-contrast` | serious | Elements must meet minimum color contrast ratio thresholds | 81 | `._statCard_1qqla_13.ant-card.ant-card-bordered:nth-child(1) > .ant-card-body > .ant-statistic.css-var-_r_0_.css-dev-only-do-not-override-9injdo > .ant-statistic-header > .ant-statistic-title` `._statCard_1qqla_13.ant-card.ant-card-bordered:nth-child(2) > .ant-card-body > .ant-statistic.css-var-_r_0_.css-dev-only-do-not-override-9injdo > .ant-statistic-header > .ant-statistic-title` `._statCard_1qqla_13.ant-card.ant-card-bordered:nth-child(3) > .ant-card-body > .ant-statistic.css-var-_r_0_.css-dev-only-do-not-override-9injdo > .ant-statistic-header > .ant-statistic-title` |
| 工作台 | `color-contrast` | serious | Elements must meet minimum color contrast ratio thresholds | 16 | `p` `div:nth-child(3) > ._statCard_1by8x_32._quickBtn_1by8x_220.ant-card > .ant-card-body` `div[aria-label="待审核任务"] > .ant-card-body > ._top_1l7p5_12 > ._label_1l7p5_29` |
| 活动抢票 | `color-contrast` | serious | Elements must meet minimum color contrast ratio thresholds | 20 | `.ant-card.ant-card-bordered._ticketCard_1itz9_51:nth-child(1) > .ant-card-body > ._cardBody_1itz9_97 > ._cardMeta_1itz9_117 > span:nth-child(1)` `.ant-card.ant-card-bordered._ticketCard_1itz9_51:nth-child(1) > .ant-card-body > ._cardBody_1itz9_97 > ._cardMeta_1itz9_117 > span:nth-child(2)` `.ant-card.ant-card-bordered._ticketCard_1itz9_51:nth-child(1) > .ant-card-body > ._cardBody_1itz9_97 > ._cardMeta_1itz9_117 > span:nth-child(3)` |
| 权限管理 | `color-contrast` | serious | Elements must meet minimum color contrast ratio thresholds | 3 | `.ant-select-placeholder` `.ant-tag` `.ant-btn-dangerous > span` |
| 任务管理 | `color-contrast` | serious | Elements must meet minimum color contrast ratio thresholds | 16 | `div[title="看板"]` `._taskCardNormal_1o3cs_38.ant-card.ant-card-bordered:nth-child(4) > .ant-card-body > ._cardMeta_1o3cs_49 > .ant-tag.ant-tag-filled.css-var-_r_0_:nth-child(1)` `._taskCardNormal_1o3cs_38.ant-card.ant-card-bordered:nth-child(4) > .ant-card-body > ._cardMeta_1o3cs_49 > .ant-tag.ant-tag-filled.css-var-_r_0_:nth-child(2)` |

## 本次覆盖的检查项

- **axe-core 静态规则**（wcag2a / wcag2aa / wcag21a / wcag21aa）：上面明细里的全部条目；
- **登录页键盘可达性**：真的按 Tab 走一遍，断言「学号」与提交按钮都能聚焦且顺序不越级
  （实测顺序：姓名 → 学号 → 部门邀请码 → 继续 → 开发者，无越级；axe 查不出这一项）；
- **尚未覆盖**：颜色对比度之外的视觉无障碍（放大/缩放、动效偏好 `prefers-reduced-motion` 的实际生效）、
  屏幕阅读器实机朗读、非登录页的焦点顺序。

## 修复原则（本项目约定）

- **不改主题风格**：对比度类问题优先用 `src/utils/themeColors.ts` 的语义令牌解决，不硬编码颜色、不动整体视觉；
- **表单控件必须有可访问名**：`Form.Item` + `label` 已覆盖大部分；筛选栏这类不在 Form 里的控件用 `aria-label`；
- **只有图标的按钮必须有可访问名**：`aria-label`（antd 的 Tooltip 会补 `aria-describedby`，但不补按钮名）；
- **装饰性图形用 `alt=""` / `aria-hidden`**，不要塞无意义文本；
- 本轮只修「登录 / 工作台 / 任务 / 公告 / 论坛」这条高频路径，低频后台页列入下轮。
