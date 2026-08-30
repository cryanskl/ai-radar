# 05 来源、权利与开放数据

## 1. 文档目的

AI Radar 希望做到“信息尽可能全”，但“全”不能建立在复制他人表达、绕过付费墙或混淆授权的基础上。

本文件定义：

- 哪些来源可以进入系统。
- 各类内容默认保存到什么程度。
- 代码开源与数据开放的边界。
- 数据发布、署名、更正、撤回和下架机制。
- AI HOT 等第三方聚合站的使用原则。
- Public Alpha Trust Center 需要公开的政策。

本文件是产品与工程基线，不构成法律意见。上线前应由适用法域的专业人士审阅高风险采集、再发布和商业化场景。

## 2. 基本原则

### 2.1 原始来源优先

页面、API 和数据快照都应优先指向：

- 官方公告、官方博客或官方文档。
- 论文原始页面和作者页面。
- 官方代码仓库和 Release。
- 产品官方定价与更新日志。
- 内容作者的原始发布页。

聚合站、媒体和社区可作为发现渠道、交叉证据或观点来源，但不取代原始来源。

### 2.2 事实可以整理，表达不能任意复制

AI Radar 可以建立自己的结构化事实、事件聚类、简短摘要、分类、关系和分析；不默认复制：

- 新闻全文。
- 大段原文或原摘要。
- 付费内容。
- 原站图片、封面和视频。
- 其他聚合站的编辑摘要、标签、热度分或榜单结构。
- GitHub 仓库代码或完整 README。
- 未获授权的 Prompt、Skill 或 Guide 正文。

引用只取完成说明所必需的最小范围，并提供显著来源链接。

### 2.3 权利状态是记录级字段

同一来源中的不同记录可能拥有不同许可。权利不能只配置在 Source 层；每条 Source Item、Entity Content 和导出记录都必须有明确 rights_status。

### 2.4 对外发布必须显式通过过滤器

生产数据库不是开放数据集。公开版本由明确流水线生成：

~~~text
Production data
  -> rights filter
  -> privacy filter
  -> public schema transform
  -> validation
  -> checksum and manifest
  -> release
~~~

任何没有明确公开资格的字段默认不进入发行包。

## 3. 来源分层

来源等级描述“事实追溯优先级”，不是对某机构永久信誉的判决。

| 等级 | 来源类型 | 典型用途 |
|---|---|---|
| S | 官方、作者、原始论文、官方仓库、法规或一手数据 | 核心事实与原始证据 |
| A | 有编辑责任和更正机制的专业媒体、独立评测、研究机构 | 独立验证与背景 |
| B | 高质量社区、专家个人内容、行业通讯 | 发现、观点与早期信号 |
| C | 聚合站、社交转发、匿名或难以核验来源 | 发现线索，不单独支撑高置信事实 |

一条重要 Event 应尽量由 S 级来源支撑；如果只有 B 或 C 级信号，页面必须降低置信度并说明。

## 4. 来源接入流程

### 4.1 接入前检查

每个 Source 至少记录：

- 名称、主页和内容类型。
- 发布主体与联系渠道。
- RSS、API、网页或人工提交的获取方式。
- 服务条款、robots、API 条款和速率限制。
- 默认版权或数据许可。
- 是否包含用户个人数据。
- 可存储字段与禁止存储字段。
- 可展示范围和可导出范围。
- 署名要求。
- 最近复核时间。

### 4.2 接入决策

| 状态 | 含义 |
|---|---|
| approved | 已明确可按配置采集和使用 |
| approved_limited | 仅可保存元数据、短摘或链接 |
| permission_pending | 等待书面许可，不进入自动生产采集 |
| blocked | 条款、技术限制或风险不允许采集 |
| retired | 曾接入，现已停止 |

### 4.3 定期复核

来源条款、API 和许可会变化。Public Alpha 至少在以下情况触发人工复核：

- Source 首次接入。
- 服务条款或 API 版本变化。
- 收到权利人通知。
- 导出范围扩大。
- 从非商业实验转向商业服务。
- 引入全文、媒体文件或用户数据。

## 5. 记录级权利状态

Public Alpha 使用以下枚举：

| rights_status | 允许的默认行为 |
|---|---|
| open | 可按明确开放许可保存、展示和再分发 |
| attribution_required | 可使用，但必须满足署名或通知要求 |
| source_license | 依赖该记录自身许可，导出时同时携带许可信息 |
| metadata_only | 只保存和发布事实性元数据、本站摘要及原链接 |
| link_only | 只保存最少识别信息并链接原站，不展示正文 |
| permission_required | 未获授权前不公开受保护内容 |
| internal_only | 仅用于内部去重、审核或质量控制，不对外发布 |
| withdrawn | 已撤回或不得继续分发；公开版本仅保留必要墓碑 |

辅助字段：

- license_spdx 或许可 URI。
- attribution_text。
- original_creator。
- original_url。
- permission_evidence。
- rights_checked_at。
- export_allowed。
- media_reuse_allowed。
- excerpt_limit。
- takedown_case_id。

export_allowed 不能由是否“公开可访问”自动推导。

## 6. 各内容类型的默认规则

### 6.1 新闻与公告

默认保存：

- 标题、作者或发布机构、发布时间、原链接。
- 本站独立撰写的事实摘要。
- 事件类型、实体关系和主题标签。
- 必要的极短引文及其来源定位。
- 来源与更正状态。

默认不保存或再发布：

- 新闻全文。
- 大段导语、付费墙内容或原站摘要的机械翻译。
- 原站媒体资源，除非许可或书面授权允许。
- 其他站点独有的编辑结论和评分。

AI 生成摘要必须基于已记录来源，经过事实核对，并标明生成或编辑方式。

### 6.2 论文

论文记录默认包含：

- 标题、作者、摘要页链接、标识符、版本和时间。
- 论文平台允许使用的描述性元数据。
- 本站独立双语摘要和实体关系。
- 代码、模型、数据集与后续事件链接。

arXiv 的描述性元数据与论文全文使用不同权利口径。arXiv API Terms of Use 说明 API 返回的描述性元数据采用 CC0，但 e-print 内容的再分发取决于每篇论文的许可；系统必须逐项记录全文许可，不能因为来自 arXiv 就统一视为开放全文。参考：[arXiv API Terms of Use](https://info.arxiv.org/help/api/tou.html)。

Public Alpha 不把论文 PDF 打包进开放数据发行版。

### 6.3 GitHub 仓库

公开仓库不等于拥有开放再分发许可。GitHub 官方文档明确说明，没有许可证时默认版权法仍适用；AI Radar 因此需要单独记录 License 状态。参考：[Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。

默认保存和开放：

- 仓库名称、所有者、描述、主题、语言、公开计数、更新时间和链接。
- Release 元数据。
- License 标识与检测状态。
- AI Radar 自己计算的趋势观察和关系。

默认不复制：

- 仓库源代码。
- 完整 README、Issues 或 Discussions 内容。
- 仓库图片与品牌素材。

采集优先使用官方 [GitHub REST API](https://docs.github.com/en/rest)，遵守认证、速率和使用条款。开放数据只发布允许再分发的字段与本站派生观察。

### 6.4 模型、评测与价格

默认保存：

- 官方模型名称、版本、发布日期、上下文、模态和可用地区。
- 官方或独立评测中的事实性结果与清晰出处。
- 官方公开价格、单位、生效时间和币种。
- 本站结构化比较和方法版本。

评测图表、报告全文和第三方数据库整包不因数值可见就自动复制。可展示原始数值时也必须保留数据来源、评测条件和许可状态。

### 6.5 产品

默认保存公开事实、官方链接、价格与版本变化、本地化摘要和关联实体。Logo、截图、宣传视频和用户评论仅在相应授权范围内使用。

厂商提交资料需要勾选权利声明，并与自然采集内容共用同一事实核验标准。

### 6.6 Prompt

允许发布全文的情形：

- AI Radar 原创。
- 作者直接提交并同意指定开放许可。
- 来源明确使用兼容的开放许可。
- 获得书面授权。

其他 Prompt 默认只保存：标题、作者、用途、适用模型、简短描述和原链接。轻微改写或翻译不会自动产生可自由再发布的权利。

### 6.7 Skill

Skill 需要同时考虑：

- Skill 文档文字的版权许可。
- 关联仓库代码许可。
- 安装或执行可能需要的权限。
- 外部 API 与密钥要求。

AI Radar Public Alpha 只做发现、介绍、版本、兼容性和原始安装说明链接，不代用户执行安装，不收集 API Key，不把未经许可的 Skill 正文装入数据包。

### 6.8 Guide

Guide 以 AI Radar 原创、作者投稿或明确授权内容为主。引用外部教程时提供必要摘要、评论与原始链接，不做替代原文的拼接式转载。

## 7. 第三方聚合站与 AI HOT

### 7.1 原则

第三方聚合站可以帮助发现来源和理解产品机制，但不能成为被复制的数据仓库。

对 AI HOT，Public Alpha 的默认态度是：

- 可借鉴信息组织机制和用户体验思想。
- 可把它作为人工发现入口，再回到原始来源核验。
- 未获书面授权前，不批量复制其新闻摘要、标签、热度、精选、图片或数据库。
- 不把 AI HOT 的编辑判断伪装成 AI Radar 自己的排名。
- 系统不能依赖其持续可用才能运行。

AI HOT 条款对内容与服务使用设有限制，因此批量采集或再发布必须先取得明确授权。参考：[AI HOT 服务条款](https://aihot.virxact.com/terms)。

### 7.2 如获得授权

授权材料应记录：

- 许可主体与授权人。
- 允许的字段、用途、地区和期限。
- 是否允许商业使用、翻译、衍生和再分发。
- 署名方式。
- 更新或终止机制。
- 是否允许进入 CC BY 4.0 数据集。

即使获得授权，也保留原始来源链接，并避免重复事件污染数据。

## 8. 历史回填

历史数据从 2022-11-30 的 ChatGPT research preview 开始，参考 OpenAI 的原始发布页：[Introducing ChatGPT](https://openai.com/index/chatgpt/)。

回填目标是 1,000–3,000 个经过策展的关键 Event，不是从该日期起抓取每篇文章。

历史回填优先级：

1. 官方发布和原始论文。
2. 重大模型、产品和开源项目节点。
3. 能解释后续生态变化的政策、价格、评测和组织事件。
4. 高质量独立报道作为交叉证据。
5. 聚合站仅作发现线索。

对 2022-11-30 以前的关键背景使用 Curated Prehistory 专题，不伪装成完整历史。

## 9. 摘要、翻译与生成式内容

### 9.1 摘要

本站摘要需要：

- 使用自己的表达。
- 区分来源明确陈述、第三方判断和 AI Radar 推断。
- 保留原始出处。
- 不替代用户阅读原文。
- 对关键数字和引语进行人工或规则核验。

美国版权局关于新闻出版物保护的研究可作为版权风险背景材料，但具体法域和事实需单独判断。参考：[Copyright Protections for Press Publishers](https://www.copyright.gov/policy/publishersprotections/202206-Publishers-Protections-Study.pdf)。

### 9.2 翻译

中英文页面共享事实层，但译文属于独立本地化记录。翻译页面展示：

- 原始语言。
- 翻译方式：AI draft、human reviewed 或 human authored。
- 最近审核时间。
- 关键术语原文。
- 原始来源链接。

机器翻译不能扩大原文许可范围。

### 9.3 搜索质量

批量生成低价值页面会伤害用户信任和搜索质量。自动页面只有在具备独立事实、来源、关系和实际检索价值时才发布；不得仅为 SEO 复制或轻改外部内容。参考：[Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies)。

## 10. 代码与数据许可

### 10.1 代码

AI Radar 自有源代码采用 Apache License 2.0。第三方依赖继续遵循各自许可，不被项目许可证重新许可。

仓库根目录后续应包含：

- LICENSE：Apache-2.0 正文。
- NOTICE：需要保留的通知。
- README：许可范围与第三方依赖说明。
- CONTRIBUTING：贡献者许可声明。

官方文本：[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.html)。

### 10.2 数据

AI Radar 自有且有权开放的数据，计划采用 CC BY 4.0。它主要覆盖：

- AI Radar 自己创建的结构化描述。
- 自己撰写的可开放双语摘要。
- 自己建立的事件聚类与关系。
- 自己计算并可公开的方法化观察。
- 已明确允许按兼容条款再分发的来源字段。

不属于 AI Radar 或没有再许可权的第三方内容不因进入数据库就变成 CC BY 4.0。发行包必须逐记录携带 provenance 和 rights_status。

官方文本：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。许可理解可参考：[Creative Commons FAQ](https://creativecommons.org/faq/)。

### 10.3 许可声明模板

数据发行页应明确写出：

> 除另有标记外，AI Radar 自有数据库内容按 CC BY 4.0 提供。第三方名称、链接、标识、引文和元数据仍受各自权利与许可约束；每条记录的 rights_status、license 和 provenance 字段优先适用。

## 11. 公开数据模型

### 11.1 生产数据与公开数据分离

生产数据可包含：

- 内部审核备注。
- 抓取原文缓存。
- 来源认证与配额信息。
- 私人提交者信息。
- 风险标记和争议材料。
- 未经确认的聚类候选。

这些字段默认不进入公开 API 或数据快照。

### 11.2 Public Alpha 可开放对象

- 公共 Source 的安全字段。
- Event 与其公开来源链接。
- Entity 与双语名称、摘要、别名。
- 有证据的公开 Relation。
- 公开 Ranking Definition 与 Observation。
- 公共 Taxonomy。
- Correction 与 Tombstone。
- Data Release manifest。

### 11.3 每条记录的最小溯源字段

~~~json
{
  "id": "stable-public-id",
  "type": "event",
  "language": "en",
  "source_url": "https://example.org/original",
  "source_name": "Original publisher",
  "first_published_at": "2026-01-01T00:00:00Z",
  "rights_status": "metadata_only",
  "license": null,
  "attribution": "Original publisher",
  "last_verified_at": "2026-01-02T00:00:00Z",
  "data_version": "alpha-2026-01"
}
~~~

示例只定义语义，不锁定最终 API 命名。

## 12. 数据发行流程

### 12.1 流程

1. 冻结发行数据版本。
2. 选择公开对象与字段。
3. 执行记录级 rights filter。
4. 移除个人信息、内部备注、原文缓存与密钥。
5. 转换为稳定公开 schema。
6. 校验外键、语言版本、许可和来源链接。
7. 生成文件、校验和与 manifest。
8. 人工抽检高风险来源。
9. 发布 GitHub Release。
10. 同步飞书或百度网盘镜像。
11. 更新站点与 API 的 data_version。

### 12.2 发布失败条件

出现以下任一情况不得发布：

- 存在 rights_status 为空的记录。
- permission_required、internal_only 或 withdrawn 内容进入发行包。
- 记录缺少来源或许可要求的署名。
- 包含私人邮箱、Token、内部备注或抓取原文缓存。
- manifest 的文件大小、记录数或校验和不一致。
- schema 版本未声明。

## 13. 分发渠道

### 13.1 GitHub Releases

GitHub Releases 是全球用户的规范发行入口，用于：

- 发布版本化数据包。
- 附带 release notes、schema、checksum 和 manifest。
- 保留历史版本。
- 关联代码版本和数据方法版本。

参考：[About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

大型数据文件不进入主 Git 历史，避免仓库膨胀。

### 13.2 中国大陆镜像

飞书或百度网盘作为下载镜像，不作为规范版本真相源。镜像页必须展示：

- 对应 GitHub Release 版本。
- 文件名与大小。
- SHA-256 校验和。
- 发布时间。
- 许可说明。
- 镜像同步状态。

如果镜像与规范 manifest 不一致，应停止展示下载链接。

### 13.3 网站与 API

网站、RSS、公开 API 和数据快照使用同一 data_version 语义，但允许不同更新时间：

- 网站：接近实时。
- API：版本化的当前公共数据。
- RSS：面向订阅的事件输出。
- 数据快照：定期冻结发行。

页面不得把实时生产数据版本误写成已发布快照版本。

## 14. 公开 API 权利边界

Public Alpha API 是版本化、只读、有限速率的公共接口，提供：

- 公共实体与事件。
- 搜索。
- 公开关系。
- 当前方法与公开排名观察。
- 更正、墓碑和数据版本。
- RSS 发现信息。

不提供：

- 抓取原文。
- 受限媒体资源。
- 私人提交信息。
- 内部审核与来源风险字段。
- permission_required 或 internal_only 数据。
- 管理端操作。

每个 API 响应或文档页应给出许可、署名方式、速率限制、禁止滥用和版本策略。

## 15. 更正、撤回与墓碑

### 15.1 不静默删除

已公开的稳定 ID 发生问题时：

- 事实错误：发布 Correction，并修正当前记录。
- 重复记录：标记 merged_into。
- 来源撤回：标记 source_withdrawn 并更新事件置信度。
- 权利下架：移除受保护字段，保留最小 Tombstone。
- 实体删除或转私有：记录状态，不伪装成从未存在。

### 15.2 Tombstone 最小字段

- 原稳定 ID。
- 对象类型。
- 状态。
- 生效时间。
- 可公开的简短原因。
- 替代或合并目标，可为空。
- 更正或下架案例引用。

### 15.3 数据快照传播

新发行版必须包含自上一版本以来的 Corrections 和 Tombstones，使下游用户可以同步删除或更新记录。

## 16. 下架与争议处理

Trust Center 提供中英文联系入口，支持：

- 版权或许可争议。
- 署名错误。
- 隐私与个人信息请求。
- 事实更正。
- 商标或品牌素材问题。
- 安全风险与恶意内容。

处理状态：received、reviewing、actioned、rejected、appealed、closed。

涉及明确高风险材料时可先暂时隐藏公开字段，再完成核验；不得吞掉争议或用通用错误替代审计记录。

## 17. 隐私与安全

Public Alpha 不强制登录，收藏、语言偏好和已读状态默认保存在本地。邮件订阅单独取得明确同意。

开放数据不得包含：

- 订阅邮箱。
- 私人提交者的联系方式。
- IP、设备标识或行为日志。
- API Token、Cookie、内部凭据。
- 未公开的管理备注。
- 从网页意外采集的敏感个人信息。

人物实体只记录与 AI 领域公共活动直接相关、可核验且必要的职业信息。

## 18. 社区贡献边界

贡献分三条通道：

### 18.1 代码贡献

按 Apache-2.0 项目规则提交，贡献者确认有权贡献代码。

### 18.2 原创内容或数据贡献

提交者明确选择允许的许可，并声明拥有相应权利。AI Radar 记录贡献者、许可与版本。

### 18.3 第三方链接提交

提交链接不代表提交者拥有内容权利。系统按来源接入和记录级权利流程处理，只收录允许的元数据、摘要和链接。

三条通道在界面和贡献指南中分开，避免“提交了一个 URL”被误解为“授权全文进入开放数据”。

## 19. Trust Center 公开页面

Public Alpha 上线时至少包含：

- Editorial Policy / 编辑政策。
- Source Policy / 来源政策。
- Translation Policy / 翻译政策。
- Deduplication Policy / 去重政策。
- Ranking Methodology / 排名方法。
- AI-generated Content Policy / AI 内容政策。
- Dataset License / 数据许可。
- Commercial Disclosure / 商业关系披露。
- Corrections / 更正记录。
- Takedown / 下架流程。
- Coverage / 覆盖范围。
- Known Limitations / 已知限制。
- Service and Data Status / 服务与数据状态。

这些页面必须可直接访问，不应藏在注册墙或只存在于仓库文档。

## 20. Public Alpha 验收标准

- 所有公开记录都有 source_url、rights_status 和 last_verified_at。
- 任何开放发行记录都有明确的 export_allowed 结论。
- 代码与数据使用不同许可证，并清楚解释适用边界。
- 新闻不再发布全文、付费内容或原站大段表达。
- GitHub 记录区分公开可见与明确开源许可。
- arXiv 描述性元数据与论文全文许可分开处理。
- AI HOT 未获授权前只作为机制参考和发现线索。
- 生产数据不能未经 rights 和 privacy filter 直接导出。
- GitHub Release 是规范数据版本，飞书或百度网盘是带校验和的镜像。
- 大型数据文件不进入主 Git 历史。
- Corrections 与 Tombstones 随数据版本公开。
- Public API 不暴露原文缓存、个人信息、内部字段和受限内容。
- Trust Center 在中英文页面均可访问。
- 系统可以因权利不清而不开放某条记录，而不是默认为可用。

