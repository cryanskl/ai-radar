# 07 系统架构

## 1. 架构目标

AI Radar Public Alpha 由一人加 AI 在 4–6 周内完成。架构首先服务于以下约束：

1. 八个内容域共享一个事实层，不能变成八套孤立 CMS。
2. 采集、审核、网页、Search、Ask、API 和开放数据使用同一稳定 ID。
3. 排名方法、权利状态和更正能传播到所有出口。
4. 中英文是同一事实的本地化视图，不是复制两套数据库。
5. 系统可以开源、本地运行并逐步扩展。
6. Alpha 避免微服务、专用图数据库和过早的基础设施复杂度。

## 2. 架构决策摘要

| 决策 | Public Alpha 选择 | 原因 |
|---|---|---|
| 应用形态 | 模块化单体 + 独立 Worker 进程 | 保持部署简单，又避免采集任务阻塞 Web 请求 |
| 主要语言 | TypeScript | 前后端、脚本和共享类型统一，适合单人维护 |
| Web | React + Next.js 类全栈框架 | SSR/SEO、双语路由、API 与管理端可在一套工程内完成 |
| 主数据库 | PostgreSQL | 关系、全文、JSON、事务和审计均能覆盖 Alpha |
| 知识图谱 | PostgreSQL 中的实体与关系表 | Alpha 只需双链和一到两跳，不引入 Neo4j |
| 搜索 | PostgreSQL 全文 + trigram + 可选 pgvector | 先满足可解释混合搜索，避免独立搜索集群 |
| 队列 | PostgreSQL-backed job queue | 减少 Redis 或消息中间件依赖 |
| 原始响应 | 私有对象存储，按来源保留策略 | 便于审核和重放，但不进入公开数据 |
| 缓存 | Web/CDN 与数据库查询缓存优先 | Alpha 不默认增加独立 Redis |
| LLM | 一个明确 Provider adapter | Ask 与翻译需要边界，但不建设通用模型路由平台 |
| 数据发布 | 离线导出任务 + GitHub Releases + 国内镜像 | 生产库与开放版本隔离 |

具体框架版本、托管商和 ORM 在实施开始时锁定；它们是可替换实现，不属于产品合同。若仓库已有技术约束，以仓库事实为准并记录 ADR。

## 3. 系统上下文

~~~mermaid
flowchart LR
    Reader[Global reader] --> Web[Public web]
    Reader --> RSS[RSS and email]
    Developer[Data consumer] --> API[Public read-only API]
    Developer --> Release[Open data releases]
    Owner[Owner editor] --> Admin[Owner admin]

    Sources[Official sites APIs RSS papers GitHub] --> Ingest[Ingestion workers]
    Ingest --> Core[AI Radar core data]
    Admin --> Core
    Core --> Web
    Core --> API
    Core --> RSS
    Core --> Release

    Web --> Ask[Search and Ask]
    Ask --> Core
    Ask --> LLM[LLM provider]
~~~

## 4. 逻辑模块

模块是代码边界，不是独立网络服务。

| 模块 | 职责 |
|---|---|
| source-registry | 来源配置、接入状态、条款、速率和权利默认值 |
| ingestion | Feed/API/页面输入、游标、调度、原始响应引用 |
| normalization | 时间、URL、作者、标识符、语言和内容类型标准化 |
| eventing | 事件候选、聚类、合并、拆分和代表来源 |
| entities | 实体、别名、版本、关系、Backlinks 和时间线 |
| localization | 中英文摘要、翻译状态、术语和审核 |
| editorial | Featured、Daily Brief、指南和发布状态 |
| rankings | Latest、Trending、Benchmark、Value 与方法版本 |
| rights | 记录级权利、许可、署名、导出资格和下架 |
| search | 全文、别名、过滤、跨语言与可选向量检索 |
| ask | 检索、证据包、答案生成、引用校验和拒答 |
| delivery | 页面、RSS、邮件、SEO 和公共 API |
| releases | 公开 schema、过滤、校验、manifest、快照与镜像 |
| operations | 管理端、审计、Corrections、Tombstones 和健康状态 |

模块只能通过清晰的应用服务和数据库约束共享状态，禁止通过复制数据形成平行真相源。

## 5. 运行时拓扑

### 5.1 最小部署单元

~~~mermaid
flowchart TB
    CDN[CDN and edge cache] --> APP[Web application]
    APP --> DB[(PostgreSQL)]
    APP --> OBJ[(Private object storage)]
    APP --> LLM[LLM API]
    APP --> MAIL[Email provider]

    WORKER[Background worker] --> DB
    WORKER --> OBJ
    WORKER --> SRC[External sources]
    WORKER --> LLM

    SCHED[Scheduler] --> WORKER
    RELEASE[Release job] --> DB
    RELEASE --> GH[GitHub Releases]
    RELEASE --> MIRROR[Feishu or Baidu mirror]
~~~

Alpha 只需：

- 一个 Web 应用实例。
- 一个或少量同构 Worker。
- 一个 PostgreSQL。
- 一个私有对象存储桶。
- 一个调度入口。
- 一个邮件服务和一个 LLM 服务。

如果部署平台可提供定时任务、对象存储和日志，可直接使用；不为“未来可能迁移”增加自建控制面。

### 5.2 本地开发

本地最小依赖：

- Node.js runtime。
- PostgreSQL，含所需扩展。
- 可选本地对象存储模拟，或文件系统开发适配。
- 测试用 Source fixtures。

LLM、邮件和外部来源在测试中使用明确 fixture 或 fake 边界；生产密钥只存在于服务端环境变量。

## 6. 核心数据模型

### 6.1 主要表组

| 表组 | 关键对象 |
|---|---|
| source | sources、source_policies、source_cursors |
| ingestion | ingest_runs、source_items、raw_payload_refs |
| event | events、event_sources、event_candidates、event_merges |
| entity | entities、entity_aliases、entity_versions、entity_links |
| localization | localized_contents、translation_reviews、glossary_terms |
| editorial | featured_items、daily_briefs、brief_items、guides |
| ranking | ranking_definitions、ranking_observations、benchmark_runs、price_records |
| rights | rights_assertions、permissions、attributions、takedown_cases |
| release | data_releases、release_files、corrections、tombstones |
| operations | jobs、audit_log、health_checks、delivery_runs |

### 6.2 共用字段

所有公开核心对象至少包含：

- 内部主键。
- 稳定 public_id。
- lifecycle_status。
- first_published_at 或 created_at。
- updated_at。
- last_verified_at。
- provenance。
- rights_status。
- review_status。
- public_visibility。

稳定 public_id 在合并后不复用。被合并对象通过 Tombstone 指向目标。

### 6.3 事件与来源条目

~~~mermaid
erDiagram
    SOURCE ||--o{ SOURCE_ITEM : publishes
    EVENT ||--o{ EVENT_SOURCE : supported_by
    SOURCE_ITEM ||--o| EVENT_SOURCE : links
    EVENT }o--o{ ENTITY : affects
    EVENT ||--o{ LOCALIZED_CONTENT : presented_as
~~~

Source Item 是采集到的原始记录；Event 是经过聚类后的现实事件。列表默认展示 Event，来源展开显示 Source Item 的公开字段。

### 6.4 实体与关系

Relation 采用有向边：

- subject_entity_id。
- relation_type。
- object_entity_id 或 object_event_id。
- valid_from / valid_to。
- first_verified_at / last_verified_at。
- confidence。
- review_status。
- evidence references。

Backlink 由反向查询产生，不额外保存一份反向边。局部图使用受限递归查询或预计算邻接摘要，不引入专用图数据库。

### 6.5 事实与本地化分离

不可翻译的事实字段保存在核心对象：

- ID、时间、价格数值、单位、评测分、URL、关系和状态。

可本地化字段保存在 Localized Content：

- 标题、短摘要、长导读、推荐理由和术语说明。

同一事实在中文和英文记录中不能出现不同价格或不同发布日期。若来源冲突，在事实层记录多个 assertion 及其证据。

## 7. 采集流水线

### 7.1 状态机

~~~mermaid
flowchart LR
    Fetch[Fetch] --> Parse[Parse]
    Parse --> Normalize[Normalize]
    Normalize --> Rights[Rights classify]
    Rights --> Candidate[Event or entity candidate]
    Candidate --> Dedupe[Deduplicate and link]
    Dedupe --> Enrich[Enrich and localize]
    Enrich --> Review[Automated checks or owner review]
    Review --> Publish[Publish]
    Publish --> Index[Index and deliver]
~~~

每一步写入明确状态和错误。网络、解析或外部 API 错误不静默变成空结果。

### 7.2 Source adapter

每个来源适配器只负责：

- 根据游标获取新内容。
- 将响应映射为统一 Source Item 输入。
- 报告速率限制、认证和错误。
- 返回原始响应引用和获取时间。

来源适配器不负责：

- 生成公开 Event。
- 决定全局权利状态。
- 直接写排名。
- 发布页面。

Alpha 不建立可视化通用爬虫平台；少量高价值来源使用可测试的专用 adapter。

### 7.3 幂等与重放

- Source Item 使用 source_id + external_id，或规范化 URL 指纹作为幂等边界。
- 同一采集游标可安全重跑，不重复生成公开对象。
- 原始响应按来源政策保留在私有存储，数据库保存内容哈希与对象引用。
- 解析器变更可对允许保留的响应重放。
- 超出保留期或不可保留的响应按政策删除，不能为方便调试无限保存。

### 7.4 调度层级

| 层级 | 内容 | 建议节奏 |
|---|---|---|
| Fast | 重大官方动态、GitHub Release、核心 RSS | 分钟到小时级 |
| Standard | 论文、产品更新、一般来源 | 小时到日级 |
| Slow | 价格复核、实体档案、历史补全 | 日到周级 |

实际频率受来源条款和配额约束。系统展示 last_success_at 和 next_run_at，不宣称所有来源实时。

## 8. 事件聚类与去重

### 8.1 两阶段策略

1. Candidate retrieval：使用规范化 URL、外部 ID、标题相似、时间窗口、共享实体和可选 embedding 找候选。
2. Merge decision：规则给出建议；高影响或低置信候选进入 Owner 审核。

Alpha 不让 LLM 直接不可逆地合并 Event。

### 8.2 合并条件

支持同一事件的信号：

- 指向同一官方公告或论文。
- 共享精确实体版本。
- 发生时间高度接近。
- 事件类型与核心事实一致。
- 标题语义一致。

不应合并：

- 发布与后续独立评测。
- 模型宣布与 API 正式可用。
- 产品上线与价格调整。
- 论文初版与具有实质变化的修订。

### 8.3 合并与拆分

- 合并保留所有来源与旧 public_id Tombstone。
- 拆分重新分配来源、关系和本地化内容。
- 排名、Search index、RSS 和缓存收到失效事件。
- 操作写入 audit log，并支持通过新的更正操作修复；不依赖数据库回滚掩盖历史。

## 9. 实体解析

实体解析顺序：

1. 精确外部标识符。
2. 规范化官方 URL。
3. 已审核别名。
4. 类型限定名称匹配。
5. 候选建议与 Owner 确认。

“Claude”“Gemini”等名称可能同时指模型家族、具体版本或产品，必须结合 entity_type 和版本处理，不能只按字符串合并。

## 10. 本地化流水线

### 10.1 状态

- missing。
- ai_draft。
- machine_checked。
- human_reviewed。
- human_authored。
- stale。

### 10.2 流程

1. 从已核验事实和允许使用的来源生成目标语言草稿。
2. 保留模型名、产品名、仓库名和关键术语原文。
3. 对时间、数字、实体链接和引文做结构化一致性检查。
4. 高影响 Event、Featured、Daily Brief 和政策页需 Owner 审核。
5. 来源事实改变时，将受影响本地化记录标记为 stale。

LLM 输出只写草稿层，不能直接改变事实、权利或关系的已审核状态。

## 11. 排名计算

- ranking_definitions 存储问题、资格、窗口、版本和限制。
- 原始观察先按来源和时间存储。
- 定时任务生成 ranking_observations。
- 页面只读取已发布版本。
- 方法重大变更创建新版本，不覆盖历史。
- Featured 使用独立 editorial 表，不写入算法 score。

模型 Benchmark 和 Value 使用专门结构化表，因为价格生效期、评测条件和模型版本不能被通用热度 JSON 替代。

## 12. Search 架构

### 12.1 Alpha 检索顺序

1. 精确 ID、URL、外部标识符与别名。
2. PostgreSQL 全文检索。
3. Trigram 拼写与近似名称。
4. 可选 embedding 召回。
5. 类型、语言、时间、Topic 和状态过滤。
6. 文本相关性主导的稳定排序。

向量检索是补充，不是所有查询的必经路径。对于模型名、论文 ID 和仓库名，精确检索更可靠也更便宜。

### 12.2 搜索文档

每个公开对象生成一条或多条语言搜索文档，包含：

- public_id 与类型。
- locale。
- 标题、别名、摘要和关键词。
- 关联实体名称。
- 时间与 Topic。
- public_visibility 与权利过滤结果。
- index_version。

受限原文和 internal_only 字段不得进入可查询索引。

### 12.3 索引一致性

对象发布、合并、更正、撤回和权利变更都会生成 index job。失败任务可重试且可见；Search 结果携带索引数据截止时间。

## 13. Ask 架构

### 13.1 请求流程

~~~mermaid
sequenceDiagram
    participant U as User
    participant A as Ask API
    participant R as Retriever
    participant D as Public data
    participant L as LLM
    participant V as Citation validator

    U->>A: question and locale
    A->>R: structured retrieval request
    R->>D: search public versioned records
    D-->>R: evidence records
    R-->>A: bounded evidence pack
    A->>L: question plus evidence plus rules
    L-->>A: answer claims plus citation IDs
    A->>V: validate citations and data cutoff
    V-->>A: pass or fail
    A-->>U: cited answer or explicit abstention
~~~

### 13.2 证据包

只包含：

- 公开的事件、实体、关系、评测和价格记录。
- AI Radar 摘要与允许的短引文。
- 稳定引用 ID。
- 数据版本、最后核验时间和权利状态。

不把内部原文缓存或整篇新闻发送给 LLM。

### 13.3 引用校验

校验至少确认：

- 每个引用 ID 存在且公开。
- 引用属于本次证据包。
- 数据截止时间覆盖所有引用。
- 比较结论没有混用不可比评测或价格单位。
- 无证据回答返回 abstained 或 needs_more_evidence。

Alpha 可在校验失败时整体拒答，不需要发明复杂的自动修复循环。

### 13.4 成本控制

- Search 默认不调用 LLM。
- Ask 限制证据条数和上下文长度。
- 相同数据版本和规范化问题可短期缓存。
- 对比与时间线优先由结构化查询生成证据。
- 记录 token、延迟、引用通过率和拒答率，不记录不必要的个人信息。

## 14. 公共 Web 与 SEO

- 公共详情页服务端渲染或预渲染主要内容。
- /en 与 /zh 使用稳定路由和 hreflang。
- Event、Entity、榜单和政策页生成结构化元数据。
- sitemap 按内容类型与语言拆分。
- canonical 指向对应语言的规范页。
- 不为缺少实际内容的语言版本生成索引页。
- 页面展示 last_verified_at、来源与更正状态。

## 15. Public API

### 15.1 版本

- URL 或请求头包含 major API version。
- 响应包含 data_version。
- 向后兼容的字段增加不改变 major。
- 删除或改变语义需要新 major 和迁移期。

### 15.2 资源

建议最小资源：

- events。
- entities。
- relations。
- search。
- rankings 和 methodologies。
- corrections。
- tombstones。
- releases。

### 15.3 约束

- 只读。
- 游标分页。
- 有界 page size。
- IP 或匿名客户端合理限速。
- 权利过滤发生在查询层之前或公共物化视图中。
- 管理端和公共 API 使用不同路由与认证边界。

## 16. RSS 与 Email 架构

RSS 从已发布公共 Event 和 Daily Brief 生成，不独立维护另一套内容。

Email 流程：

1. Owner 发布语言版本 Daily Brief。
2. 系统冻结本次邮件内容版本。
3. 生成预览并检查链接。
4. 发送任务写入 delivery_runs。
5. Provider 回执更新 delivered、bounced 或 failed。
6. 退订立即更新订阅状态。

邮件地址和投递状态与开放内容数据库逻辑隔离，绝不进入开放数据。

## 17. 开放数据发行架构

### 17.1 公共物化层

推荐由公开视图或导出查询明确列出字段，不使用 SELECT all。每个对象类型有版本化 schema。

### 17.2 发行物

- manifest.json。
- schema 文件。
- events、entities、relations、rankings、corrections、tombstones 数据文件。
- LICENSE-DATA 与 ATTRIBUTION。
- checksums.txt。
- release notes。

格式优先 JSONL；体积明显增长后可增加 Parquet，不在 Alpha 同时维护过多格式。

### 17.3 镜像

GitHub Release 生成后，国内镜像任务只上传同一文件。镜像不能重新压缩或改写内容，否则校验和失去意义。

## 18. Owner Admin 架构

- 与公共 Web 共用应用和核心服务，但路由、会话与缓存严格区分。
- 只有单一 Owner 角色。
- 发布、合并、拆分、权利、Featured、更正和 Release 操作写审计记录。
- 审核 UI 显示原始来源、规范化结果与最终公开预览。
- 批量操作只覆盖明确的同类任务，不建设可编程工作流引擎。

## 19. 安全边界

### 19.1 外部输入

需要校验：

- Source 响应与 Feed 内容。
- 用户查询和提交链接。
- Webhook。
- 管理端编辑输入。
- LLM 输出。
- 数据导入和 Release 配置。

### 19.2 关键规则

- 所有密钥仅服务端使用。
- 抓取内容视为不可信数据，不作为系统指令。
- Ask 证据中的网页文字不能改变工具或系统边界。
- 管理端使用强认证、CSRF 防护和安全 Cookie。
- 外部 URL 获取限制协议、重定向和内网地址，避免 SSRF。
- HTML 摘要经过允许列表清理；默认使用纯文本。
- 日志不记录 Token、完整订阅邮箱或不必要原文。
- Release 前执行 secret 与隐私扫描。

只在这些系统边界做校验；内部类型和数据库约束已经保证的状态不重复堆叠防御代码。

## 20. 可观测性

### 20.1 最低指标

- 每个 Source 的 last_success_at、last_item_at、error_count 和 lag。
- Worker 队列长度、失败和重试。
- Event 候选、自动聚类和人工待审数量。
- 每语言发布与 stale 本地化数量。
- Search 延迟、零结果率和索引截止时间。
- Ask 延迟、成本、引用通过率和拒答率。
- 页面错误率和关键路径延迟。
- Email 发送、失败和退订。
- Release 校验状态和镜像同步状态。

### 20.2 告警

只为需要行动的情况告警：

- 核心 Source 超过预期新鲜度。
- 队列持续积压。
- Search index job 持续失败。
- Ask 引用校验错误异常上升。
- 邮件日报未按计划生成或发送。
- 数据 Release 校验失败。
- 公共健康检查失败。

普通单次网络失败记录并按策略重试，不用每次唤醒 Owner。

## 21. 备份与恢复

- PostgreSQL 定期备份并验证可恢复性。
- 私有对象存储遵循来源许可和保留策略，不把备份当永久保留借口。
- 公开数据 Release 天然提供公开层历史快照，但不能替代生产备份。
- 审计、更正和 Tombstone 与核心数据一起备份。
- 恢复演练至少验证：实体、事件、关系、权利状态和稳定 ID 一致。

## 22. 测试策略

### 22.1 单元与契约

- 时间、URL、价格、许可证和标识符标准化。
- 事件候选与不可合并规则。
- 排名窗口与方法版本。
- rights_status 到展示和导出的映射。
- 双语事实一致性。
- Public API schema。

### 22.2 集成

- Source fixture -> Source Item -> Event -> 页面。
- Event 合并/拆分 -> Search、关系与 Tombstone。
- 权利变更 -> 页面、API、Release。
- 更正 -> 当前页、API 和下一发行版。
- Daily Brief -> RSS 与邮件。
- Ask -> 检索 -> 引用校验 -> 拒答。

### 22.3 端到端

- 中英文首页和八域导航。
- 跨语言 Search。
- Event 到实体 Backlink。
- 模型比较与数据不足状态。
- 本地收藏。
- 邮件订阅与退订。
- Admin 审核、发布和更正。
- Open Data 下载与 checksum 校验。

## 23. 扩展触发条件

只有观察到明确瓶颈才拆分基础设施：

| 现象 | 可能演进 |
|---|---|
| PostgreSQL Search 无法满足规模或相关性 | 引入专用搜索引擎 |
| 一到两跳查询出现持续性能问题 | 评估图查询缓存或图数据库 |
| Job 吞吐或可靠性超出 PostgreSQL 队列能力 | 引入独立消息系统 |
| 缓存压力明确且 CDN/应用缓存不足 | 引入 Redis |
| Web 与 Worker 发布节奏明显冲突 | 拆成独立部署包，仍共享契约 |
| 多模型路由成为真实业务需求 | 扩展 Provider 层与评测策略 |

“未来可能需要”不是引入新服务的充分理由。

## 24. 待实施时确认的选择

以下选择未改变产品范围，但必须在编码前用 ADR 固定：

- 具体 Web 框架与版本。
- PostgreSQL 托管方式和扩展可用性。
- ORM 或 SQL 工具。
- PostgreSQL job queue 实现。
- 对象存储与部署平台。
- 邮件服务。
- Alpha 使用的单一 LLM Provider 与模型。
- GitHub Release 自动化凭据方式。
- 飞书或百度网盘镜像的人工/自动边界。

ADR 必须记录背景、选择、放弃方案和可逆性；不把偏好写成无依据的永久规则。

## 25. 架构验收标准

- 一个 Event 可以连接多个 Source Item，而列表只展示一个事件记录。
- 中英文共享事实和稳定 ID，修改事实能让两种语言版本感知 stale。
- Backlink 和一跳图由同一 Relation 数据生成。
- Search 不需要 LLM；Ask 只读取公共版本化数据。
- Ask 引用校验失败时返回明确拒答。
- 权利状态可以同时约束页面、搜索、API 和 Release。
- Featured 与算法排名物理字段分离。
- Source adapter 错误可见且可重跑，不重复生成数据。
- 合并、拆分、更正和撤回保留稳定 ID 历史。
- 生产库不能直接作为开放数据包发布。
- GitHub Release 与国内镜像文件校验和一致。
- 系统只需 Web、Worker、PostgreSQL 和对象存储即可运行核心 Alpha。
- 不依赖专用图数据库、Redis 或搜索集群才能完成发布。

