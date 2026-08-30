# 09 六周路线图

## 1. 执行假设

| 项目 | 假设 |
|---|---|
| 团队 | 一名 Owner + AI 工具 |
| 周期 | 建议 6 周；最短可压缩到 4 周 |
| 工作方式 | 垂直切片，每周都形成可运行闭环 |
| 发布形态 | 公开的 Public Alpha |
| 用户账号 | 无强制登录 |
| 内容范围 | 八域真实上线，自动化深度分层 |
| 历史范围 | 从 2022-11-30 起精选 1,000–3,000 个关键 Event，以质量为门槛 |
| 语言 | 英文与中文 |
| 开源 | 代码 Apache-2.0；有权开放的数据按 CC BY 4.0 |

六周路线图不是把前五周当开发黑箱、第六周一次上线。每周结束都必须能演示从来源到用户界面的完整增量。

## 2. 执行原则

1. 先完成一条端到端事实链，再扩大来源和内容域。
2. Source Item、Event、Entity、Relation、Localization 和 Rights 是首周核心，不后补。
3. 网页、Search、Ask、API 和数据 Release 使用同一公共事实层。
4. 八域可以不同自动化，但不能有占位页面。
5. 高风险自动化保留 Owner 审核，不追求全自动发布。
6. 每周设退出标准；未满足时先修复，不用新功能掩盖问题。
7. 四周压缩时削减数量、视觉润色和 P1，不删除信任边界。

## 3. 关键路径

~~~mermaid
flowchart LR
    Foundation[Data and rights foundation]
    Foundation --> Pipeline[Ingestion and editorial pipeline]
    Pipeline --> Delivery[Eight domains and bilingual delivery]
    Delivery --> Discovery[Search rankings and graph]
    Discovery --> Ask[Ask with citations]
    Delivery --> Syndication[RSS email API releases]
    Ask --> Launch[Public Alpha launch]
    Syndication --> Launch
~~~

最大风险不是页面数量，而是上游数据不稳定导致所有出口一起不可信。因此第一周必须完成数据与权利骨架。

## 4. Week 0：开始前的半天至一天

Week 0 不扩展为“准备周”，只关闭无法编码的关键选择。

### 4.1 必须确认

- 代码仓库和默认分支。
- Web 框架、数据库、ORM/SQL 工具、队列、部署和对象存储。
- 单一 LLM Provider 与邮件服务。
- 域名和工作名是否继续使用 AI Radar。
- 首批核心来源清单及其接入方式。
- GitHub Release 与国内镜像的实际操作方式。
- Owner 管理端认证方式。

### 4.2 产出

- 环境变量清单，不含实际密钥。
- 最小 ADR。
- 首批 10–20 个来源的 Source Registry 草案。
- 核心术语词表。
- 一份包含中英文内容的端到端 fixture。

### 4.3 退出标准

- 所有外部服务都能用最小测试证明可访问。
- 来源条款与默认权利状态有记录。
- 本地、测试和生产环境边界明确。

## 5. Week 1：事实骨架与第一条垂直切片

### 5.1 目标

完成“一个来源条目 -> 一个事件 -> 两个语言页面 -> 一个实体 Backlink”的真实闭环。

### 5.2 建设内容

#### 数据与迁移

- Source、Source Policy、Ingest Run、Source Item。
- Event、Event Source、Entity、Alias、Relation。
- Localized Content 与审核状态。
- Rights、Attribution、Audit Log。
- Correction 与 Tombstone 最小结构。
- 稳定 public_id。

#### 应用骨架

- /en 与 /zh 路由。
- 全局导航和基本布局。
- Radar 列表与 Event 详情。
- 一个实体详情、正向关系和 Backlink。
- Owner 登录与最小 Inbox。

#### 第一条来源链

- 选择一个结构稳定、权利清晰的官方 RSS 或 API。
- 获取、解析、规范化、幂等写入。
- 人工核验并发布一个真实 Event。
- 生成英文和中文摘要草稿并审核。

### 5.3 验证

- 重复运行同一采集不会生成重复 Source Item 或 Event。
- Event 详情展示原始来源、时间、权利和最后核验时间。
- 中英文页面共享 public_id 和事实。
- Relation 在两个实体方向都可导航。
- 管理端发布操作写 audit log。

### 5.4 退出标准

一条真实内容能够端到端发布；没有这个闭环，不进入多来源和八域页面建设。

## 6. Week 2：采集、去重与八域资料库

### 6.1 目标

建立可持续输入，并让八个内容域都有真实列表和详情。

### 6.2 采集

- 接入首批官方博客与 RSS。
- 接入 arXiv 描述性元数据。
- 接入 GitHub 官方 API。
- 接入首批模型、产品官方更新与定价来源。
- 实现调度、游标、失败重试和 Source Health。
- 私有原始响应引用与保留策略。

### 6.3 去重与实体

- 规范 URL 和外部标识符。
- Event 候选召回。
- Owner 合并与拆分。
- 模型家族与版本、产品与组织、论文与 Repo 的基础解析。
- 合并后的 Tombstone。

### 6.4 八域页面

- Radar。
- Models。
- Papers。
- Products。
- GitHub。
- Prompts。
- Skills。
- Guides。

每个域完成：列表、详情、中英文、来源、最后核验时间和至少一种有效关系。

Prompts、Skills 和 Guides 先使用原创、明确开放许可或人工策展链接，不等待自动采集系统。

### 6.5 退出标准

- 首页和八域入口均连接真实数据。
- 多个来源能合并到一个 Event。
- 来源失败在后台可见。
- 无 License GitHub 仓库不会被标为可自由复用。
- arXiv 元数据与 PDF 权利分开。

## 7. Week 3：双语首页、排名与本地知识图谱

### 7.1 目标

让网站从“数据库浏览器”变成可每日使用的信息雷达。

### 7.2 首页

按约定顺序完成：

1. Compact Search / Ask。
2. Today’s Brief。
3. Top Stories。
4. Latest / Trending / Featured。
5. Models / Benchmark Updates。
6. Trending Papers。
7. GitHub New & Rising。
8. Product Updates。
9. Prompts & Skills。
10. Guides。
11. Topics。
12. RSS & Email。
13. Open Source & Open Data。
14. Trust Center。

### 7.3 排名

- Latest 的稳定时间排序。
- Trending 的来源内标准化、时间窗口和数据截止时间。
- Featured 的编辑理由与商业披露。
- GitHub New & Rising。
- 模型场景榜与 Insufficient evidence。
- 价格记录和一个严格限定场景的 Value 示例。

不在这一周追求所有模型评测来源和复杂权重调优。

### 7.4 图谱

- 实体详情出向关系。
- Backlinks。
- 一跳局部图。
- P1 两跳展开，可在时间不足时延后。
- Event 和 Entity 时间线。

### 7.5 本地化

- 完整双语 UI。
- 术语词表。
- 翻译状态和 stale 标识。
- hreflang、canonical、sitemap。

### 7.6 退出标准

- 用户能在五分钟内读完首页核心变化。
- Latest、Trending 和 Featured 视觉与数据语义分离。
- 模型页不显示万能总分。
- 中英文关键数字、时间和引用抽样一致。
- 用户能从事件通过关系到论文、Repo、模型或产品，再通过 Backlink 返回。

## 8. Week 4：Search、Ask、Saved、RSS 与 Email

### 8.1 目标

完成发现、提问和订阅闭环。这是四周压缩版的最早发布候选点。

### 8.2 Search

- 精确 ID、URL 和别名匹配。
- PostgreSQL 全文与 trigram。
- 中英文跨语言查询。
- 八域、时间、Topic、组织和语言筛选。
- All 与类型结果页。
- 零结果与覆盖提示。

### 8.3 Ask

- 明确 Search / Ask 模式切换。
- 只从公开版本化数据检索。
- 证据包和引用 ID。
- 中英文回答。
- generated_at 与 data_cutoff。
- 引用校验。
- 证据冲突和拒答。
- 对比、时间线、主题总结和内容发现四类问题。

### 8.4 Saved

- 本地收藏。
- 本地已读和语言偏好。
- 清除提示。
- P1 本地导出可在六周版完成。

### 8.5 RSS 与 Email

- 英文全球日报 RSS。
- 中文全球日报 RSS。
- 八域 Latest RSS。
- 英文与中文 Daily Email 订阅、确认和退订。
- Owner 邮件预览和发送状态。

### 8.6 退出标准

- Search 不调用 LLM 也能完成核心检索。
- Ask 的每个事实结论都有有效引用，校验失败会拒答。
- 超出站内覆盖的问题不会变成站外搜索。
- 收藏不要求登录，并诚实说明只存本地。
- RSS 条目不包含新闻全文。
- 邮件订阅、发送、失败和退订状态可验证。

### 8.7 四周压缩版发布条件

如果必须在四周发布，只允许削减：

- 历史 Event 数量，保留精选核心时间线。
- 来源数量，保留最高价值来源。
- 二跳图谱。
- 高级筛选和视觉润色。
- 部分 P1 RSS。
- 数据镜像自动化，可先人工同步并校验。

不能削减：

- 八域真实页面。
- 双语核心体验。
- 来源、权利与更正。
- Search / Ask 区分、引用和拒答。
- Featured / Trending 区分。
- 管理端基本审核。
- Trust Center。

四周发布时必须更明显地声明覆盖范围和不完整性。

## 9. Week 5：Public API、开放数据与历史回填

### 9.1 目标

证明“开放 AI Radar”不仅是代码仓库口号，而是可版本化复用的数据产品。

### 9.2 Public API

- /v1 只读资源。
- events、entities、relations、search、rankings、corrections、tombstones、releases。
- 游标分页和合理限速。
- data_version、来源、权利和 last_verified_at。
- API 文档和示例。

### 9.3 数据 Release

- 公共 schema。
- Rights allowlist。
- Privacy filter。
- JSONL 发行文件。
- manifest、记录数、许可分布、checksum。
- LICENSE-DATA 与 ATTRIBUTION。
- GitHub Release 演练。
- 飞书或百度网盘原文件镜像与 checksum 复核。

### 9.4 历史回填

- 按主题批次从 2022-11-30 开始。
- 优先官方发布、重大模型、论文、Repo、产品、价格与政策节点。
- 建立跨域关系。
- 高影响节点双语审核。
- 目标数量根据质量和剩余时间调整，不为 3,000 硬凑重复记录。

### 9.5 Trust Center

发布中英文：

- Editorial。
- Source。
- Translation。
- Deduplication。
- Ranking。
- AI Content。
- Dataset License。
- Commercial Disclosure。
- Corrections / Takedown。
- Coverage / Known Limitations / Status。

### 9.6 退出标准

- API 和页面读取同一公开事实层。
- 受限、内部和撤回记录不能进入数据包。
- GitHub Release 与国内镜像 checksum 一致。
- Corrections 和 Tombstones 可被下游消费。
- 历史时间线覆盖关键主题，而不是大量无关系文章。

## 10. Week 6：稳定性、内容冲刺与公开发布

### 10.1 目标

停止扩张功能，集中消除会破坏用户信任的问题。

### 10.2 内容质量

- 分层抽查八域记录。
- 去除重复 Event。
- 修正模型版本、价格和评测条件。
- 复核 GitHub License。
- 复核 Prompt / Skill 正文授权。
- 清理 stale 或空洞本地化。
- 补齐高连接实体和关键关系证据。

### 10.3 产品 QA

- 桌面和移动首页。
- 八域列表与详情。
- 中英文切换和直接 URL。
- Search 相关性与跨语言。
- Ask 引用、截止时间、冲突和拒答。
- Saved 本地状态。
- RSS 和 Email。
- API、Release 与镜像。
- Admin 发布、更正和健康状态。
- 无障碍、SEO、性能和错误页面。

### 10.4 运营演练

完成一次完整演练：

1. 新来源发现一条 Event。
2. 合并第二个来源。
3. 建立实体关系。
4. 发布中英文。
5. 加入 Featured 或 Brief。
6. 被 Search 与 Ask 引用。
7. 产生一条更正。
8. API 更新。
9. 下一数据 Release 携带 Correction。

### 10.5 发布材料

- 中英文首页和 About。
- Public Alpha 说明。
- GitHub README、LICENSE、NOTICE、CONTRIBUTING。
- 架构与本地运行文档。
- Trust Center。
- API 与 Open Data 页面。
- 已知限制。
- 反馈、更正和下架入口。

### 10.6 退出标准

- docs/10-acceptance-checklist.md 中所有 P0 项通过，或明确阻止发布。
- 没有占位入口和虚假数字。
- 关键外部边界失败可见。
- 备份与恢复验证完成。
- 当前内容、API 与公开数据版本关系清楚。
- 发布声明使用 Public Alpha，不宣传为完整成熟产品。

## 11. 每周固定节奏

### 11.1 周初

- 选择本周一个可演示用户闭环。
- 冻结 P0，最多保留少量 P1。
- 列出外部依赖和验证方式。
- 确认不会修改无关范围。

### 11.2 每日

- 先修复红色健康问题。
- 完成最小垂直切片。
- 对外部 API、网络和用户输入做边界验证。
- 自动测试与真实页面一起验证。
- 记录新决策，避免只留在对话里。

### 11.3 周末

- 按退出标准验收。
- 用真实数据演示。
- 更新风险和已知限制。
- 删除本周自己产生的无用实验，不清理用户或未来贡献者的无关工作。
- 未通过项优先进入下一周，不用新增范围补偿。

## 12. 工作流并行方式

一人加 AI 的并行不是同时启动十个半成品，而是把可独立验证的工作交给 AI，Owner 保留关键判断。

### 12.1 AI 适合处理

- 根据明确 schema 生成迁移和类型草案。
- Source adapter 与 fixture。
- 中英文 UI 文案和翻译草稿。
- 测试用例和链接检查。
- 历史事件候选与原始来源检索。
- SEO 元数据和文档维护。
- Release manifest 与校验脚本。

### 12.2 Owner 必须处理

- 权利与来源接入决定。
- 核心数据模型取舍。
- Event 合并、模型可比性和 Featured。
- 高影响双语内容。
- 安全密钥和生产访问。
- 更正、下架与最终发布。

## 13. 风险登记

| 风险 | 早期信号 | 应对 |
|---|---|---|
| 八域导致范围过大 | Week 2 仍没有端到端页面 | 保留八域，减少每域记录量和自动化，不做占位 |
| 历史回填吞噬开发 | 当前功能停滞，记录数却持续增加 | 按主题批次和时间预算，Week 6 前停止新增低优先级历史 |
| 去重不可靠 | 首页多条描述同一事件 | 优先原始链接、实体和时间规则，低置信进入人工队列 |
| 双语拖慢发布 | 高影响事件只有一个语言可用 | 结构化事实先完成，AI 草稿 + 关键人工审核；状态透明 |
| Ask 幻觉 | 引用不能支撑结论 | 限定站内证据、引用校验、整体拒答 |
| 权利不清 | 正文或图片来源无法解释 | 默认 metadata_only/link_only，只有明确许可才发布全文 |
| 模型榜争议 | 不同评测被混为总分 | 场景分层、条件展示、Insufficient evidence |
| 单人运营积压 | P0/P1 候选持续增长 | 来源分层、影响分级、降低低价值来源频率 |
| 基础设施过度 | 时间花在 Redis、图数据库或微服务 | 保持模块化单体，只按真实瓶颈演进 |
| 开源与生产泄密 | 数据包出现内部字段或密钥 | 公共 allowlist、privacy filter、Release 校验与人工签发 |

## 14. 范围切割顺序

发生延期时，按以下顺序削减，越靠上越先削：

1. 额外动画、主题和视觉装饰。
2. 二跳图谱与高级图交互。
3. 复杂个性化与本地收藏导出。
4. 更多 RSS 细分 Feed。
5. 额外开放数据格式。
6. 国内镜像自动化，保留人工校验镜像。
7. 来源数量和历史 Event 数量。
8. 低优先级榜单和筛选。

不得削减：

- 原始来源与权利状态。
- 八域的真实基础页面。
- 双语核心界面和内容。
- Search / Ask 边界与引用。
- 更正、撤回和 Trust Center。
- Owner 能够审核与发现失败。

## 15. 发布后 30 天

### 15.1 不立即扩范围

前两周重点观察：

- 哪些模块产生 Qualified Page Views。
- 用户是否回访。
- Search 零结果和 Ask 失败。
- 哪些域最常引导到原始来源。
- 哪些来源和运营任务消耗最多时间。
- 更正、版权和数据反馈。

### 15.2 决策门槛

只有出现真实需求后再决定：

- 是否做登录与同步。
- 是否做高级提醒。
- 是否扩大语言。
- 是否增加高配额 API。
- 是否做团队托管和收费。
- 是否替换搜索、队列或图基础设施。

### 15.3 第一个月的理想结果

- 核心用户能形成每日或每周使用习惯。
- 至少部分用户从 Event 持续进入实体、来源和关系。
- Search 与 Ask 有可诊断的真实查询样本。
- 开放数据有至少一个外部使用或反馈。
- Owner 能在合理时间内维持新鲜度和更正。
- 产品知道下一步应加深哪个内容域，而不是继续横向堆入口。

## 16. 路线图完成定义

六周结束时，完成不等于“所有设想都实现”，而是：

- Public Alpha 的 P0 用户旅程完整。
- 八域有真实数据且共享知识层。
- 中英文、Search、Ask、RSS、Email、API 和 Open Data 形成一个一致系统。
- 排名、权利和更正规则在产品中真实生效。
- 一名 Owner 能持续运营，不需要每天手工修数据库。
- 已知限制公开，P1 和后续方向有数据驱动的优先级。

