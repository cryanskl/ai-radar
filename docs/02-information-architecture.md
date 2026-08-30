# 02 信息架构

## 1. 目标

信息架构需要同时满足四个看似冲突的目标：

1. 八个内容域直接可发现。
2. 首页在内容很多时仍然克制。
3. 实时 Radar 与长期 Library 可以互相沉淀。
4. 中英文、桌面和移动端都保持清晰。

## 2. 全局导航

### 2.1 桌面端

主内容导航直接按内容和功能划分：

~~~text
AI Radar

Radar
Models
Papers
Products
GitHub
Prompts
Skills
Guides

Search / Ask
Rankings
Open Data
EN / 中文
~~~

中文版：

~~~text
AI Radar

动态
模型
论文
产品
GitHub
提示词
Skills
技巧

搜索 / 问 AI Radar
榜单
开放数据
EN / 中文
~~~

规则：

- Logo 返回当前语言首页。
- 八个内容域保持一级可见，不使用 Build 二次分组。
- Rankings 与 Open Data 属于工具入口，可放在右侧辅助导航。
- Search / Ask 是全局功能，不属于任何单一内容域。
- 窄桌面优先压缩辅助入口文字，不把主内容域拆成两行。

### 2.2 移动端

移动端采用 Feed-first，而不是缩小桌面 Dashboard：

~~~text
Home | Radar | Explore | Search | Saved
~~~

Explore 中包含：

- Models
- Papers
- Products
- GitHub
- Prompts
- Skills
- Guides
- Rankings
- Open Data
- Trust Center

移动端顶部保留：

- Logo。
- 当前语言。
- 搜索入口。
- 可选的订阅或菜单入口。

## 3. 站点地图

### 3.1 公共站点

~~~text
Home
├── Today’s Brief
├── Top Stories
├── Latest / Trending / Featured
├── Domain Highlights
└── Subscribe / Open Source

Radar
├── Latest
├── Trending
├── Featured
├── Daily Briefs
├── Topics
└── Event Detail

Models
├── Directory
├── Benchmarks
├── Compare
├── Pricing & Value
├── Updates
└── Model Detail

Papers
├── Latest
├── Trending
├── Featured
├── Topics
├── Institutions
└── Paper Detail

Products
├── Directory
├── Updates
├── Trending
├── Categories
└── Product Detail

GitHub
├── Trending
├── New & Rising
├── Topics
└── Repository Detail

Prompts
├── Text
├── Image
├── Video
├── Coding
└── Prompt Detail

Skills
├── Codex
├── Claude Code
├── MCP
├── Agents
└── Skill Detail

Guides
├── Getting Started
├── Workflows
├── Configuration
├── Tips
└── Guide Detail

Rankings
├── Model Leaderboards
├── Model Value
├── GitHub Trending
├── Research Trending
├── Product Trending
└── Methodology

Search
├── All
├── Events
├── Models
├── Papers
├── Products
├── GitHub
├── Prompts
├── Skills
└── Guides

Ask AI Radar
├── Question
├── Cited Answer
├── Evidence
└── Related Records

Saved

Open Data
├── Dataset Releases
├── API
├── Schema
├── Sources
├── Licenses
├── Methodology
├── Corrections
└── GitHub Project

Submit
├── Link
├── Prompt
├── Skill
├── Source
└── Error Report

Trust Center
├── Editorial Policy
├── Source Policy
├── Translation Policy
├── Event Deduplication
├── Ranking Methodology
├── AI-generated Content
├── Dataset Licensing
├── Commercial Disclosure
├── Corrections & Takedowns
├── Coverage
├── Known Limitations
└── System Status
~~~

### 3.2 编辑后台

~~~text
Admin
├── Inbox
├── Events
├── Entities
├── Models
├── Papers
├── Products
├── Repositories
├── Prompts
├── Skills
├── Guides
├── Translations
├── Featured
├── Daily Brief
├── Sources
├── Rights
├── Corrections
├── Dataset Releases
└── System Health
~~~

Alpha 只有站长管理角色，不建设复杂多人权限矩阵。

## 4. 首页结构

模块顺序已经确定：

1. 顶部导航。
2. Search / Ask 紧凑输入框。
3. Today’s Brief / 今日摘要。
4. Top Stories / 今日必看。
5. Latest / Trending / Featured 主信息流。
6. Model & Benchmark Updates。
7. Trending Papers。
8. GitHub New & Rising。
9. Product Updates。
10. Prompts & Skills。
11. Guides。
12. Topics / 热门专题。
13. RSS & Email。
14. Open Source & Open Data。
15. Footer / Trust Center。

### 4.1 首屏要求

在常见桌面首屏中至少同时可见：

- 搜索或 Ask 入口。
- 当日简报标题。
- 1–3 条关键事件。

不使用占据大部分首屏的巨大输入框、空泛口号或装饰性 Hero。

### 4.2 信息流

主信息流提供三种显式模式：

- Latest。
- Trending。
- Featured。

不使用一个不透明的“综合推荐”默认替代三者。

### 4.3 首页克制

- 每个域只展示少量高价值记录。
- 全量记录进入对应列表页、筛选和搜索。
- 侧栏在桌面可显示热门主题和短榜单；移动端进入信息流或 Explore。
- 同一事件不因多个来源重复占位。

## 5. Search 与 Ask

### 5.1 统一入口

全局输入框提供两个明确动作：

~~~text
[ Search ] [ Ask AI Radar ]
~~~

### 5.2 Search

目标是快速、精确、可筛选：

- 输入即建议。
- 中英文跨语言召回。
- 按内容类型、主题、时间、语言、来源和实体筛选。
- 返回站内记录，不等待生成式长答案。
- 结果显示命中原因和更新时间。

### 5.3 Ask AI Radar

目标是跨记录综合：

- 只使用可公开的本站数据。
- 答案引用站内记录和原始来源。
- 显示数据截止时间。
- 可以生成比较、时间线和主题摘要。
- 证据不足时说明限制。
- 不把临时全网搜索结果混入正式数据。

## 6. 页面模式

### 6.1 列表页

统一能力：

- Latest、Trending、Featured 或与对象匹配的排序。
- 主题、时间、语言和来源筛选。
- 搜索。
- RSS 入口（适用时）。
- 清晰的空状态和覆盖说明。
- 分页或游标加载不改变排序语义。

### 6.2 详情页

统一骨架：

1. 标题与对象类型。
2. 核心摘要。
3. 原始来源、时间、语言与状态。
4. 稳定属性。
5. 时间线。
6. 正向关系。
7. 反向关系。
8. 局部图谱。
9. 相关事件和实体。
10. 更正与方法入口。

不同对象在稳定属性区域使用各自字段，不强行统一为文章模板。

### 6.3 四种基础组件

| 组件 | 适用 | 核心信息 |
|---|---|---|
| Event Row | 实时信息流 | 时间、类型、标题、摘要、来源数、状态 |
| Entity Card | 模型、论文、产品、仓库、Prompt、Skill | 稳定属性、关联数量、更新时间 |
| Ranking Row | 模型和 GitHub 等可比较对象 | 排名、指标、窗口、变化、方法 |
| Featured Card | 编辑精选 | 重要性、较长摘要、编辑说明、阅读时间 |

## 7. 双语路由

### 7.1 路由

~~~text
/en/...
/zh/...
~~~

示例：

~~~text
/en/radar/events/openai-releases-model-x
/zh/radar/events/openai-releases-model-x

/en/models/model-x
/zh/models/model-x
~~~

底层使用语言无关稳定 ID，Slug 只用于可读 URL，不作为关系主键。

### 7.2 根路径

- 首次访问读取浏览器语言并提供建议。
- 不根据 IP 强制切换。
- 用户选择保存在本地。
- 分享链接始终具有明确语言。

### 7.3 搜索引擎

每个可索引页面需要：

- 自己的 canonical。
- 对应的 en、zh 与 x-default hreflang。
- 同一实体的语言映射。
- 不因 Cookie 返回不同语言正文。
- AI 翻译和来源状态不隐藏。

## 8. 本地收藏与偏好

Alpha 不要求账号。浏览器本地保存：

- 界面语言。
- Global、English、中文等频道偏好。
- 默认排序。
- 收藏内容 ID。
- 已读状态。
- 隐藏内容。
- 主题偏好。

用户清理浏览器数据会丢失这些状态，界面需诚实说明。邮件订阅独立处理，不自动创建账户。

## 9. 响应式与可访问性

### 9.1 响应式

- 桌面是 Dashboard。
- 移动端是单列 Feed-first。
- 表格在移动端使用可读的卡片化或受控横向滚动。
- 详情页关系与局部图在小屏提供列表替代。
- 中英文切换不产生不可控布局跳动。

### 9.2 可访问性

- 所有主要操作支持键盘。
- 焦点状态可见。
- 颜色不是唯一状态信号。
- 排名涨跌同时使用文字或图标。
- 图表提供文本摘要。
- 局部知识图谱提供等价关系列表。
- 图片包含有意义的替代文本；装饰图为空替代文本。
- 语言属性与页面实际语言一致。

## 10. 导航验收摘要

- 八个内容域在桌面一级可见。
- 八个内容域在移动 Explore 一步可达。
- Search 和 Ask 可从任意公共页面进入。
- 语言切换保持同一实体或页面上下文。
- 首页首屏不被装饰性 Hero 占据。
- 详情页从新闻流进入后可以继续探索实体、关系和历史。
- Open Data 与 Trust Center 可从全站公共入口访问。

