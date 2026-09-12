# 外部拨测（Phase 4 · D2）

> 建立于 2026-09-12（v4.6.0）。目标：**在用户反馈之前就知道线上挂了**。

## 为什么需要它

现有的两层监控各有盲区：

| 机制 | 覆盖 | 盲区 |
|------|------|------|
| `supabase-keepalive.yml` | 每 3 天打一次 Supabase REST，防止免费版项目被暂停 | 只在**事后**保活；GitHub Pages 挂没挂、页面是否可访问，它不知道 |
| GitHub Actions 部署流水线 | 构建/部署是否成功 | 部署成功 ≠ 站点可访问（CDN、DNS、Pages 服务本身出问题它都不管） |

外部拨测补的就是「从公网看，这个站现在还活着吗」。

## 配置步骤（UptimeRobot 免费档，约 3 分钟，需你注册）

免费档：50 个监控、5 分钟检查间隔、支持邮件告警——对本项目足够。

1. 注册 <https://uptimerobot.com> → Add New Monitor，建**两个**监控：

| 监控名 | Monitor Type | URL / 设置 | 判活条件 |
|--------|--------------|-----------|----------|
| `学生会平台-首页` | HTTP(s) | `https://yhllxy.github.io/student-union-platform/` | HTTP 200 |
| `学生会平台-版本文件` | HTTP(s) + Keyword | `https://yhllxy.github.io/student-union-platform/version.json` | HTTP 200 **且** 页面含关键字 `"version"` |

> 第二个监控用 **Keyword**（关键字）类型而不是普通 HTTP：因为 GitHub Pages 对不存在的路径会返回 404 页而不是错误码，只有关键字检查能确认「返回的确实是版本 JSON 本体」。它的另一个用处是——**version.json 的内容变了就说明部署生效了**，拨测历史顺便成了发布记录。

2. Alert Contacts：填你的邮箱（免费档默认发邮件）。建议再加一个 Telegram/企业微信 webhook（UptimeRobot 支持 Webhook 类型），手机上能收到。
3. 两台监控的 `Monitoring Interval` 都设 **5 minutes**。
4. 建完点进去看 `Response Time` 曲线有数据即配置成功。

### 可选第三个：直接拨 Supabase

上面两个只证明「静态站点活着」。若想连后端一起拨：

| Monitor Type | URL | Header | 判活 |
|--------------|-----|--------|------|
| HTTP(s) | `https://bbyykrgitgawqwdgcxhp.supabase.co/rest/v1/` | `apikey: <VITE_SUPABASE_ANON_KEY 的值>` | HTTP 200 |

anon key 本来就是打包进前端 JS 的公开值（本地 `.env` 里的 `VITE_SUPABASE_ANON_KEY`），填进第三方监控不增加暴露面。**不要把 service_role key 填进去。**

## 本地一键体检（不发通知，只想立刻确认时用）

```bash
# 首页可达性 + 版本文件的版本号
curl -sI "https://yhllxy.github.io/student-union-platform/" | head -1
curl -s "https://yhllxy.github.io/student-union-platform/version.json"

# Supabase REST 是否活着（200 即活；body 是 [] 说明只是 RLS 拦了匿名行，属正常）
curl -s -o /dev/null -w '%{http_code}\n' \
  "$VITE_SUPABASE_URL/rest/v1/users?select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY"
```

## 出事时的判断顺序（与 CLAUDE.md「线上问题排查优先级」一致）

1. 两个监控**都红** → 先看 GitHub Pages 服务状态与最近一次 Actions 运行（可能部署失败）；
2. 只有「首页」红、「版本文件」绿 → 大概率是应用入口 JS 报错（Pages 在、应用崩了），打开浏览器控制台；
3. 两个都绿但用户说不能用 → 多半是 Supabase 侧（项目被暂停 / 配额），看 Keepalive 工作流的历史与 Supabase Dashboard；
4. 以上都正常才怀疑代码——并遵循「本地正常 + 线上异常 → 先查部署，最后才怀疑代码」。
