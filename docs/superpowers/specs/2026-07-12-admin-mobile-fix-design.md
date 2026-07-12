# 权限管理页面移动端修复 设计文档

> 2026-07-12 | 学生会线上交流平台
> 修复权限管理页面在移动端横向溢出问题

---

## 一、问题

权限管理页面（`MemberManage`）在 768px 以下屏幕出现横向滚动条，页面内容超出视口宽度。

**根因：**
1. 两个 Table 组件未设置 `scroll.x`，Ant Design 无法启用内部横向滚动，表格撑破页面
2. 邀请码管理头部控制栏（2 个 Select + Button）flex 不折行
3. 工作看板 header 的 flex 不折行

---

## 二、修复

### 2.1 MemberManage.tsx

```tsx
<Table scroll={{ x: 'max-content' }} ... />
```

### 2.2 InviteCodeManage.tsx

```tsx
// 头部控制栏
<div style={{ ..., flexWrap: 'wrap', gap: 8 }}>

// 表格
<Table scroll={{ x: 'max-content' }} ... />
```

### 2.3 admin.module.css

```css
@media (max-width: 768px) {
  .overviewHeader {
    flex-wrap: wrap;
    gap: 8px;
  }

  .overviewGrid {
    grid-template-columns: 1fr;
  }
}
```

---

## 三、桌面端影响

零。Table 的 `scroll.x: 'max-content'` 在宽屏下不触发滚动条。flexWrap/gap 在宽屏下不影响单行布局。
