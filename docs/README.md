# AI Radar 设计文档

> 状态：Design Baseline v0.1  
> 日期：2026-08-30  
> 产品阶段：Public Alpha 设计  
> 工作名：AI Radar

AI Radar 是面向全球 AI 深度用户的中英双语信息雷达。它把实时资讯、长期资料库、知识图谱、搜索与有来源的研究 Agent 组合为一个开放产品。

英文定位：

> The open, bilingual map of global AI.

中文定位：

> 开放、双语、全景的全球 AI 信息雷达。

短句：

> All of AI, mapped.  
> 全球 AI，一站看懂。

## 文档用途

这一组文档记录已经确认的产品共识，并作为公开 Alpha 的范围基线。它需要同时服务：

- 产品决策：为什么做、为谁做、首版做到哪里。
- 设计与开发：页面、数据、关系、接口和流程必须满足什么结果。
- 编辑与运营：内容如何进入、审核、翻译、聚类、更正和发布。
- 开源协作：代码、开放数据和第三方内容分别受什么规则约束。
- 验收：如何证明 Alpha 已经真实可用，而不是只有页面空壳。

本文档不在未经单独研究的情况下锁定具体 Web 框架、云厂商、图数据库、向量数据库、邮件供应商、对象存储或模型供应商。此类选择应通过 Architecture Decision Record（ADR）完成。

## 阅读顺序

1. [产品策略](./01-product-strategy.md)
2. [信息架构](./02-information-architecture.md)
3. [内容模型与知识图谱](./03-content-and-knowledge-graph.md)
4. [排行榜与推荐方法](./04-ranking-and-recommendation-methodology.md)
5. [来源、权利与开放数据](./05-sources-rights-and-open-data.md)
6. [公开 Alpha PRD](./06-public-alpha-prd.md)
7. [系统架构](./07-system-architecture.md)
8. [编辑运营](./08-editorial-operations.md)
9. [六周路线图](./09-six-week-roadmap.md)
10. [验收清单](./10-acceptance-checklist.md)
11. [Public Alpha 发布决策](./14-public-alpha-release-decision.md)

## 已确认的核心决策

| 主题 | 决策 |
|---|---|
| 用户 | 全球 AI 深度用户：开发者、研究者、产品经理、创作者和创业者 |
| 语言 | 完整中英文体验，主要采集英文和中文来源，覆盖全球事件 |
| 产品结构 | Radar 实时层 + Library 长期资料层 + Search/Ask |
| 内容域 | Radar、Models、Papers、Products、GitHub、Prompts、Skills、Guides |
| 导航 | 八个内容域直接作为桌面一级导航 |
| 新闻模型 | 事件优先，多来源作为事件证据 |
| 知识图谱 | 有类型、有方向、有来源、有时间的关系；支持正向链接、反向链接和局部图 |
| 历史起点 | 2022-11-30 ChatGPT research preview；另设精简前史专题 |
| Alpha | 一人加 AI，4–6 周公开 Alpha；所有内容域有真实体验，但自动化深度分级 |
| 搜索 Agent | 只基于本站公开数据回答，必须给出来源与数据时间 |
| 排序 | Latest、Trending、Featured 分开；不同对象使用不同榜单口径 |
| 账户 | Alpha 不强制登录；收藏和偏好保存在浏览器本地 |
| 订阅 | 中英文 RSS 与中英文邮件日报 |
| 开源代码 | Apache-2.0 |
| 本站开放数据 | 在本站有权许可的范围内采用 CC BY 4.0 |
| 数据发布 | GitHub Releases 为全球快照，飞书和百度网盘为国内镜像 |
| 成功指标 | Monthly Qualified Page Views + 7-Day Returning Reader Rate |
| 商业模式 | 开放基础设施 + 官方托管增值服务 |

## 术语基线

| 英文 | 中文 | 定义 |
|---|---|---|
| Event | 事件 | 现实中发生的一件事，可由多个来源报道 |
| Source Item | 来源条目 | 从单个来源采集的一条记录 |
| Entity | 实体 | 模型、论文、产品、仓库、Prompt、Skill、Guide、组织或人物 |
| Relation | 关系 | 两个实体或事件之间有类型、有证据的连接 |
| Radar | 动态层 | 强调时效的新闻、发布、趋势与简报 |
| Library | 资料层 | 强调长期复用的实体档案、关系与历史 |
| Latest | 最新 | 按明确时间字段倒序 |
| Trending | 热门 | 在明确窗口内按标准化增长与关注度排序 |
| Featured | 精选 | 明确标记的编辑选择 |
| Original | 原文 | 第三方原始来源内容 |
| Localized Content | 本地化内容 | 基于同一事实记录生成的中文或英文呈现 |
| Open Dataset Release | 开放数据发行版 | 经权利、隐私与 Schema 过滤后的公开快照 |
| Tombstone | 撤回标记 | 告知下游某记录已失效或不可继续使用的机器记录 |

## 范围纪律

任何功能进入 Public Alpha，必须同时满足：

1. 在 [公开 Alpha PRD](./06-public-alpha-prd.md) 中有明确结果。
2. 在 [系统架构](./07-system-architecture.md) 中有数据或组件边界。
3. 在 [六周路线图](./09-six-week-roadmap.md) 中有交付位置。
4. 在 [验收清单](./10-acceptance-checklist.md) 中可以被证明。

如果一项能力只出现在愿景中、尚未进入 Alpha，则必须明确标记为后续阶段，不得在对外材料中写成已交付。

## 明确不属于 Alpha 的内容

- 覆盖全球所有语言的信息源。
- 回填 2022-11-30 以来每一篇 AI 文章。
- 全局力导向知识图谱和图谱编辑器。
- Obsidian 导出、导入或双向同步。
- 任意全网实时搜索 Agent。
- PWA Push、浏览器实时通知和原生 App。
- 评论、私信、用户主页和完整社区。
- 跨设备账户与团队空间。
- 复杂多人 CMS 权限矩阵。
- Prompt、Skill、论文和产品的虚假权威总榜。
- 完整生产数据库公开镜像。

## 变更规则

- 改变定位、用户、八个内容域、许可证、历史起点或 Alpha 边界，属于产品基线变更，必须同步更新全部受影响文档。
- 选择技术供应商或具体框架，使用 ADR，不直接改写产品目标。
- 新增内容字段时，先更新内容模型，再更新 API、开放数据和验收。
- 修改排行榜时，必须同步更新方法说明和面向用户的解释。
- 更改权利策略时，必须同步检查已有开放数据快照。
