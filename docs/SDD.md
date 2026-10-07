# ContextVocab SDD（Software Design Document）

## 1. 文档目的
- 描述 ContextVocab 当前系统设计，确保产品、研发、测试在同一技术语义下协作
- 支持后续功能迭代、质量治理、面试项目讲解

## 2. 系统范围
- 在范围内：
- 首页选题（含上传 PDF 自动导入）
- 阅读点词与 AI 记忆卡
- 发音（Web Speech）
- 练习与结果写入
- 复习调度（localStorage）
- 词库管理与导出（CSV/Markdown）

- 不在范围内：
- 登录/账号体系
- 云端数据库
- 支付/社区/推荐流

## 3. 总体架构
- 前端：React + Vite + TypeScript + Tailwind
- 本地存储：localStorage（学习状态、词库、缓存、复习）
- 后端：Node（`server/index.mjs`）
- 外部能力：
- OpenRouter（AI 解释生成）
- Free Dictionary API（词典释义）
- MyMemory（英文到中文翻译）
- Python 脚本（PDF 文本抽取与切段）

## 4. 关键模块设计
## 4.1 阅读学习模块
- 输入：文章内容（可来自内置 mock 或上传导入）
- 行为：点击任意单词 -> 提取句子 -> 生成/读取记忆卡
- 输出：卡片展示、可手动加入词库

## 4.2 记忆卡生成模块（多层路由）
- 路由顺序（当前设计）：
- 本地缓存
- 免费词典
- 本地词库
- AI 生成
- fallback

- 质量控制：
- 卡片质量评分
- 低质量拦截
- 自动后台重试恢复

## 4.3 复习模块
- 数据结构：`ReviewItem { word, sentence, strength, nextReviewAt, lastReviewedAt }`
- 调度规则：
- `nextReviewAt <= now` 才进入今日复习
- `strength` 低优先、时间早优先

- 间隔规则：
- 我会：strength +1（上限 2），下次 +1天/+3天
- 我不会：strength=0，下次 +10分钟

## 4.4 词库模块
- 加词策略：手动点击“加入词库”
- 展示能力：词、语境句、词典标准释义（中文优先）
- 导出能力：CSV/Markdown

## 4.5 真题导入模块
- 流程：PDF 上传 -> 后端解析 -> Section B/C 切段 -> 标准 JSON -> 自动入库
- 兜底：人工校对后覆盖保存
- 质量输出：段落完整率、异常率、警告项

## 5. 数据存储设计（localStorage）
- `contextvocab_user_words`：用户词库
- `contextvocab_review_items`：复习调度队列
- `contextvocab_card_cache`：记忆卡缓存
- `contextvocab_dictionary_cache`：词典释义缓存（中文优先）
- `contextvocab_uploaded_papers_v1`：用户上传套题

## 6. 核心时序（关键链路）
## 6.1 点词到出卡
- 用户点击词
- 前端提取句子并打点
- 调用 `generateCard`
- 按路由返回卡片
- 渲染卡片并记录来源/时延

## 6.2 手动加入词库
- 点击“加入词库”
- 写入 `contextvocab_user_words`
- UI 状态切换为“已加入词库”
- 词库页实时可见

## 6.3 上传 PDF 导入
- 前端上传 base64
- 后端写临时文件
- 调 Python 脚本切段
- 返回 paper/passages + quality
- 前端自动入库；必要时进入人工校对

## 7. 非功能需求
- 性能：
- 点词出卡 P95 < 3s（缓存/词典命中）
- 导入单文件超时控制（前端 120s）

- 可用性：
- 任一外部服务失败时系统仍可返回可读卡片
- 主流程不因单点失败中断

- 可维护性：
- 数据结构清晰，可替换后端 API
- 关键流程有埋点可观测

## 8. 错误处理策略
- 前端：
- 请求超时中断
- 降级提示文案
- loading/disabled 防误操作

- 后端：
- API 错误码标准化返回
- 解析失败输出 detail
- 解析进程超时强杀

## 9. 安全与隐私
- 当前版本仅本地存储，不上传用户身份数据
- 上传 PDF 为临时文件处理，解析后删除
- 生产化建议：增加上传大小限制与文件类型校验

## 10. 版本与发布建议
- 采用 `dev` / `release` 分支
- 每次发布前执行：
- `npm run build`
- 主流程手工回归
- 指标快照归档

## 11. 已知技术债
- 部分中文文案存在历史编码污染，需统一 UTF-8 清洗
- 词典翻译质量受第三方接口波动影响
- 埋点仍为本地态，缺少远端 BI 管道
