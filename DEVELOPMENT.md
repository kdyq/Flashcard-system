# 翻翻 FanFan · 间隔重复闪卡系统 开发文档

> 版本：1.0（2026-10-24）
> 本文档是项目开发的唯一依据。视觉基准为 `design/b-fanfan.html`（已选定的方向 B 设计稿），交互与动效以该文件中的实现为准。
> 阶段顺序：**P0 → P1 → P2 → P3**，严格按序推进，每阶段完成并通过验收后才进入下一阶段。

---

## 1. 项目概述

### 1.1 目标

一个本地运行的 Anki 类闪卡学习系统：创建正反面卡片（支持 Markdown / LaTeX / 图片），通过 FSRS 间隔重复算法安排复习，实现长期记忆。

### 1.2 范围与约束

| 项 | 决定 |
|----|------|
| 运行方式 | 纯本地：`npm run dev` 启动，浏览器访问。**不做部署**（无 Docker / 服务器 / 域名相关工作） |
| 用户模型 | 单用户，无登录鉴权 |
| 主题 | **仅浅色主题**（用户明确要求不做暗色；深色模式暂不列入任何阶段） |
| 包管理器 | npm |
| 数据所有权 | 数据存本地 SQLite 文件，备份 = 复制文件；不依赖任何云服务 |
| AI（P3） | 默认 `agnes-3.0-flash`，支持自定义任意 OpenAI 协议兼容模型 |

### 1.3 非目标（明确不做）

- 多用户 / 权限系统
- 移动原生 App（响应式 Web 已覆盖手机浏览器场景）
- 云同步（P2 只做本地备份）

---

## 2. 环境与工具链

已验证的机器环境（Windows 11）：

- Node.js v24.16.0、npm 11.13.0、Git 2.53.0
- Python 3.12（非必需）
- npm registry 已配置为 npmmirror（国内镜像，无需改动）

**已知环境问题（重要）**：npm 默认缓存目录 `F:\nodejs\node_cache` 不可写（EPERM）。项目初始化前先执行：

```bash
npm config set cache "F:\MyProject\Flashcard system\.npm-cache"
```

**网络注意**：jsdelivr CDN 在本机不可用。所有第三方库一律走 npm 安装，禁止依赖 CDN 运行时脚本。

| 服务 | 端口 |
|------|------|
| 前端 Vite dev server | 5173 |
| 后端 Express API | 3001 |

---

## 3. 技术栈总览

| 层 | 选型 | 说明 |
|----|------|------|
| 前端框架 | React 18 + TypeScript + Vite | |
| 样式 | Tailwind CSS + CSS 变量设计令牌 | 令牌见第 4 节 |
| 路由 | react-router-dom v7 | |
| 动效 | GSAP 3（npm 包 `gsap`） | 规范见 4.4 |
| 图标 | `@phosphor-icons/react` | 单一图标族，strokeWeight 全局统一；禁止手写 SVG 图标 |
| 内容渲染 | react-markdown + remark-gfm + rehype-katex + katex | LaTeX：`$...$` 行内、`$$...$$` 块级 |
| 后端 | Express 5 + better-sqlite3 | 同步 SQLite，WAL 模式 |
| 间隔重复 | `ts-fsrs`（v4+，含优化器） | FSRS 算法，P2 用于个性化调参 |
| 文件上传 | multer → `server/uploads/`，Express 静态托管 | |
| 进程管理 | 根目录 `concurrently` 同时起前后端 | |

前端通过 Vite proxy 把 `/api` 转发到 3001，开发与生产（本地静态托管）都无需处理 CORS。

---

## 4. 视觉设计规范（方向 B · 翻翻 FanFan）

设计语言：**实体索引卡隐喻**。界面像一叠纸质学习卡：纸张质感、顶部红色横线、朱红印章、手写体点缀。轻快但克制，避免过度拟物。

**唯一视觉基准：`design/b-fanfan.html`**。开发任何界面前先对照该文件；本节摘录其令牌与关键规格。

### 4.1 色彩令牌

```css
:root {
  --bg: #f7f6f2;             /* 页面底色（暖灰白） */
  --paper: #fffdf9;          /* 索引卡纸面 */
  --surface: #ffffff;        /* 普通面板 */
  --ink: #26221c;            /* 主文字（墨色） */
  --ink-2: #4d463b;          /* 次级文字 */
  --muted: #8a8172;          /* 弱化文字 */
  --hairline: #e8e3d8;       /* 细边框 */
  --accent: #c03d2c;         /* 朱红：实色按钮、链接（AA 达标） */
  --accent-bright: #d94f3d;  /* 朱红亮：图形填充、热力图、印章边框 */
  --accent-soft: #fbeeeb;    /* 朱红浅底 */
  --accent-border: #efc9c1;  /* 朱红浅边 */
  --rule: #e9b8ad;           /* 索引卡顶部横线 */
}
```

评分按钮四色（唯一允许的辅助色，仅用于评分语义）：

| 评分 | 底色 | 文字/边框 |
|------|------|-----------|
| 重来 again | #fef3f2 | #b42318 |
| 困难 hard | #fffaeb | #93661a |
| 良好 good | `--accent`（实色） | #fff |
| 简单 easy | #eef2fb | #33529e |

**纪律**：朱红是全局唯一强调色，所有页面统一；热力图用朱红 4 级色阶（`#f3cdc3 / #e9968a / #d94f3d / #a93123`）；禁止引入第 5 种色相。

### 4.2 字体

| 用途 | 字体 | 说明 |
|------|------|------|
| 中文手写（logo、页面大标题、完成页标题） | Zhi Mang Xing | 构建时 self-host（`@fontsource/zhi-mang-xing` 或下载 woff2 本地引入），不依赖 Google Fonts CDN |
| 拉丁手写（大数字、间隔文字） | Caveat | self-host，同上 |
| 正文 | 系统栈 `"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif` | |

标题强调 = 同字体变色（朱红），禁止混入衬线体。

### 4.3 形状与阴影

- 圆角体系：面板/卡片 `12px`；小控件（图标按钮）圆形或 `8px`；按钮、标签 pill（999px）。全局仅此三档。
- 阴影（暖色调，禁纯黑）：
  - `--shadow-sm: 0 1px 3px rgba(66,50,32,.07)`
  - `--shadow-md: 0 1px 3px rgba(66,50,32,.06), 0 12px 30px -12px rgba(66,50,32,.18)`
- 索引卡特征：距顶 22px 一条 2px `--rule` 横线（`.card::before`），纸面用 `--paper`。
- 卡组列表：卡片轻微旋转错落（奇数 `-0.7deg`、偶数 `0.6deg`，hover 归正并上浮）；左侧色条用 `--accent-bright` 不同透明度区分（0.22~1）。
- 印章元素：圆形 2.5px `--accent-bright` 描边、旋转 8°、朱红文字；用于顶栏连续天数、学习完成页。

### 4.4 动效规范（GSAP）

所有动效必须可在一句话内说明动机（状态切换/反馈/层次）。`prefers-reduced-motion: reduce` 时全部时长归零（统一封装 `const D = t => reduced ? 0.01 : t`）。

核心规格（照搬设计稿实现）：

| 交互 | 时间线 | 动机 |
|------|--------|------|
| **卡牌翻面** | `rotationY: 0→90`（power2.in, .3s，同时 `scale:1.03, y:-8` 抬升）→ 侧面时交换正/背内容 → `90→0`（back.out(1.6), .36s 回落） | 半翻交换法：避免 backface-visibility 兼容性问题 |
| **评分落章** | 印章 `scale:2.2→1, rotation:-24→-10, autoAlpha:0→1`（back.out(2.4), .32s）停留 .15s 后淡出，随后卡牌出场 | 评分反馈 |
| **卡牌出场** | `x: ±480, rotation: ±10, autoAlpha:0`（power2.in, .45s），重来向左、其余向右 | 结果方向感 |
| **新卡入场** | `y:40, scale:.94, autoAlpha:0 → 正常`（back.out(1.5), .55s） | 队列推进 |
| 仪表盘卡组入场 | `y:26, rotation:±2.5` stagger .08（back.out(1.7)） | 层次引入 |
| 热力图入场 | 单格 `scale:0` stagger `{each:.004, from:"random"}`（back.out(2.5)） | 活跃感 |
| 印章徽章入场 | `scale:1.9, rotation:30 → 1/8°`（back.out(2.2)） | 盖章瞬间 |
| 学习页进度条 | `scaleX` 补间（transform-origin:left），禁用 width | 性能 |

实现约定：

- 只动画 `transform`/`opacity`/`autoAlpha`；禁止动画 width/height/top/left。
- 翻面用 `perspective: 1500px` 的场景容器 + `transform-style: preserve-3d`。
- 学习卡片底部垫 2 张错位"影子卡"（rotate 2.4°/-2°，y 偏移 8/16px），表现卡堆。
- React 中动效组件一律 `'use client'` 叶子组件 + `useEffect` 内 `gsap.context()` 并在 cleanup 中 `ctx.revert()`。

### 4.5 复用组件清单（与设计稿一一对应）

| 组件 | 要点 |
|------|------|
| `IndexCard` | 纸面 + 顶部横线 + 阴影，可带旋转角 |
| `Stamp` | 圆形印章（数字/文字两种内容） |
| `RatingBar` | 四个评分按钮，各带 kbd 序号与间隔预览（`<1分钟 / 10分钟 / 1.2天 / 3.5天` 为真实 FSRS 预览值） |
| `StudyCard` | 卡堆 + 翻面 + 落章（学习页核心组件） |
| `DeckCard` | 卡组纸片（色条、名称、张数、待复习数、进度点、翻牌按钮） |
| `Heatmap` | 18 周 × 7 格，朱红 4 级 |
| `Toast` | 底部居中胶囊提示 |
| `MarkdownView` | react-markdown + KaTeX 封装，卡片内容统一入口 |

---

## 5. 项目结构

```
F:\MyProject\Flashcard system\
├─ DEVELOPMENT.md            # 本文档
├─ design/                   # 设计稿（视觉基准，保留）
│  └─ b-fanfan.html          # ★ 选定方向
├─ package.json              # 根脚本：dev / build / start（concurrently）
├─ .gitignore                # node_modules / server/data / server/uploads / .npm-cache
├─ client/                   # 前端
│  ├─ package.json
│  ├─ vite.config.ts         # proxy: /api → http://localhost:3001
│  ├─ index.html
│  └─ src/
│     ├─ main.tsx            # Router 入口
│     ├─ styles/tokens.css   # 第 4 节设计令牌 + Tailwind 引入
│     ├─ components/         # 4.5 组件清单
│     ├─ pages/              # Dashboard / Study / Decks / Browse / Stats / Settings / AIStudio
│     ├─ api/                # fetch 封装（统一错误处理）
│     ├─ hooks/              # useStudySession / useShortcuts 等
│     └─ utils/
└─ server/
   ├─ package.json
   ├─ index.ts               # Express 入口、静态托管 uploads、错误中间件
   ├─ db.ts                  # better-sqlite3 初始化、migration、PRAGMA(foreign_keys, WAL)
   ├─ fsrs.ts                # ts-fsrs 封装（调度、队列、间隔预览）
   ├─ routes/                # decks / cards / study / stats / search / io / media / ai / settings
   ├─ data/                  # flashcard.db（gitignore）
   └─ uploads/               # 图片音频（gitignore）
```

根脚本：

```json
{
  "scripts": {
    "dev": "concurrently \"npm --prefix server run dev\" \"npm --prefix client run dev\"",
    "build": "npm --prefix client run build",
    "start": "concurrently \"npm --prefix server start\" \"npm --prefix client run preview\""
  }
}
```

---

## 6. 数据库设计（SQLite）

启用 `PRAGMA foreign_keys=ON`、`journal_mode=WAL`。所有时间存 ISO 8601 UTC 字符串。

### decks 卡组

| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | |
| name | TEXT NOT NULL | |
| parent_id | INTEGER NULL | 自引用，支持嵌套（`::` 分隔展示，如 `计算机::网络`） |
| sort_order | INTEGER | 同级排序 |
| created_at | TEXT | |

### cards 卡片

| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | |
| deck_id | INTEGER NOT NULL | FK → decks，ON DELETE CASCADE |
| note_id | TEXT NULL | P1 双向卡：同属一个 note 的两张卡共享此 id |
| type | TEXT NOT NULL | `basic` / `cloze` / `reversed`（P0 仅 basic，字段预留） |
| front_md | TEXT NOT NULL | 正面 Markdown |
| back_md | TEXT | 背面 Markdown |
| --- FSRS 状态（ts-fsrs Card 序列化） --- | | |
| due | TEXT NOT NULL | 下次到期时间 |
| stability | REAL | 稳定性 |
| difficulty | REAL | 难度 |
| state | TEXT | `new / learning / review / relearning` |
| reps / lapses | INTEGER | 复习次数 / 遗忘次数 |
| last_review | TEXT NULL | |
| elapsed_days / scheduled_days | INTEGER | |
| --- | | |
| suspended | INTEGER DEFAULT 0 | P1 暂停 |
| buried_until | TEXT NULL | P1 搁置 |
| created_at / updated_at | TEXT | |

### review_logs 复习日志（不可修改，撤销 = 删除最后一条并回滚卡片状态）

`id, card_id(FK), rating(1-4), state_before, stability_before, stability_after, difficulty_after, due_after, elapsed_days, scheduled_days, review_time` + `is_undo_of INTEGER NULL`（P1 多步撤销用，P0 单步撤销直接删）

### tags / card_tags

`tags(id, name UNIQUE)`；`card_tags(card_id, tag_id, 联合主键)`。

### settings 键值表

`key TEXT PK, value TEXT(JSON)`。已知键：

| 键 | 默认值 | 说明 |
|----|--------|------|
| `daily_new_limit` | 20 | 每日新卡上限 |
| `daily_review_limit` | 200 | 每日复习上限 |
| `fsrs_params` | null | P2 个性化参数（null = 库默认） |
| `ai_base_url` | `https://api.agnes-ai.cn/v1` | P3 |
| `ai_model` | `agnes-3.0-flash` | P3 |
| `ai_api_key` | 空 | P3，仅存本地 |
| `ai_enabled` | false | P3 |
| `reminder_enabled` / `reminder_time` | false / "20:00" | P2 |
| `backup_keep` | 7 | P2 自动备份保留份数 |

### media

`id, filename, mime, size, created_at`。文件名用 `时间戳-随机串.扩展名` 防冲突。

**Migration 策略**：`user_version` PRAGMA + 顺序迁移脚本数组；首次启动建全量表（含 P1/P2 字段），后续阶段只做数据回填，避免反复改表。

---

## 7. FSRS 调度逻辑

### 7.1 核心

- 使用 `ts-fsrs` 的 `fsrs()` + `repeat()/next()`：输入当前卡片状态 + 评分（1 重来 / 2 困难 / 3 良好 / 4 简单），得到新状态与日志。
- 评分后**在按钮上实时预览各评分的下次间隔**（`preview()` 对四个 rating 各算一遍，格式化：`<1分钟 / 10分钟 / 1.2天 / 3.5天`）。
- P2 个性化：累计 ≥400 条日志后用 ts-fsrs 的 optimizer 在设置页手动触发，结果写入 `fsrs_params`。

### 7.2 每日队列构建（GET /api/study/queue）

```
1. 复习队列：state != new AND due <= now AND NOT suspended，按 due 升序，截取 daily_review_limit 剩余额度
2. 学习中卡片（learning/relearning 且 due 在今日内）最高优先，插队到队首
3. 新卡队列：state = new，截取「今日新卡配额」= daily_new_limit - 今日已学新卡数
4. 交织策略：默认每 3 张复习卡后插 1 张新卡（Anki 行为，常数可调）
5. 返回带序队列，前端顺序出卡
```

已学计数以 review_logs 当日记录为准（按本地时区日界，需记录 `day_key = YYYY-MM-DD` 本地日期列）。

### 7.3 撤销（P0 单步）

`POST /api/study/undo`：删除该卡今天最后一条 review_log，把卡片 FSRS 字段恢复为 `state_before/stability_before` 等（日志里已存），due 恢复为评分前的 due。仅允许撤销最近一次评分。

---

## 8. API 设计（REST，前缀 /api）

| 方法 | 路径 | 说明 | 阶段 |
|------|------|------|------|
| GET | /decks | 卡组树（含每组的总数/到期数/新卡数） | P0 |
| POST | /decks | 创建（name, parent_id） | P0 |
| PATCH | /decks/:id | 重命名 / 移动 / 排序 | P0 |
| DELETE | /decks/:id | 删除（级联卡片，需前端二次确认） | P0 |
| GET | /cards?deckId=&q=&tag=&page= | 卡片列表/搜索 | P0 |
| POST | /cards | 创建（支持批量 body: cards[]） | P0 |
| PATCH | /cards/:id | 编辑内容/移动/改标签 | P0 |
| DELETE | /cards/:id | 删除 | P0 |
| GET | /cards/:id/logs | 单卡复习历史 | P1 |
| POST | /cards/:id/reset | 重置进度为 new | P1 |
| POST | /cards/batch | 批量操作（移动/删除/加标签/暂停） | P1 |
| GET | /study/queue?deckId= | 今日学习队列 | P0 |
| POST | /study/review | {cardId, rating} → 返回新间隔与进度 | P0 |
| POST | /study/undo | 撤销最近一次评分 | P0 |
| POST | /study/suspend / bury | 暂停/搁置当前卡 | P1 |
| GET | /stats/dashboard | 今日数字、连续天数、保留率 | P0 |
| GET | /stats/heatmap?weeks=18 | 热力图 | P0 |
| GET | /stats/forecast?days=30 | 未来负荷 | P0 |
| GET | /search?q= | 全文搜索（卡片正反面 + 标签，LIKE 实现，P1 升级 FTS5） | P0 |
| GET | /export | 全量 JSON 导出（下载） | P0 |
| POST | /import | CSV / JSON 导入 | P0 |
| POST | /media | 图片/音频上传 → {url} | P0 |
| GET/PUT | /settings | 设置读写 | P0 |
| POST | /ai/generate | {text, deckId, count} → 卡片草稿数组 | P3 |
| POST | /ai/test | 连通性测试 | P3 |

约定：错误统一 `{error: string}` + 恰当 HTTP 状态码；Express 全局错误中间件兜底。

---

## 9. 页面与路由

| 路由 | 页面 | 内容 | 阶段 |
|------|------|------|------|
| `/` | 仪表盘 | 问候（手写体标题）、今日索引卡（待复习/新卡 + 开始翻牌）、卡组堆、打卡日历、连续天数印章 | P0 |
| `/study/:deckId?` | 学习页 | 卡堆、翻面、四键评分（含间隔预览）、落章动效、进度条、撤销、快捷键 | P0 |
| `/decks` | 卡组管理 | 树形卡组、新建/改名/移动/删除 | P0 |
| `/browse` | 卡片浏览器 | 表格视图：搜索、按卡组/标签筛选、批量操作、单卡复习历史 | P1 |
| `/stats` | 统计 | 热力图、保留率、未来负荷、streak（P0 基础三件套 → P2 完整版） | P0/P2 |
| `/settings` | 设置 | 每日上限、导入导出入口、（P2）备份/提醒/FSRS 调参、（P3）AI 配置 | P1/P2/P3 |
| `/ai` | AI 工作台 | 粘贴笔记 → 生成草稿 → 勾选入库 | P3 |

学习页快捷键（P0 即实现，与设计稿一致）：`空格` 翻面、`1-4` 评分、`Z` 撤销、`Esc` 退出学习。

卡片编辑器（P0，弹层组件）：正/背面 Markdown 双栏（编辑 + 实时预览），工具栏插入图片（点击上传/拖拽/粘贴三种方式，上传后插入 `![](url)`）、插入 LaTeX、插入填空模板（P1 生效）；标签输入（逗号分隔自动补全）。

---

## 10. 阶段计划与验收标准

### P0 · 核心闭环

**功能清单**

1. 卡片 CRUD：Markdown + KaTeX + 图片上传（拖/贴/选）
2. 卡组管理：嵌套、改名、移动、删除
3. FSRS 引擎：四键评分 + 间隔实时预览 + 学习/复习队列 + 每日新卡/复习上限
4. 撤销最近一次评分
5. 标签：增删、按标签筛选
6. 搜索：正反面 + 标签
7. 导入导出：JSON 全量备份 / 恢复；CSV 导入（含 Anki 导出的 CSV，导入时剥离 HTML 标签）
8. 统计：仪表盘今日数字、热力图、保留率、未来负荷
9. 视觉：按第 4 节完整落地 B 方向（浅色、令牌、GSAP 动效全套、响应式到手机宽度）

**验收标准**

- [ ] 创建卡组 → 录入 10 张卡（含一张 LaTeX、一张图片）→ 完整学习一轮：翻面、四键评分、间隔预览与实际一致
- [ ] 评分后关浏览器重开，到期时间与进度不丢失
- [ ] 撤销最近评分后，卡片状态恢复到评分前
- [ ] 新卡/复习上限生效（改小上限验证）
- [ ] CSV 导入 Anki 导出文件成功；JSON 导出→清库→导入还原一致
- [ ] 仪表盘热力图/保留率/负荷随复习记录变化
- [ ] 手机宽度（375px）学习页可用，卡片与评分按钮不溢出
- [ ] `prefers-reduced-motion` 下无动画但功能完整

### P1 · 复习体验

1. 填空卡：`{{c1::文字}}` 语法，正面渲染为下划线空格，背面高亮答案；同一卡多个挖空（c1/c2/c3 轮流出题）
2. 双向卡：一个笔记生成正→反、反→正两张卡（note_id 关联，共享编辑）
3. 卡片浏览器（/browse）：表格、筛选、批量移动/删除/加标签/暂停
4. 单卡复习历史时间线
5. 重置卡片进度
6. 暂停（suspend）/ 搁置（bury 到明日）
7. 多步撤销（会话内）
8. 快捷键补全（浏览器内 `E` 编辑当前卡、`@` 暂停等，实现时细化）
9. 响应式完善：仪表盘、卡组管理在手机可用

**验收**：填空卡完整流程（挖空渲染 → 翻面高亮 → 重来只回退当前挖空项）；浏览器批量操作 50 张卡无误；双向卡两张进度独立但内容联动编辑。

### P2 · 进阶增强

1. FSRS 个性化调参（≥400 条日志后在设置页一键优化）
2. TTS 朗读（Web Speech API，卡片编辑器可标记「自动朗读正面」）
3. 音频卡片：上传音频，可设置「自动播放/点击播放/作为问题」
4. 浏览器通知提醒（settings 中的 reminder_*，Notification API + 前端定时检查）
5. 自动备份：每日首次启动时复制 db 到 `server/data/backups/`，保留 N 份
6. 打卡 streak 强化（日历页、最长连续记录）

**验收**：调参前后未来负荷曲线可见变化；备份文件可直接还原；通知按设定时间触发。

### P3 · AI 生成卡片

1. 设置页 AI 配置：base_url（默认 `https://api.agnes-ai.cn/v1`）、model（默认 `agnes-3.0-flash`）、api_key、启用开关 + 「测试连接」
2. `/ai` 工作台：粘贴一段笔记 → 选目标卡组与张数（默认 5，上限 20）→ 后端转发 OpenAI Chat Completions（`POST {base_url}/chat/completions`，`Authorization: Bearer key`）→ 返回结构化卡片草稿
3. Prompt 约定（system）：输出 JSON 数组 `[{front, back, tags[], type}]`，要求问答聚焦单一知识点、可含 LaTeX、禁止编造笔记外内容；`response_format: json_object` 优先，失败降级正则抽取
4. 草稿列表可逐条编辑/勾选，确认后批量入库
5. API Key 只存本地 SQLite，请求全部经后端转发（浏览器不直连）

**验收**：填入 Agnes Key 后一键生成 5 张可用卡；换 base_url+model 指向另一 OpenAI 兼容服务同样可用；Key 不出现在任何前端日志。

---

## 11. 导入导出格式

### JSON（全量备份）

```json
{
  "format": "fanfan-export",
  "version": 1,
  "exported_at": "...",
  "settings": {...},
  "decks": [...],
  "cards": [{...含 FSRS 状态...}],
  "review_logs": [...],
  "tags": [...], "card_tags": [...]
}
```

导入策略：默认「合并」（按内容指纹 front+back+deck 去重），可选「覆盖」（清库重建，需二次确认）。

### CSV（导入）

表头 `front,back,tags`（UTF-8，逗号分隔，引号转义；tags 空格分隔多个）。兼容 Anki「Notes in plain text」导出：检测到 HTML 标签时剥离，`<br>` 转换行。

---

## 12. 编码规范

- TypeScript `strict`；后端同 tsx 直跑（`tsx watch index.ts`）。
- 组件文件 PascalCase；工具函数 camelCase；DB 一律经 server 访问，前端不碰 SQL。
- 每个阶段完成即打 git tag（`p0`、`p1`…）；项目初始化时 `git init`。
- 提交信息中文，格式 `阶段|模块: 摘要`，如 `P0|study: 实现翻面与评分动效`。
- 动效封装在组件内，禁止散落的 `gsap.to` 字符串选择器跨组件引用。
- 禁止引入运行时 CDN 依赖（本机 jsdelivr 不可用）。

---

## 13. 里程碑总览

| 里程碑 | 内容 | 完成标志 |
|--------|------|----------|
| M0 | 项目脚手架：目录、双端跑通、设计令牌落地、路由骨架 | `npm run dev` 一条命令起全站 |
| M1 | P0 全部功能 | 第 10 节 P0 验收清单全过 |
| M2 | P1 | 填空/双向卡 + 浏览器可用 |
| M3 | P2 | 调参/备份/通知可用 |
| M4 | P3 | AI 生成入库闭环 |

---

## 附：关键参考

- 视觉与交互唯一基准：`design/b-fanfan.html`（含全部动效时间线参数）
- FSRS 算法库：ts-fsrs（npm）
- Agnes 模型文档：https://agnes-ai.cn/zh-Hans/docs/agnes-30-flash （OpenAI 兼容 Chat Completions，512K 上下文）
- 原始需求讨论与三套设计稿对比：`design/index.html`
