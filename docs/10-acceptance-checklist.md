# 10 Public Alpha 验收清单

## 1. 使用方式

本清单是 Public Alpha 的发布门禁，不是功能愿望列表。

- P0：发布前必须通过。失败即 No-Go。
- P1：六周版应通过；若延期必须记录降级、用户影响和补完时间。
- P2：Alpha 后候选，不影响发布。

每项验收应附证据，而不是只打勾。

建议证据格式：

~~~text
Check ID:
Result: pass / fail / waived
Environment:
Data version:
Evidence: test output, screenshot, URL, API response or release artifact
Owner:
Verified at:
Notes:
~~~

Waived 不能用于 P0。P1 的 waived 必须出现在 Known Limitations。

## 2. 发布决策摘要

| 门禁 | 结果 | 证据 |
|---|---|---|
| 产品范围 | 未验收 | |
| 数据与内容 | 未验收 | |
| 双语与全球化 | 未验收 | |
| Search 与 Ask | 未验收 | |
| 排名与推荐 | 未验收 | |
| 权利与开放数据 | 未验收 | |
| 编辑运营 | 未验收 | |
| 安全与隐私 | 未验收 | |
| 性能、SEO 与无障碍 | 未验收 | |
| 部署、备份与可观测性 | 未验收 | |

最终决策：未验收。

## 3. 产品定位与公开承诺

- [ ] P0 SITE-001：产品公开定位为“The open, bilingual map of global AI.”和“开放、双语、全景的全球 AI 信息雷达。”
- [ ] P0 SITE-002：发布页明确标记 Public Alpha。
- [ ] P0 SITE-003：Coverage 页面说明来源以英文和中文为主、事件面向全球，不宣称覆盖全部语言。
- [ ] P0 SITE-004：Known Limitations 页面列出当前来源、历史、评测、翻译和 Agent 的限制。
- [ ] P0 SITE-005：没有“最完整”“绝对客观”“全球第一”等无法证明的宣传。
- [ ] P0 SITE-006：代码开源、数据开放和官方托管服务的边界描述一致。
- [ ] P0 SITE-007：付费不会影响自然排名与 Featured 的原则已公开。
- [ ] P1 SITE-008：About 页面解释 Radar、Library 和 Search/Ask 三层产品结构。

## 4. 导航与信息架构

- [ ] P0 IA-001：桌面主导航直接包含 Radar、Models、Papers、Products、GitHub、Prompts、Skills、Guides。
- [ ] P0 IA-002：全局存在 Search/Ask、Rankings、Open Data 与语言入口。
- [ ] P0 IA-003：移动底部导航为 Home、Radar、Explore、Search、Saved。
- [ ] P0 IA-004：移动 Explore 中可进入全部八个内容域。
- [ ] P0 IA-005：当前内容域和主要筛选状态可通过 URL 恢复。
- [ ] P0 IA-006：八域入口都指向真实内容，不存在 Coming Soon 或空白模板。
- [ ] P0 IA-007：首页模块顺序符合 02 信息架构与 PRD。
- [ ] P0 IA-008：Footer 可直接进入 About、Trust Center、API、Open Data、GitHub 和更正入口。
- [ ] P1 IA-009：面包屑与返回路径在深层实体、关系和榜单页保持语境。

## 5. 首页

- [ ] P0 HOME-001：首屏可看到紧凑 Search/Ask，而非占屏 Hero。
- [ ] P0 HOME-002：存在当日英文和中文 Today’s Brief，且展示数据截止时间。
- [ ] P0 HOME-003：Top Stories 的每项都有 Featured 理由。
- [ ] P0 HOME-004：Latest、Trending、Featured 是明确的独立视图。
- [ ] P0 HOME-005：主 Event Row 显示时间、类型、主来源、来源数量和关联实体。
- [ ] P0 HOME-006：Models、Papers、GitHub、Products、Prompts & Skills、Guides 模块都有真实数据。
- [ ] P0 HOME-007：Topics 可进入对应聚合页。
- [ ] P0 HOME-008：RSS & Email 和 Open Source & Open Data 模块可用。
- [ ] P0 HOME-009：Sponsored 或商业内容与编辑、算法内容视觉区分。
- [ ] P1 HOME-010：列表筛选和选择在返回首页时可按约定保留。

## 6. 八个内容域共同能力

对 Radar、Models、Papers、Products、GitHub、Prompts、Skills、Guides 分别验收：

- [ ] P0 DOMAIN-001：有可分页或稳定加载的列表页。
- [ ] P0 DOMAIN-002：有可直接访问的详情页。
- [ ] P0 DOMAIN-003：有英文与中文呈现，或明确显示某语言内容尚未审核。
- [ ] P0 DOMAIN-004：可从 Search 找到。
- [ ] P0 DOMAIN-005：显示原始来源和 last_verified_at。
- [ ] P0 DOMAIN-006：显示 rights_status 对应的正确内容范围。
- [ ] P0 DOMAIN-007：至少有一种有证据的关系或时间线信息。
- [ ] P0 DOMAIN-008：列表为空时显示真实空状态，不制造示例数据。
- [ ] P0 DOMAIN-009：已撤回、合并或过期对象显示正确状态。
- [ ] P1 DOMAIN-010：内容域主要筛选能组合使用并生成可分享 URL。

## 7. Radar 与 Event

- [ ] P0 RAD-001：同一现实事件的多个来源聚合到一个 Event。
- [ ] P0 RAD-002：Event 详情可展开所有公开来源，原始来源优先。
- [ ] P0 RAD-003：发生、发布、发现和更新时间不被混为一个时间。
- [ ] P0 RAD-004：Event 有中英文标题、本站摘要、类型和状态。
- [ ] P0 RAD-005：Event 关联实体可以点击。
- [ ] P0 RAD-006：来源冲突在页面中可见，不被强行消除。
- [ ] P0 RAD-007：合并 Event 的旧 ID 返回 Tombstone 或重定向到目标。
- [ ] P0 RAD-008：拆分后来源、关系和时间线归属正确。
- [ ] P1 RAD-009：24 小时、7 天和 30 天视图行为与标签一致。

## 8. Models

- [ ] P0 MOD-001：模型家族与具体版本不会被当作同一条无版本记录。
- [ ] P0 MOD-002：详情显示提供商、生命周期、模态、上下文、地区和访问方式。
- [ ] P0 MOD-003：价格记录显示币种、地区、单位、生效时间和来源。
- [ ] P0 MOD-004：输入、输出、缓存、批处理或媒体价格没有混成一个值。
- [ ] P0 MOD-005：Benchmark 显示模型版本、评测版本、任务、设置、日期、主体和来源。
- [ ] P0 MOD-006：厂商自报与独立评测清晰标记。
- [ ] P0 MOD-007：榜单按场景组织，不存在默认万能总分。
- [ ] P0 MOD-008：不可比或缺数据时显示 Insufficient evidence / Not comparable。
- [ ] P0 MOD-009：Value 榜显示质量门槛与成本假设。
- [ ] P0 MOD-010：配置推荐说明为何适合、何时不适合和数据截止时间。
- [ ] P1 MOD-011：少量模型可并列比较，字段和缺失状态一致。

## 9. Papers

- [ ] P0 PAP-001：显示标题、作者、机构、标识符、版本、日期和原始页面。
- [ ] P0 PAP-002：arXiv 描述性元数据与 PDF/全文许可分别处理。
- [ ] P0 PAP-003：本站中英文导读区分原文贡献、限制和 AI Radar 推断。
- [ ] P0 PAP-004：论文可关联 Repo、模型、数据集、产品和事件。
- [ ] P0 PAP-005：Trending 明确说明不代表学术质量。
- [ ] P0 PAP-006：论文修订不静默覆盖版本历史。
- [ ] P1 PAP-007：重点论文显示局部 Related Work 或实现关系。

## 10. Products

- [ ] P0 PRO-001：显示产品定位、开发组织、官方链接和可用地区。
- [ ] P0 PRO-002：价格模式和重大更新有时间线。
- [ ] P0 PRO-003：用户、收入或采用数据的自报状态可见。
- [ ] P0 PRO-004：产品与模型、Repo、Prompt、Skill、Guide 和事件关系可访问。
- [ ] P0 PRO-005：没有无证据的“全球 AI 产品总榜”。
- [ ] P0 PRO-006：厂商提交和商业关系已披露。

## 11. GitHub

- [ ] P0 GH-001：仓库元数据来自允许的官方 API 或核验来源。
- [ ] P0 GH-002：显示 Owner、描述、Topics、语言、Release、更新时间和官方链接。
- [ ] P0 GH-003：License 明确；无 License 时不暗示可复制或商用。
- [ ] P0 GH-004：New & Rising 不由累计 Stars 单独决定。
- [ ] P0 GH-005：榜单显示窗口、截止时间和方法版本。
- [ ] P0 GH-006：页面不复制仓库代码或完整 README。
- [ ] P0 GH-007：归档、删除、转私有和镜像状态能更新。
- [ ] P1 GH-008：异常增星的人工修正有审计说明。

## 12. Prompts

- [ ] P0 PMT-001：Prompt 显示作者、来源、许可和适用模型/工具版本。
- [ ] P0 PMT-002：全文仅在原创、投稿、兼容开放许可或书面授权时展示。
- [ ] P0 PMT-003：无全文权利时只显示允许的描述与原链接。
- [ ] P0 PMT-004：有变量、使用目标、输入和预期输出说明。
- [ ] P0 PMT-005：显示最后验证时间与已知限制。
- [ ] P0 PMT-006：没有跨任务“最好 Prompt”总榜。
- [ ] P1 PMT-007：模型版本变化能使相关验证状态变为 stale。

## 13. Skills

- [ ] P0 SKL-001：显示作者、来源、版本和 License。
- [ ] P0 SKL-002：显示支持平台、依赖、权限和外部 API 要求。
- [ ] P0 SKL-003：安装入口指向官方说明。
- [ ] P0 SKL-004：网站不代用户安装 Skill，不要求提交 API Key。
- [ ] P0 SKL-005：Skill 正文和关联 Repo 代码使用各自许可判断。
- [ ] P0 SKL-006：安全说明只陈述实际检查范围，不写“绝对安全”。
- [ ] P1 SKL-007：维护状态、最近版本和最后验证时间可见。

## 14. Guides

- [ ] P0 GDE-001：Guide 显示作者、版本、日期、审核时间和许可。
- [ ] P0 GDE-002：前置条件、步骤、预期结果和限制完整。
- [ ] P0 GDE-003：会过期的设置、价格和界面步骤显示验证日期。
- [ ] P0 GDE-004：原创、投稿与外部导读明确区分。
- [ ] P0 GDE-005：不通过拼接外部教程形成替代原文的内容。
- [ ] P1 GDE-006：过期 Guide 可标为 stale，并停止默认推荐。

## 15. 知识图谱与时间线

- [ ] P0 GRAPH-001：Entity 类型覆盖 Model、Paper、Product、Repository、Prompt、Skill、Guide、Organization、Person、Benchmark、Topic。
- [ ] P0 GRAPH-002：每条公开 Relation 有类型、方向、证据、时间、置信度和审核状态。
- [ ] P0 GRAPH-003：实体详情可查看出向关系和 Backlinks。
- [ ] P0 GRAPH-004：反向链接来自同一关系数据，不维护冲突副本。
- [ ] P0 GRAPH-005：事件与实体时间线按真实时间排序。
- [ ] P0 GRAPH-006：无证据或仅 AI 猜测的关系不公开。
- [ ] P1 GRAPH-007：一跳局部图可用，并可按关系类型筛选。
- [ ] P1 GRAPH-008：二跳展开限制节点量，不导致页面失控。
- [ ] P0 GRAPH-009：Alpha 没有依赖全局力导向图才能完成核心导航。

## 16. 双语与全球化

- [ ] P0 I18N-001：所有公开核心页面都有 /en 和 /zh 路由策略。
- [ ] P0 I18N-002：系统 UI、错误、状态、筛选、政策和邮件订阅完整双语。
- [ ] P0 I18N-003：核心 Event 与主要 Entity 有中英文标题和摘要。
- [ ] P0 I18N-004：模型、产品和仓库官方名保留可识别原文。
- [ ] P0 I18N-005：翻译方式和审核状态可见。
- [ ] P0 I18N-006：中英文的数字、价格、日期、版本和引用抽样一致。
- [ ] P0 I18N-007：Global、English signals、Chinese signals 语义和过滤正确。
- [ ] P0 I18N-008：页面有正确 lang、hreflang 和 canonical。
- [ ] P0 I18N-009：无实质内容的语言页不会被生成为 SEO 占位页。
- [ ] P1 I18N-010：币种、日期、数字和时区按 locale 呈现。

## 17. Search

- [ ] P0 SRCH-001：Search 不调用 LLM。
- [ ] P0 SRCH-002：精确 ID、论文标识符、官方 URL、模型名和仓库名可找到对应记录。
- [ ] P0 SRCH-003：英文查询可找到相关中文内容，中文查询可找到相关英文内容。
- [ ] P0 SRCH-004：别名、缩写和旧名称可解析到正确实体。
- [ ] P0 SRCH-005：All 与八个内容类型过滤可用。
- [ ] P0 SRCH-006：时间、Topic、组织和语言筛选可组合。
- [ ] P0 SRCH-007：默认相关性不会被热度信号完全覆盖。
- [ ] P0 SRCH-008：结果显示类型、语言、来源、时间和匹配片段。
- [ ] P0 SRCH-009：撤回、internal_only 和不允许公开的字段不会进入结果。
- [ ] P1 SRCH-010：高频零结果与拼写容错测试达到实施时设定的样本门槛。

## 18. Ask Agent

- [ ] P0 ASK-001：Search 和 Ask 是用户明确选择的两种模式。
- [ ] P0 ASK-002：Ask 只检索 AI Radar 公开版本化数据，不进行任意站外搜索。
- [ ] P0 ASK-003：回答显示 generated_at 和 data_cutoff。
- [ ] P0 ASK-004：可核验事实结论有站内引用，引用能继续打开原始来源。
- [ ] P0 ASK-005：引用必须来自本次检索证据包。
- [ ] P0 ASK-006：证据冲突时回答明确展示冲突。
- [ ] P0 ASK-007：评测、价格或时间条件不可比时不输出确定排名。
- [ ] P0 ASK-008：证据不足或超出覆盖时明确拒答。
- [ ] P0 ASK-009：回答支持中英文切换，引用对象不改变。
- [ ] P0 ASK-010：网页文字无法把 Ask 诱导为执行工具、泄露指令或读取内部数据。
- [ ] P0 ASK-011：Ask 不安装 Skill、不保存 API Key、不代用户购买或配置。
- [ ] P1 ASK-012：有轻量有用性与引用错误反馈。

## 19. 排名与推荐

- [ ] P0 RANK-001：每个榜单公开回答的问题、资格、窗口、来源、方法版本和限制。
- [ ] P0 RANK-002：Latest 使用发生或发布时间，不用抓取时间冒充。
- [ ] P0 RANK-003：Trending 先按来源标准化，再合并跨来源信号。
- [ ] P0 RANK-004：Trending 有新鲜度衰减和数据截止时间。
- [ ] P0 RANK-005：Featured 有推荐理由、编辑角色、时间和利益关系。
- [ ] P0 RANK-006：Sponsored 不影响自然 Trending 或 Featured。
- [ ] P0 RANK-007：数据不足时允许不排名。
- [ ] P0 RANK-008：排名观察保留 raw metrics、evidence 和 methodology_version。
- [ ] P0 RANK-009：论文趋势不声称代表学术质量。
- [ ] P0 RANK-010：Prompt、Skill 和 Guide 不存在无依据综合最佳榜。
- [ ] P0 RANK-011：方法重大变更不覆盖旧历史。
- [ ] P1 RANK-012：已确认刷量修正有审计和公开说明。

## 20. Saved、RSS 与 Email

- [ ] P0 SAVE-001：收藏不要求登录并保存在浏览器本地。
- [ ] P0 SAVE-002：界面说明清除浏览器数据或更换设备会丢失。
- [ ] P0 SAVE-003：默认语言、主题或已读状态只按公开说明存储。
- [ ] P1 SAVE-004：可清除或导出本地保存数据。
- [ ] P0 RSS-001：英文全球日报 RSS 可订阅和解析。
- [ ] P0 RSS-002：中文全球日报 RSS 可订阅和解析。
- [ ] P0 RSS-003：八域 Latest RSS 与网页公开状态一致。
- [ ] P0 RSS-004：RSS 不复制新闻全文或受限正文。
- [ ] P0 MAIL-001：英文和中文日报可独立订阅。
- [ ] P0 MAIL-002：订阅使用明确同意和双重确认。
- [ ] P0 MAIL-003：退订立即生效。
- [ ] P0 MAIL-004：邮件内容来自已发布 Brief/Event，链接和来源正确。
- [ ] P0 MAIL-005：发送失败、退信和成功状态不混淆。
- [ ] P0 MAIL-006：订阅邮箱不进入日志、公共 API 或开放数据。

## 21. Public API

- [ ] P0 API-001：API 只读并有明确 major version。
- [ ] P0 API-002：事件、实体、关系、搜索、排名、更正、Tombstone 和 Release 资源可访问。
- [ ] P0 API-003：响应包含 data_version、稳定 ID、来源、权利和 last_verified_at。
- [ ] P0 API-004：列表使用稳定游标分页与有界 page size。
- [ ] P0 API-005：速率限制和错误语义有文档。
- [ ] P0 API-006：受限原文、私有提交、内部审核和管理数据不可访问。
- [ ] P0 API-007：合并、撤回和更正对象返回明确状态。
- [ ] P1 API-008：有 OpenAPI 描述和可运行请求示例。
- [ ] P0 API-009：网站与 API 的同一 public_id 指向相同事实。

## 22. 来源与权利

- [ ] P0 RIGHTS-001：每个 Source 有等级、接入状态、获取方式、条款、许可和最近复核时间。
- [ ] P0 RIGHTS-002：每个公开记录有 rights_status、source_url 和 attribution。
- [ ] P0 RIGHTS-003：公开可访问不会被自动推导为可再分发。
- [ ] P0 RIGHTS-004：新闻只发布事实元数据、本站摘要、必要短引和链接，不发布全文或付费内容。
- [ ] P0 RIGHTS-005：第三方图片、封面、视频和 Logo 只在授权范围内展示。
- [ ] P0 RIGHTS-006：GitHub 无 License 与开放许可明确区分。
- [ ] P0 RIGHTS-007：arXiv 元数据 CC0 与 e-print 单项许可明确区分。
- [ ] P0 RIGHTS-008：Prompt、Skill 和 Guide 正文仅在有权时公开。
- [ ] P0 RIGHTS-009：AI HOT 未获书面授权前只作机制参考与发现线索。
- [ ] P0 RIGHTS-010：AI 生成摘要使用本站表达、来源可追溯，不替代原文。
- [ ] P0 RIGHTS-011：机器翻译没有扩大原内容许可范围。
- [ ] P0 RIGHTS-012：权利状态改变能影响页面、Search、API 和 Release。

## 23. 开源与开放数据

- [ ] P0 OPEN-001：代码仓库有 Apache-2.0 LICENSE。
- [ ] P0 OPEN-002：NOTICE、README 和 CONTRIBUTING 解释代码及第三方许可边界。
- [ ] P0 OPEN-003：数据页面说明 CC BY 4.0 只覆盖 AI Radar 有权开放的内容。
- [ ] P0 OPEN-004：每条发行记录有 provenance、rights_status 和 license 字段。
- [ ] P0 OPEN-005：Production data 经过 rights、privacy、schema 和 validation 流程生成发行物。
- [ ] P0 OPEN-006：permission_required、internal_only 和 withdrawn 不进入数据包。
- [ ] P0 OPEN-007：数据包不含原文缓存、订阅邮箱、管理备注、Token 或私密提交信息。
- [ ] P0 OPEN-008：发行物包含 manifest、schema、release notes、license、attribution 和 SHA-256 checksum。
- [ ] P0 OPEN-009：GitHub Release 是规范版本。
- [ ] P0 OPEN-010：飞书或百度网盘镜像文件与规范 Release checksum 一致。
- [ ] P0 OPEN-011：大型数据文件不进入主 Git 历史。
- [ ] P0 OPEN-012：Corrections 和 Tombstones 包含自上一版以来的变化。
- [ ] P0 OPEN-013：从空目录下载 Release 后可按文档读取和验证。

## 24. Trust Center

- [ ] P0 TRUST-001：Editorial Policy 中英双语可访问。
- [ ] P0 TRUST-002：Source Policy 中英双语可访问。
- [ ] P0 TRUST-003：Translation Policy 中英双语可访问。
- [ ] P0 TRUST-004：Deduplication Policy 中英双语可访问。
- [ ] P0 TRUST-005：Ranking Methodology 中英双语可访问。
- [ ] P0 TRUST-006：AI-generated Content Policy 中英双语可访问。
- [ ] P0 TRUST-007：Dataset License 中英双语可访问。
- [ ] P0 TRUST-008：Commercial Disclosure 中英双语可访问。
- [ ] P0 TRUST-009：Corrections 与 Takedown 流程中英双语可访问。
- [ ] P0 TRUST-010：Coverage、Known Limitations 和 Status 中英双语可访问。
- [ ] P0 TRUST-011：政策页有版本、生效日期和变更记录入口。
- [ ] P0 TRUST-012：Trust Center 不要求登录。

## 25. Owner Admin

- [ ] P0 ADM-001：管理端不可被公共搜索索引，并使用强身份验证。
- [ ] P0 ADM-002：Inbox 显示新候选、来源、时间、权利和解析状态。
- [ ] P0 ADM-003：Owner 可以合并、拆分 Event 并预览影响。
- [ ] P0 ADM-004：Owner 可以编辑实体、别名、关系和本地化状态。
- [ ] P0 ADM-005：Owner 可以编排 Featured 和双语 Daily Brief。
- [ ] P0 ADM-006：Owner 可以管理 Source、Rights、Permission 和 Attribution。
- [ ] P0 ADM-007：Owner 可以创建 Correction、Withdrawn 和 Tombstone。
- [ ] P0 ADM-008：Owner 可以运行数据 Release 预检并查看失败原因。
- [ ] P0 ADM-009：Source 失败、过期、队列、Search、Ask 和 Email 健康可见。
- [ ] P0 ADM-010：发布、合并、拆分、权利、更正和 Release 有 audit log。
- [ ] P0 ADM-011：外部 API 和网络错误不会被静默转为空数据。

## 26. 编辑运营

- [ ] P0 OPS-001：首批核心来源完成接入和权利复核。
- [ ] P0 OPS-002：候选有 P0 breaking、P1 major、P2 useful、P3 signal 分级。
- [ ] P0 OPS-003：高影响 Event 按原始来源、事实、版本、时间、关系和权利清单核验。
- [ ] P0 OPS-004：中英文关键内容有明确 AI 草稿与人工审核状态。
- [ ] P0 OPS-005：Featured 必填理由、适用人群和利益披露。
- [ ] P0 OPS-006：Daily Brief 由已发布 Event 组成，并完成双语审核。
- [ ] P0 OPS-007：八域有明确维护节奏和新鲜度预期。
- [ ] P0 OPS-008：模型价格和 Benchmark 有单独复核流程。
- [ ] P0 OPS-009：Prompt/Skill 投稿含作者、来源、版本、权限和许可声明。
- [ ] P0 OPS-010：Search 零结果与 Ask 引用失败有定期抽检流程。
- [ ] P0 OPS-011：更正、权利与安全事件有分级响应路径。
- [ ] P0 OPS-012：发布日运营演练完成并有证据。

## 27. 历史回填

- [ ] P0 HIST-001：主时间线从 2022-11-30 开始。
- [ ] P0 HIST-002：2022-11-30 前内容标为 Curated Prehistory。
- [ ] P0 HIST-003：历史 Event 按关键主题回填，不是逐篇新闻复制。
- [ ] P0 HIST-004：每个历史 Event 有原始或高质量来源。
- [ ] P0 HIST-005：关键历史 Event 有实体和跨域关系。
- [ ] P0 HIST-006：历史内容权利状态完整。
- [ ] P0 HIST-007：发布数量以质量为准；若低于 1,000，Coverage 说明真实范围。
- [ ] P1 HIST-008：在质量允许时达到 1,000–3,000 个 distinct Events。

## 28. 更正、撤回与 Tombstone

- [ ] P0 CORR-001：每个详情页有更正或报告入口。
- [ ] P0 CORR-002：更正案例记录请求、证据、决定、状态和时间。
- [ ] P0 CORR-003：事实修正更新当前记录并发布 Correction。
- [ ] P0 CORR-004：合并对象的旧 ID 有 merged_into。
- [ ] P0 CORR-005：权利下架移除受限字段并保留最小 Tombstone。
- [ ] P0 CORR-006：来源撤回会更新 Event 置信度与页面状态。
- [ ] P0 CORR-007：更正传播到 Search、Ask、API 和下一 Release。
- [ ] P0 CORR-008：系统没有通过静默删除隐藏已公开历史。
- [ ] P0 CORR-009：高风险内容可先限制传播，再完成核验。

## 29. 安全与隐私

- [ ] P0 SEC-001：生产密钥只在服务端环境存在，不进入客户端 bundle、日志或仓库。
- [ ] P0 SEC-002：抓取内容和用户提交视为不可信输入。
- [ ] P0 SEC-003：外部 URL 获取限制协议、重定向和内网地址，防止 SSRF。
- [ ] P0 SEC-004：公开 HTML 经过安全处理，默认文本不会执行来源脚本。
- [ ] P0 SEC-005：管理端有安全 Session、CSRF 防护和操作审计。
- [ ] P0 SEC-006：Ask 的来源内容不能改变系统边界或调用未授权工具。
- [ ] P0 SEC-007：邮件地址、IP、设备和行为日志遵循最小收集。
- [ ] P0 SEC-008：人物实体只包含必要、公开、可核验的职业信息。
- [ ] P0 SEC-009：Release 前完成 secret、隐私和受限字段扫描。
- [ ] P0 SEC-010：依赖与部署镜像完成已知高严重性漏洞检查。
- [ ] P0 SEC-011：安全问题有私密报告渠道。

## 30. 数据一致性与流水线

- [ ] P0 DATA-001：同一采集游标重跑不会重复写入公开对象。
- [ ] P0 DATA-002：Source Item 与 Event 是独立对象，关系正确。
- [ ] P0 DATA-003：中英文共享不可翻译事实，不保存冲突副本。
- [ ] P0 DATA-004：事实变化会将受影响本地化内容标为 stale。
- [ ] P0 DATA-005：Relation 的证据删除或撤回会更新公开状态。
- [ ] P0 DATA-006：Featured 与算法 score 存储分离。
- [ ] P0 DATA-007：价格和 Benchmark 使用结构化有效期与版本。
- [ ] P0 DATA-008：Source adapter 错误可重试、可观测且不会被吞掉。
- [ ] P0 DATA-009：Search 索引能处理发布、合并、更正、撤回和权利变更。
- [ ] P0 DATA-010：稳定 public_id 不被复用。

## 31. SEO

- [ ] P0 SEO-001：公共核心页面服务端提供主要内容与元数据。
- [ ] P0 SEO-002：/en 与 /zh 有正确 sitemap。
- [ ] P0 SEO-003：Event 和 Entity 页面 title、description、canonical 有效。
- [ ] P0 SEO-004：页面不依赖客户端执行才能发现原始来源链接。
- [ ] P0 SEO-005：自动页面有实际事实、来源和关系价值，不是关键词复制页。
- [ ] P0 SEO-006：撤回、内部和低价值空页不进入索引。
- [ ] P1 SEO-007：适用页面提供有效结构化数据且通过验证。

## 32. 无障碍

- [ ] P0 A11Y-001：桌面与移动核心旅程可用键盘完成。
- [ ] P0 A11Y-002：焦点可见，跳转顺序符合阅读顺序。
- [ ] P0 A11Y-003：标题层级、Landmark、表格和列表语义正确。
- [ ] P0 A11Y-004：交互控件有可理解名称，不只依赖图标或颜色。
- [ ] P0 A11Y-005：文本与关键控件达到 WCAG AA 对比度目标。
- [ ] P0 A11Y-006：图谱存在可访问的列表替代，不要求视觉拖动才能导航。
- [ ] P0 A11Y-007：语言切换和当前语言可被辅助技术识别。
- [ ] P0 A11Y-008：错误、加载和空状态有文本说明。

## 33. 响应式与浏览器

- [ ] P0 RESP-001：至少在 1280×720 桌面视口完成所有核心旅程。
- [ ] P0 RESP-002：至少在 390×844 移动视口完成所有核心旅程。
- [ ] P0 RESP-003：核心页面无非预期横向滚动。
- [ ] P0 RESP-004：八域导航在移动端可发现。
- [ ] P0 RESP-005：表格、榜单和模型比较在窄屏可读。
- [ ] P0 RESP-006：Search/Ask 输入、引用和过滤在移动端可操作。
- [ ] P0 RESP-007：一跳图谱不会遮挡正文或阻塞页面导航。
- [ ] P0 RESP-008：当前主要 Chromium、Safari 和 Firefox 版本完成冒烟测试。

## 34. 性能与可靠性

具体预算在实施时基于部署环境锁定，至少满足：

- [ ] P0 PERF-001：首页、Radar、Search 和详情页不存在明显阻塞用户的串行外部 API 请求。
- [ ] P0 PERF-002：公共页面不在请求时实时抓取第三方来源。
- [ ] P0 PERF-003：图片和非核心模块延迟加载，正文与来源优先。
- [ ] P0 PERF-004：列表使用有界查询和稳定分页。
- [ ] P0 PERF-005：局部图限制节点和查询深度。
- [ ] P0 PERF-006：Ask 证据条数、上下文和超时有明确上限。
- [ ] P0 PERF-007：外部来源、邮件和 LLM 故障不会拖垮公共 Search 和静态详情页。
- [ ] P0 PERF-008：主要页面经过真实部署环境性能测试并记录结果。
- [ ] P1 PERF-009：核心 Web Vitals 达到项目实施时设定的 Public Alpha 预算。

## 35. 可观测性

- [ ] P0 OBS-001：每个核心 Source 有 last_success_at、last_item_at、lag 和错误状态。
- [ ] P0 OBS-002：Worker 队列长度、失败和重试可见。
- [ ] P0 OBS-003：Search 索引截止时间和失败任务可见。
- [ ] P0 OBS-004：Ask 延迟、成本、引用通过率和拒答率可见。
- [ ] P0 OBS-005：Email 发送、失败、退信和退订可见。
- [ ] P0 OBS-006：Release 校验和镜像状态可见。
- [ ] P0 OBS-007：公共状态页不暴露内部密钥、路径或私人信息。
- [ ] P0 OBS-008：告警只覆盖需要行动的持续故障，不为每次短暂网络失败轰炸 Owner。

## 36. 备份与恢复

- [ ] P0 DR-001：PostgreSQL 有自动备份。
- [ ] P0 DR-002：完成一次从备份恢复到隔离环境的演练。
- [ ] P0 DR-003：恢复后 Event、Entity、Relation、Rights、Audit 和稳定 ID 一致。
- [ ] P0 DR-004：对象存储备份不违反来源保留策略。
- [ ] P0 DR-005：公开 Release 不能被当作生产数据库唯一备份。
- [ ] P0 DR-006：恢复过程和责任人有文档。

## 37. 测试

- [ ] P0 TEST-001：URL、时间、价格、License 和外部 ID 标准化有单元测试。
- [ ] P0 TEST-002：不可合并事件和模型不可比条件有测试。
- [ ] P0 TEST-003：rights_status 到页面/API/Release 的映射有测试。
- [ ] P0 TEST-004：来源 fixture 到公开 Event 的集成测试通过。
- [ ] P0 TEST-005：Event 合并/拆分到 Search、关系和 Tombstone 的集成测试通过。
- [ ] P0 TEST-006：更正到页面、API 和下一 Release 的集成测试通过。
- [ ] P0 TEST-007：Ask 引用成功、冲突、不可比和拒答测试通过。
- [ ] P0 TEST-008：RSS 与 Email 生成、退订和失败状态测试通过。
- [ ] P0 TEST-009：中英文事实一致性抽样或自动检查通过。
- [ ] P0 TEST-010：桌面和移动核心 E2E 通过。
- [ ] P0 TEST-011：Open Data manifest 和 checksum 从干净环境验证通过。

## 38. 开源仓库质量

- [ ] P0 REPO-001：README 说明产品定位、Public Alpha 状态和本地运行方式。
- [ ] P0 REPO-002：环境变量模板不含真实密钥。
- [ ] P0 REPO-003：架构、数据模型、来源和许可文档可从 README 找到。
- [ ] P0 REPO-004：测试、类型检查、构建和格式检查命令有文档并通过。
- [ ] P0 REPO-005：贡献指南区分代码、原创内容/数据和第三方链接提交。
- [ ] P0 REPO-006：Issue 模板包含 Bug、Source suggestion、Correction、Rights/Security 的正确入口。
- [ ] P0 REPO-007：大型数据文件和生产原文缓存不在 Git 历史。
- [ ] P0 REPO-008：第三方依赖许可和必要 NOTICE 已检查。
- [ ] P1 REPO-009：有公开 Roadmap 和已知限制。

## 39. 分析与隐私

- [ ] P0 METRIC-001：Monthly Qualified Page Views 的事件定义已冻结并版本化。
- [ ] P0 METRIC-002：7-Day Returning Reader Rate 计算不要求创建隐蔽跨站身份。
- [ ] P0 METRIC-003：来源点击、Search、Ask、收藏、订阅和关系导航可作为价值事件分析。
- [ ] P0 METRIC-004：分析不采集 Ask 以外不必要的敏感查询内容；保留策略已说明。
- [ ] P0 METRIC-005：Cookie 或本地存储使用符合公开隐私说明和适用同意要求。
- [ ] P0 METRIC-006：内部统计不会进入开放数据。
- [ ] P1 METRIC-007：各内容域 Qualified Page View 与新鲜度可对照分析。

## 40. 发布前端到端演练

使用一条新的真实事件完成：

- [ ] P0 E2E-001：Source adapter 成功获取并记录 Ingest Run。
- [ ] P0 E2E-002：Source Item 经过规范化和 Rights 分类。
- [ ] P0 E2E-003：系统找到或创建正确 Event，第二来源能合并。
- [ ] P0 E2E-004：相关实体与有证据 Relation 建立。
- [ ] P0 E2E-005：英文与中文内容生成、核验并发布。
- [ ] P0 E2E-006：Event 出现在 Radar 和正确内容域。
- [ ] P0 E2E-007：Search 可以用中英文找到它。
- [ ] P0 E2E-008：Ask 可以引用它回答一个问题。
- [ ] P0 E2E-009：它可以进入 Brief 或 Featured，且理由正确。
- [ ] P0 E2E-010：RSS 或邮件输出引用正确。
- [ ] P0 E2E-011：Public API 返回同一 public_id 与 data_version。
- [ ] P0 E2E-012：模拟一条事实更正，页面、Search、Ask 与 API 更新。
- [ ] P0 E2E-013：下一 Open Data 演练包含 Correction 或 Tombstone。

## 41. 发布内容抽检样本

发布前至少抽检：

- [ ] P0 SAMPLE-001：10 条高影响 Event。
- [ ] P0 SAMPLE-002：20 条普通 Event。
- [ ] P0 SAMPLE-003：10 个模型版本与其价格。
- [ ] P0 SAMPLE-004：10 条 Benchmark 记录。
- [ ] P0 SAMPLE-005：10 篇重点论文。
- [ ] P0 SAMPLE-006：10 个 GitHub 仓库及 License。
- [ ] P0 SAMPLE-007：10 个产品档案。
- [ ] P0 SAMPLE-008：各 10 个 Prompt、Skill 与 Guide，或该域全部记录不足 10 条时全检。
- [ ] P0 SAMPLE-009：20 组中英文内容一致性。
- [ ] P0 SAMPLE-010：20 条 Relation 与 Backlink。
- [ ] P0 SAMPLE-011：20 个 Search 查询，覆盖中英文与八域。
- [ ] P0 SAMPLE-012：20 个 Ask 问题，覆盖成功、冲突、不可比和拒答。

抽检发现系统性错误时扩大样本并修复根因，不能只修样本记录。

## 42. No-Go 条件

出现以下任一项，不公开发布：

- 任一主内容域只有占位页或无真实详情。
- Search 与 Ask 没有明确边界，或 Ask 会无说明地搜索站外。
- Ask 引用不能证明回答结论。
- 生产数据可以绕过 Rights/Privacy filter 直接导出。
- 新闻全文、付费内容、第三方 Prompt/Skill 正文或 Repo 内容被无授权复制。
- 中英文核心页面事实持续不一致。
- Trending、Featured 与 Sponsored 混淆。
- 模型总榜混用版本、任务或价格单位。
- 管理端、密钥、邮箱或内部备注可由公共路径访问。
- 更正或撤回不能传播到页面和 API。
- 核心来源失败会被静默显示成“没有新内容”。
- 没有备份恢复证据。
- Trust Center、Coverage 和 Known Limitations 未公开。

## 43. 最终签发

### 43.1 必须记录

| 项目 | 内容 |
|---|---|
| Release candidate | |
| Git commit | |
| Database migration | |
| Public data version | |
| Methodology version | |
| Content cutoff | |
| English brief version | |
| Chinese brief version | |
| Canonical data release | |
| Domestic mirror checksum | |
| Known limitations | |
| Owner | |
| Signed at | |

### 43.2 决策

- [ ] 所有 P0 已通过并有证据。
- [ ] 所有未完成 P1 已公开记录影响与计划。
- [ ] No-Go 条件全部为 false。
- [ ] Owner 完成最终内容、权利、安全和运营签发。

最终结论：

- [ ] Go：可以作为 AI Radar Public Alpha 公开发布。
- [ ] No-Go：阻塞项已记录，修复后重新验收。

