# 06 Public Alpha PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 产品 | AI Radar |
| 阶段 | Public Alpha |
| 目标周期 | 一人加 AI，4–6 周 |
| 目标市场 | 全球 |
| 产品语言 | English / 中文 |
| 登录要求 | 不强制登录 |
| 文档状态 | Design Baseline v0.1 |

## 2. 产品摘要

AI Radar 是面向全球 AI 深度用户的双语 All-in-One 信息产品。Public Alpha 同时提供：

- 实时信息雷达。
- 八类 AI 内容资料库。
- 透明榜单与趋势。
- 实体档案、双链和局部知识图谱。
- 统一 Search 与基于本站数据的 Ask Agent。
- 中英文 RSS 与邮件日报。
- 版本化只读公共 API。
- 开源代码与权利过滤后的开放数据快照。

Public Alpha 的承诺不是“已经收录整个 AI 世界”，而是证明一个可持续闭环：发现、核验、去重、本地化、连接、检索、解释和开放。

## 3. 目标与非目标

### 3.1 发布目标

1. 用户在五分钟内了解当日最重要的全球 AI 变化。
2. 用户能从一条新闻进入相关模型、论文、代码、产品和历史事件。
3. 用户能跨中英文搜索八个内容域。
4. 用户能向 Agent 提问，并得到只基于站内数据、带引用和截止时间的回答。
5. 每个内容域都有真实列表、详情和关系数据，不出现空壳入口。
6. 运营者能用极小后台完成去重、翻译、精选、权利审核和更正。
7. 外部开发者能通过公共 API 或数据快照复用允许开放的数据。

### 3.2 非目标

Public Alpha 不建设：

- 用户账号、云端同步和社交关系。
- 评论区、点赞社区或创作者收益系统。
- 任意互联网搜索 Agent。
- 替用户安装 Skill、运行 Prompt 或执行 Agent 工具。
- API Key 托管、模型代理调用或统一计费。
- 原生移动应用、PWA Push 或桌面客户端。
- 全局大型力导向知识图谱。
- Obsidian 导出或双向同步。
- 覆盖所有任务的模型万能总榜。
- 未授权的新闻全文、Prompt/Skill 全文或第三方数据镜像。
- 复杂多人 CMS、企业权限矩阵和工作流引擎。
- 付费套餐；只预留清晰边界，不在 Alpha 收费。

## 4. 核心用户

### 4.1 第一类：前沿开发者

关注模型能力、API 变化、GitHub 项目、Agent、Skill、价格和配置。

关键任务：

- 今天有哪些会影响开发工作的变化？
- 某个模型适合哪类任务，价格和限制是什么？
- 哪些新仓库正在上升，是否有明确 License？
- 某项能力来自哪篇论文、模型和实现？

### 4.2 第二类：研究者、产品经理、创作者与创始人

关注论文、产品、行业事件、工具、工作流和可复用方法。

关键任务：

- 一个主题过去几个月发生了什么？
- 哪篇论文已经有代码、模型或产品落地？
- 哪些工具或工作流值得尝试？
- 如何在中英文信息之间消除时间差？

## 5. 核心用户旅程

### 5.1 每日浏览

~~~text
Home
  -> Today's Brief
  -> Top Stories
  -> open Event
  -> inspect sources and related entities
  -> save locally or subscribe to RSS/email
~~~

成功条件：首次用户不搜索也能在五分钟内获得高信噪比概览。

### 5.2 主题研究

~~~text
Search or Ask
  -> bilingual results or cited answer
  -> Entity detail
  -> timeline and backlinks
  -> related papers/repos/products
  -> original sources
~~~

成功条件：用户能从结论回到站内记录和原始来源。

### 5.3 模型选择

~~~text
Models
  -> select scenario and constraints
  -> compare benchmark, price, context and availability
  -> open model profile
  -> inspect methodology and evidence
~~~

成功条件：页面明确说明适合、不适合和证据不足，不输出万能答案。

### 5.4 开放数据复用

~~~text
Open Data
  -> choose release
  -> inspect schema, rights and manifest
  -> download canonical release or verified mirror
  -> consume corrections and tombstones
~~~

成功条件：用户可以验证版本和校验和，并知道每条记录的权利边界。

## 6. 功能优先级

| 优先级 | 定义 |
|---|---|
| P0 | 不满足则不能公开发布 |
| P1 | Alpha 应完成；个别降级不阻止内部演示，但阻止对外宣称完整支持 |
| P2 | 可在 Alpha 后补充，不出现在发布承诺中 |

## 7. 全局体验需求

### 7.1 导航

| ID | 优先级 | 需求 |
|---|---|---|
| NAV-01 | P0 | 桌面顶部直接展示 Radar、Models、Papers、Products、GitHub、Prompts、Skills、Guides 八个主域 |
| NAV-02 | P0 | Search/Ask、Rankings、Open Data 和语言切换作为全局工具入口 |
| NAV-03 | P0 | 移动端底部为 Home、Radar、Explore、Search、Saved |
| NAV-04 | P0 | Explore 中展示八个主域，不能让移动端用户失去内容入口 |
| NAV-05 | P0 | 当前域、筛选、语言和时间窗口状态可被 URL 表达 |
| NAV-06 | P1 | 面包屑和实体关系链接能返回上一层内容语境 |

### 7.2 页面视觉

| ID | 优先级 | 需求 |
|---|---|---|
| UI-01 | P0 | 采用 editorial + intelligence dashboard 风格，高密度但克制 |
| UI-02 | P0 | 不使用占满首屏的大 Hero、赛博朋克背景或泛用 AI 渐变 |
| UI-03 | P0 | Event Row、Entity Card、Ranking Row、Featured Card 四类组件视觉语义稳定 |
| UI-04 | P0 | 来源、时间、语言、内容类型和排名标签可快速扫描 |
| UI-05 | P0 | Featured 与 Sponsored、Trending 清晰区分 |
| UI-06 | P1 | 桌面和移动端均支持明暗主题，前提是不影响六周核心范围 |

### 7.3 无障碍与性能

| ID | 优先级 | 需求 |
|---|---|---|
| NFR-01 | P0 | 核心页面键盘可操作，焦点状态可见，语义结构可被辅助技术理解 |
| NFR-02 | P0 | 文本与关键控件达到 WCAG AA 对比度目标 |
| NFR-03 | P0 | 图片非核心时可延迟加载，核心信息不依赖图片才能理解 |
| NFR-04 | P0 | 列表分页或游标稳定，不因数据更新重复或漏项 |
| NFR-05 | P0 | 公共页面在无 JavaScript 的搜索抓取环境中仍能获得主要内容与元数据 |
| NFR-06 | P1 | 核心页面以移动中档设备为基准控制脚本与图片体积 |

## 8. 首页

### 8.1 模块顺序

首页必须按以下信息节奏组织：

1. Top navigation。
2. Compact Search / Ask。
3. Today’s Brief。
4. Top Stories。
5. Latest / Trending / Featured 主信息流。
6. Models / Benchmark Updates。
7. Trending Papers。
8. GitHub New & Rising。
9. Product Updates。
10. Prompts & Skills。
11. Guides。
12. Topics。
13. RSS & Email。
14. Open Source & Open Data。
15. Footer / Trust Center。

顺序属于 Alpha 产品合同；若需调整，必须说明行为数据或编辑运营依据。

### 8.2 Today’s Brief

| ID | 优先级 | 需求 |
|---|---|---|
| HOME-01 | P0 | 每个自然日提供英文版和中文版 Daily Brief |
| HOME-02 | P0 | Brief 包含数据截止时间、覆盖说明和原始事件链接 |
| HOME-03 | P0 | Brief 由若干已发布 Event 组成，不创建无来源事实 |
| HOME-04 | P0 | 中英文版本共享事实选择，可进行符合语言读者需要的编辑改写 |
| HOME-05 | P1 | 支持查看历史 Brief |

### 8.3 Top Stories 与主信息流

| ID | 优先级 | 需求 |
|---|---|---|
| HOME-06 | P0 | Top Stories 使用显式 Featured 记录，展示推荐理由 |
| HOME-07 | P0 | 主信息流可切换 Latest、Trending 和 Featured |
| HOME-08 | P0 | 每个 Event Row 展示主标题、摘要、时间、类型、实体、来源数量和主来源 |
| HOME-09 | P0 | 多来源事件只展示一个主记录，可展开全部来源 |
| HOME-10 | P0 | 用户可按内容域、主题、语言信号和时间过滤 |
| HOME-11 | P1 | 保留过滤器到 URL 和本地偏好 |

## 9. Radar / 动态

Radar 是事件优先的实时页面。

### 9.1 列表

- Latest、Trending、Featured 三个独立视图。
- 24 hours、7 days、30 days 时间窗。
- 内容域、Topic、Organization、语言信号与来源等级筛选。
- Event Row 默认展示代表来源，并标记还有多少独立来源。
- 事件发生、来源发布和本站发现时间按需要区分。

### 9.2 事件详情

| ID | 优先级 | 需求 |
|---|---|---|
| RAD-01 | P0 | 中英文标题与本站摘要 |
| RAD-02 | P0 | 发生时间、发现时间、最后核验时间和状态 |
| RAD-03 | P0 | 所有公开来源，原始来源优先 |
| RAD-04 | P0 | 关联模型、论文、产品、仓库、人物、组织和 Topic |
| RAD-05 | P0 | Event 类型，如 ANNOUNCES、UPDATES、CHANGES_PRICE_OF、DEPRECATES |
| RAD-06 | P0 | 更正、合并、来源撤回或权利状态 |
| RAD-07 | P1 | 局部关系图与时间线位置 |

## 10. Models / 模型

### 10.1 模型列表

支持按以下维度浏览：

- 提供商。
- 开放权重与托管 API。
- 模态。
- 使用场景。
- 上下文长度。
- 价格区间。
- 可用地区。
- 发布时间与最近更新。
- 证据充分度。

### 10.2 模型详情

| ID | 优先级 | 需求 |
|---|---|---|
| MOD-01 | P0 | 精确名称、版本、提供商和生命周期状态 |
| MOD-02 | P0 | 模态、上下文、输入输出类型、地区和访问方式 |
| MOD-03 | P0 | 版本化价格记录，单位和生效时间明确 |
| MOD-04 | P0 | 按场景组织的评测记录与来源分层 |
| MOD-05 | P0 | 相关论文、Repo、产品、Prompt、Skill、Guide 和事件 |
| MOD-06 | P0 | 版本时间线和前后继关系 |
| MOD-07 | P0 | 不足数据明确显示 Insufficient evidence |
| MOD-08 | P1 | 结构化对比选择器，最多并列少量模型以保持可读性 |

### 10.3 配置推荐

用户选择任务、预算、时延、部署、数据和地区约束后，系统返回少量候选：

- 推荐理由。
- 不适用情形。
- 价格和质量证据。
- 数据截止时间。
- 可比较限制。

Alpha 可使用透明规则，不要求由 LLM 决定推荐。

## 11. Papers / 论文

### 11.1 列表

- Latest、Trending、Featured。
- Topic、作者、机构、发布日期、代码可用性和关联模型筛选。
- 趋势标签明确“不等于学术质量”。

### 11.2 详情

| ID | 优先级 | 需求 |
|---|---|---|
| PAP-01 | P0 | 标题、作者、机构、标识符、版本、日期和原始链接 |
| PAP-02 | P0 | 原文摘要在允许范围内处理，提供独立中英文导读 |
| PAP-03 | P0 | 关键贡献、方法、限制分别呈现，推断与原文陈述分开 |
| PAP-04 | P0 | 关联 Repo、模型、数据集、产品和事件 |
| PAP-05 | P0 | 版本变化和最后核验时间 |
| PAP-06 | P1 | Related Work 的局部关系视图 |

## 12. Products / 产品

### 12.1 列表

- 类别、平台、用户类型、地区、价格模式和更新时间筛选。
- Trending 和 Featured 为主，不制造无证据总榜。
- 明确区分官方数据、自报数据和编辑观察。

### 12.2 详情

| ID | 优先级 | 需求 |
|---|---|---|
| PRO-01 | P0 | 产品定位、官方链接、开发组织与可用地区 |
| PRO-02 | P0 | 当前价格模式和历史价格变化 |
| PRO-03 | P0 | 重大更新事件和版本时间线 |
| PRO-04 | P0 | 关联模型、Skill、Prompt、Guide 和 Repo |
| PRO-05 | P0 | 商业关系与厂商自报信息明确披露 |
| PRO-06 | P1 | 替代品和同类比较仅基于明确维度 |

## 13. GitHub

### 13.1 列表

- New、Rising、Recently Released 和 Featured。
- Topic、语言、License、仓库年龄和更新时间筛选。
- 累计 Stars 作为信息，不作为 Rising 的唯一决定因素。

### 13.2 详情

| ID | 优先级 | 需求 |
|---|---|---|
| GH-01 | P0 | 仓库、Owner、描述、Topics、语言、公开计数与官方链接 |
| GH-02 | P0 | License 标识；无 License 时明确提示不可假设复用权 |
| GH-03 | P0 | Release 时间线和维护活跃度 |
| GH-04 | P0 | 关联论文、模型、产品、Skill 和事件 |
| GH-05 | P0 | New & Rising 方法、窗口和数据截止时间 |
| GH-06 | P1 | Fork、镜像、模板来源和归档状态识别 |

## 14. Prompts / 提示词

### 14.1 列表

- 按文字、绘画、视频、代码、研究、Agent 等任务分类。
- 按模型、工具、输入类型和许可筛选。
- Latest、Featured，以及有真实数据后才启用的 Trending。

### 14.2 详情

| ID | 优先级 | 需求 |
|---|---|---|
| PMT-01 | P0 | 作者、来源、许可和可否展示全文 |
| PMT-02 | P0 | 适用模型或工具及验证版本 |
| PMT-03 | P0 | 使用目标、变量说明、输入和预期输出示例 |
| PMT-04 | P0 | 最后验证时间与已知限制 |
| PMT-05 | P0 | 无全文授权时只展示描述和原链接 |
| PMT-06 | P1 | 本地收藏和复制动作统计只在透明、匿名的边界内使用 |

## 15. Skills

### 15.1 列表

- 按 Agent 平台、任务、工具、权限、安装方式和 License 分类。
- 展示兼容性、最近版本、维护状态和安全提示。

### 15.2 详情

| ID | 优先级 | 需求 |
|---|---|---|
| SKL-01 | P0 | Skill 名称、作者、来源、版本和 License |
| SKL-02 | P0 | 支持平台、依赖、权限和外部 API 要求 |
| SKL-03 | P0 | 官方安装或使用说明链接 |
| SKL-04 | P0 | 关联工具、模型、Repo、Prompt 与 Guide |
| SKL-05 | P0 | 不代用户安装、不采集 API Key |
| SKL-06 | P1 | 已知安全审查状态和最后验证时间 |

## 16. Guides / 技巧

### 16.1 列表

- 按模型使用、提示、开发、研究、创作、部署、安全和工作流分类。
- Latest 与 Featured 为主。
- 原创、投稿和外部导读明确区分。

### 16.2 详情

| ID | 优先级 | 需求 |
|---|---|---|
| GDE-01 | P0 | 作者、版本、发布时间、最后审核时间和许可 |
| GDE-02 | P0 | 前置条件、步骤、结果和局限 |
| GDE-03 | P0 | 关联模型、产品、Skill、Prompt、Repo 和事件 |
| GDE-04 | P0 | 对会过期的设置、价格和界面注明验证日期 |
| GDE-05 | P1 | 支持复制代码片段或模板，但只限本站有权发布内容 |

## 17. Search

### 17.1 行为

| ID | 优先级 | 需求 |
|---|---|---|
| SRCH-01 | P0 | Search 不调用 LLM 即可返回结果 |
| SRCH-02 | P0 | 同一个查询可匹配中英文标题、别名和摘要 |
| SRCH-03 | P0 | 结果按 All、Events、Models、Papers、Products、GitHub、Prompts、Skills、Guides 分类 |
| SRCH-04 | P0 | 支持内容域、时间、Topic、组织和语言过滤 |
| SRCH-05 | P0 | 默认按相关性，允许显式切换 Latest 或 Trending |
| SRCH-06 | P0 | 结果显示类型、来源、时间、语言和匹配片段 |
| SRCH-07 | P1 | 支持常见别名、缩写、旧模型名和拼写容错 |
| SRCH-08 | P1 | 无结果时显示覆盖限制和可提交来源入口 |

## 18. Ask Agent

### 18.1 边界

Ask 只查询 AI Radar 已公开、已版本化的数据，不做任意网页搜索。回答必须：

- 引用站内记录及其原始来源。
- 显示数据截止时间和语言覆盖。
- 区分事实、排名结果和推断。
- 支持拒答或说明证据不足。
- 不执行安装、配置、购买或 API 调用。

### 18.2 支持问题

- 某主题最近发生了什么？
- 比较两个或多个模型在指定场景的评测、价格和限制。
- 某篇论文有哪些代码、模型或产品实现？
- 某产品过去几个月有哪些重大更新？
- 找适用于指定模型和任务的 Prompt、Skill 或 Guide。
- 给出一个实体的时间线和来源。

### 18.3 需求

| ID | 优先级 | 需求 |
|---|---|---|
| ASK-01 | P0 | Search 与 Ask 是同一输入框中的明确模式，不自动混淆 |
| ASK-02 | P0 | 检索范围只包含当前公开数据版本 |
| ASK-03 | P0 | 每个可核验结论有引用；引用可打开站内记录和原来源 |
| ASK-04 | P0 | 回答显示 generated_at 与 data_cutoff |
| ASK-05 | P0 | 证据冲突时并列说明，不擅自合并成确定结论 |
| ASK-06 | P0 | 没有足够证据时拒绝排名或推荐 |
| ASK-07 | P0 | 用户可切换回答语言，引用不因翻译而改变 |
| ASK-08 | P1 | 支持对答案有用性和引用错误的轻量反馈 |

## 19. 双语与全球化

### 19.1 URL 与 SEO

- 英文页面使用 /en/...。
- 中文页面使用 /zh/...。
- 每个可索引页面有 hreflang、canonical 和语言元数据。
- 稳定对象 ID 跨语言一致。
- 没有审核译文时可展示原语言内容，但必须明确状态，不生成空洞占位页。

### 19.2 内容规则

| ID | 优先级 | 需求 |
|---|---|---|
| I18N-01 | P0 | 导航、筛选、状态、政策和系统消息完整双语 |
| I18N-02 | P0 | 核心 Event 和实体提供中英文标题与摘要 |
| I18N-03 | P0 | 原始名称、模型名、仓库名和产品名不做破坏识别的翻译 |
| I18N-04 | P0 | 翻译记录展示原语言、方式和审核状态 |
| I18N-05 | P0 | Global、English signals、Chinese signals 分开展示信号视角 |
| I18N-06 | P1 | 日期、数字、币种、时区和文本方向按 locale 呈现 |

Public Alpha 的来源重点是英语与中文，但事件范围面向全球。其他语言来源可按重大主题精选接入，不宣称全面覆盖。

## 20. 关系、双链与局部图谱

| ID | 优先级 | 需求 |
|---|---|---|
| GRAPH-01 | P0 | 实体详情展示出向关系与 Backlinks |
| GRAPH-02 | P0 | Relation 有类型、方向、证据、时间、置信度和审核状态 |
| GRAPH-03 | P0 | 用户可从关系打开另一实体或事件 |
| GRAPH-04 | P1 | 显示当前实体的一跳局部图 |
| GRAPH-05 | P1 | 用户可展开到两跳，默认限制节点数量并按关系类型筛选 |
| GRAPH-06 | P0 | 无证据关系不能公开 |

## 21. Saved 与本地偏好

不登录情况下：

- 收藏内容保存在浏览器本地。
- 已读状态和最近筛选可保存在本地。
- 默认语言和主题可保存在本地。
- 提供本地导出与清除入口为 P1。
- 清理浏览器数据或更换设备会丢失，界面需要诚实提示。

本地收藏不承诺云同步，不静默创建账号标识。

## 22. RSS 与邮件日报

### 22.1 RSS

P0 Feed：

- English global daily。
- 中文全球日报。
- 各主内容域的 Latest。

P1 Feed：

- Topic 或实体订阅。

RSS 条目包含站内 Event 或 Entity 链接、短摘要、时间和主要原始来源，不复制新闻全文。

### 22.2 Email

| ID | 优先级 | 需求 |
|---|---|---|
| MAIL-01 | P0 | 英文与中文日报独立订阅 |
| MAIL-02 | P0 | 双重确认、退订和隐私说明 |
| MAIL-03 | P0 | 邮件由已发布 Daily Brief 和 Event 构成 |
| MAIL-04 | P0 | 发送失败可见，不把未发送标记为成功 |
| MAIL-05 | P1 | 订阅者可选主要内容域 |

## 23. Open Source、Open Data 与 API

### 23.1 开源页面

- 仓库链接。
- Apache-2.0 代码许可说明。
- 架构和本地运行入口。
- 贡献类型边界。
- Roadmap 与已知限制。

### 23.2 数据页面

- CC BY 4.0 适用范围。
- 第三方记录权利说明。
- 当前与历史 Release。
- Schema、manifest、checksum。
- GitHub 规范下载和国内镜像。
- Correction 与 Tombstone。

### 23.3 Public API

| ID | 优先级 | 需求 |
|---|---|---|
| API-01 | P0 | 只读、版本化、无需登录的合理低配额访问 |
| API-02 | P0 | 实体、事件、关系、搜索、排名方法、数据版本和更正接口 |
| API-03 | P0 | 响应携带稳定 ID、来源、权利和最后核验时间 |
| API-04 | P0 | 明确速率限制和错误语义 |
| API-05 | P0 | 不暴露原文缓存、内部字段、私人数据和受限内容 |
| API-06 | P1 | OpenAPI 描述与可复制示例 |

## 24. Trust Center

P0 公开：

- 编辑、来源、翻译、去重政策。
- 排名与推荐方法。
- AI 生成内容政策。
- 数据许可和开放范围。
- 商业关系披露。
- 更正、申诉和下架流程。
- 覆盖范围、已知限制和服务状态。

政策页必须中英双语、可索引、带版本与生效日期。

## 25. Owner Admin

Alpha 只有 Owner 管理角色，不建设多层权限。

### 25.1 工作区

- Inbox：新 Source Item 和待核验线索。
- Events：聚类、合并、拆分、状态与来源。
- Entities：实体、别名、关系和时间线。
- Localization：AI 草稿、人工审核和发布。
- Featured：精选理由、排序和商业披露。
- Daily Brief：中英文编排与发布。
- Sources & Rights：来源政策、许可和导出资格。
- Corrections：更正、撤回和 Tombstone。
- Data Releases：预检、manifest 和发行状态。
- Health：采集失败、过期来源、队列与邮件状态。

### 25.2 需求

| ID | 优先级 | 需求 |
|---|---|---|
| ADM-01 | P0 | 管理端不公开索引，并使用强身份验证 |
| ADM-02 | P0 | 关键发布、更正、权利和合并操作保留审计记录 |
| ADM-03 | P0 | 外部 API 与网络错误不被静默吞掉 |
| ADM-04 | P0 | 发布前能预览中英文页面和来源列表 |
| ADM-05 | P0 | Event 合并与拆分会更新关系和公开页面 |
| ADM-06 | P0 | 权利状态会约束页面、API 和数据导出 |
| ADM-07 | P1 | 常用任务支持批量选择，但不建设通用自动化平台 |

## 26. 内容与数据范围

### 26.1 发布时最低范围

- 2022-11-30 起 1,000–3,000 个关键历史 Event，按质量决定最终数量。
- 八个内容域均有真实可浏览数据。
- Radar、Papers 和 GitHub 具备较强自动更新。
- Models 采用自动发现与人工校验组合。
- Products 自动发现更新，档案由人工整理。
- Prompts 和 Skills 以精选、投稿和兼容授权内容为主。
- Guides 以编辑内容为主。

### 26.2 内容域共同最低能力

每个主内容域必须具备：

- 列表页。
- 详情页。
- 中英文呈现。
- Search 可发现。
- 原始来源。
- 至少一种有效关系或时间线信息。
- 权利状态和最后核验时间。

任何不满足以上能力的域都不能以“已上线”计入八域承诺。

## 27. 分析与指标

### 27.1 核心价值指标

North Star：Monthly Qualified Page Views growth。

Qualified Page View 满足至少一项：

- 在内容页达到有意义停留或阅读深度。
- 打开原始来源。
- 从一个实体进入关联实体。
- 完成有效 Search 或 Ask。
- 收藏内容。
- 订阅 RSS 或邮件。
- 访问 API 或下载数据。

精确定义在实现时固定并版本化，不能为了数据好看频繁修改。

### 27.2 健康指标

- 7-Day Returning Reader Rate。
- Search success rate。
- Ask cited-answer success rate。
- Source click-through rate。
- Backlink / related-entity navigation rate。
- RSS and email subscription conversion。
- Correction turnaround time。
- Data freshness by domain。
- Bilingual coverage and review rate。

### 27.3 前置漏斗

- 自然搜索与直接访问。
- 首页到内容详情点击。
- 首页 Search / Ask 使用。
- 各内容域入口发现率。

流量是前置指标，不替代合格阅读与回访。

## 28. 质量与运维目标

| 维度 | Public Alpha 目标 |
|---|---|
| 可用性 | 发布页、搜索和详情页在主要服务正常时可用；状态公开 |
| 新鲜度 | Radar 核心来源按来源能力在小时级更新，失败可见 |
| 来源 | 公开事实可追溯，无来源内容不能发布 |
| 去重 | 关键事件人工抽检不出现明显重复刷屏 |
| 双语 | 核心事件与主要实体双语；机器草稿状态不伪装成人工审核 |
| Ask | 有引用、截止时间、可拒答，不做站外搜索 |
| 权利 | 记录级状态约束展示和导出 |
| 更正 | 当前页、API 和下一数据发行一致传播 |
| 安全 | 密钥和管理端不进入客户端或开放数据 |

不在 Alpha 承诺企业 SLA 数值；状态和真实故障比虚假的 99.99% 承诺更重要。

## 29. 发布门槛

必须同时满足：

1. 八域列表与详情都有真实数据。
2. 首页模块没有指向占位页。
3. 中英文导航、政策和核心内容可用。
4. Latest、Trending、Featured 口径一致且公开。
5. Search 跨语言可用，Ask 有引用、截止时间和拒答能力。
6. Event 聚类、来源展开、实体双链和一跳局部图可用。
7. 权利不清的正文不会进入页面、API 或数据包。
8. RSS、两种语言的日报邮件订阅与退订可用。
9. 公共 API 返回版本、来源和权利字段。
10. 至少完成一个可验证的数据 Release 流程演练。
11. Trust Center 中英双语政策已发布。
12. Owner 能发现采集失败、修正事实并重新发布。
13. 移动和桌面核心旅程通过验收。
14. 发布页明确标注 Public Alpha、覆盖范围和已知限制。

## 30. Alpha 后续方向

只有在 Public Alpha 证明用户回访和数据闭环后，才进入：

- 登录与跨设备同步。
- 个性化主题、实体和提醒。
- 更强研究 Agent 与高级比较。
- 高频监控和自定义日报。
- 高配额 API、批量导出和团队空间。
- 商业托管、SLA 和企业数据需求。
- 更广语言覆盖。
- 更完整的全局知识图谱体验。
- Obsidian 或其他知识工具导出。

