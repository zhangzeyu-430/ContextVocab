# ContextVocab

基于“阅读语境背单词”的 Web 学习应用（React + Vite + TypeScript + Tailwind）。

当前版本已经形成闭环：
**首页选题 -> 阅读点词 -> 记忆卡 -> 发音 -> 练习 -> 复习**。

---

## 1. 当前项目状态（真实实现）

### 1.1 页面与路由

- `/` 首页：按考试类型与套题进入学习
- `/reading/:id` 阅读学习页：点击任意单词触发记忆卡
- `/review` 复习页：单题模式 + 间隔复习

### 1.2 核心能力

- 任意单词可点击（非固定高亮）
- 自动定位单词所在句子作为语境来源
- 记忆卡展示：语境义、用词理由、词义对比、类比、同义词、易错点、记忆钩子
- 发音：浏览器 SpeechSynthesis
- 练习：阅读完成后触发练习，支持判题反馈
- 复习：localStorage 调度（按强度与下次复习时间）

### 1.3 当前卡片生成链路（已落地）

点击单词后按优先级走：

1. 本地缓存 `contextvocab_card_cache`
2. 免费词典 API（dictionaryapi + 翻译）
3. 本地词库 `src/data/localLexicon.ts`
4. AI 后端 `/api/card`（OpenRouter）
5. 离线 fallback

并且：

- 低质量结果不缓存
- 低质量旧缓存会自动跳过并重拉
- fallback 后有后台自动恢复（auto recover）

---

## 2. 技术栈

- React 18
- Vite 5
- TypeScript
- Tailwind CSS
- React Router DOM
- Node（本地后端代理 + 缓存）

---

## 3. 项目结构（核心）

```text
.
├─ server/
│  └─ index.mjs                    # /api/card, /api/health
├─ src/
│  ├─ components/                  # Header / ReadingArticle / MemoryCard / PracticeModal / DevDebugPanel
│  ├─ data/
│  │  ├─ article.ts                # 文章数据总入口
│  │  ├─ papers.imported.ts        # 导入后自动生成
│  │  └─ localLexicon.ts           # 本地词库兜底
│  ├─ pages/
│  │  ├─ HomePage.tsx
│  │  ├─ ReadingPage.tsx
│  │  └─ ReviewPage.tsx
│  ├─ store/
│  │  ├─ useLearningProgress.ts
│  │  ├─ useReviewSystem.ts
│  │  └─ useUserWords.ts
│  ├─ types/index.ts
│  └─ utils/
│     ├─ generateCard.ts           # 卡片生成主链路
│     ├─ cardCache.ts
│     ├─ analytics.ts
│     └─ textParsing.ts
├─ scripts/
│  ├─ import-papers.mjs
│  ├─ pdf_to_paper.py
│  ├─ analytics-report.mjs
│  └─ paper-quality-report.mjs
├─ data/papers/
├─ .env.example
└─ README.md
```

---

## 4. 环境变量与优先级（非常重要）

建议只保留后端变量，避免混用：

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxx
OPENROUTER_MODEL=openrouter/auto
OPENROUTER_FALLBACK_MODEL=openrouter/auto
OPENROUTER_TOTAL_TIMEOUT_MS=9500
PORT=8787
# 仅前端需要（生产环境建议填写后端公网地址）
# VITE_API_BASE_URL=https://your-backend.up.railway.app
```

后端 key 读取优先级：

1. `OPENROUTER_API_KEY`
2. `VITE_OPENROUTER_API_KEY`
3. `VITE_GEMINI_API_KEY`（且需 `sk-or-v1`）

改 `.env` 后**必须重启**前后端。

---

## 5.1 部署给他人访问（推荐：Vercel + Railway）

### A. 部署后端（Railway）

1. 将仓库连接到 Railway，新建服务并选择本项目。
2. Start Command 填：`npm run dev:server`（或 `node server/index.mjs`）。
3. 在 Railway 配置环境变量：
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_FALLBACK_MODEL`
- `OPENROUTER_TOTAL_TIMEOUT_MS`
- `PORT`（可不填，平台通常会注入）
4. 获取后端公网 URL（例如 `https://xxx.up.railway.app`）。
5. 访问 `https://xxx.up.railway.app/api/health` 确认返回 `ok: true`。

### B. 部署前端（Vercel）

1. 将同一仓库导入 Vercel。
2. Build Command：`npm run build`，Output Directory：`dist`。
3. 在 Vercel 环境变量里添加：
- `VITE_API_BASE_URL=https://xxx.up.railway.app`
4. 重新部署，打开 Vercel 提供的域名即可分享给他人。

### C. 关于 PDF 解析接口

- `/api/parse-pdf` 依赖 Python 脚本 `scripts/pdf_to_paper.py`。
- 如果你的后端平台未安装 Python 依赖（如 `pypdf`），该接口可能不可用。
- 不影响阅读点词、记忆卡、复习等核心功能。

---

## 6. 启动方式

```bash
npm install
npm run dev:full
```

或分开启动：

```bash
npm run dev:server
npm run dev
```

地址：

- 前端：`http://localhost:5173`
- 健康检查：`http://localhost:8787/api/health`

---

## 6. 本地存储键

- `contextvocab_card_cache`：卡片缓存
- `contextvocab_user_words`：用户点过词
- `contextvocab_review_items`：复习队列（间隔记忆）
- `context_vocab_learning_progress_v1`：学习统计
- `contextvocab_analytics_events_v1`：埋点事件

---

## 7. 埋点与 Dev Panel 指标说明

### 7.1 事件

- `word_click`
- `card_response`
- `card_error`
- `card_auto_recover`
- `review_show_answer`
- `review_submit`

### 7.2 面板指标（开发环境）

- `3s Rate`：3 秒内返回率
- `Fallback`：兜底比例
- `Success`：首响应技术成功率（非 fallback）
- `Final Success`：含 auto recover 的技术成功率
- `CN Coverage`：返回卡片中含中文比例
- `Learning Success`：可学习成功率（含中文 + 成功）
- `Dictionary Hit`：词典命中率
- `Source Breakdown`：各来源占比
- `Error Breakdown`：错误码分布

---

## 8. 真题导入

### 8.1 手工导入（推荐）

1. 在 `data/papers/` 新建 `xxx.json`
2. 参照 `data/papers/_template.paper.json` 填写
3. 执行：

```bash
npm run import:papers
```

生成 `src/data/papers.imported.ts`。

### 8.2 PDF 半自动导入

```bash
pip install pypdf cryptography
python scripts/pdf_to_paper.py --pdf "你的PDF路径" --paper-id "cet6-2025-06-set3" --exam "六级" --year 2025 --month 6 --set 3
npm run import:papers
```

---

## 9. 当前仍可能出现的问题（你测试时重点关注）

1. **语义错判**（最关键）
- 表现：中文有了，但语义偏离句子真实意思
- 典型：`conditions` 被误判为“条件语句/逻辑”

2. **词义对比泛化**
- 表现：对比块看起来完整，但内容抽象、缺少句内差异

3. **功能词污染**
- 表现：`who/the/of` 也生成卡片，学习价值低

4. **上游抖动**
- 表现：`openrouter_500_network_error`，然后 fallback

5. **低质量缓存遗留**
- 表现：Source=Local Cache 但内容仍旧模板化

---

## 10. 建议的完整测试流程（功能 + 性能 + 内容质量）

### 10.1 功能回归（每次改动都跑）

1. 首页进入任意文章
2. 点击 8~12 个词，确认卡片可开可切
3. 发音可用
4. 阅读完成后练习可判题
5. 错词能进入复习
6. 复习页可出题、可更新“我会/我不会”

### 10.2 内容质量测试（本项目当前最重要）

准备一组词：

- 语义明确词：`productive`, `sustain`, `preserve`
- 容易歧义词：`conditions`, `claim`, `interpret`
- 功能词：`who`, `the`, `of`

检查项：

- `meaning` 是否贴合当前句子
- `contrast` 是否是“词典义 vs 本句义”而非模板
- `oneLiner` 是否可记忆（不是空话）
- 是否出现编程错义（true/false/条件语句）

### 10.3 性能测试

每次清空埋点后点击 20 个词，观察：

- `3s Rate`
- `Fallback`
- `Final Success`
- `CN Coverage`
- `Learning Success`
- `Source Breakdown`

建议阶段目标：

- `3s Rate >= 70%`
- `Fallback <= 25%`
- `Final Success >= 90%`
- `Learning Success >= 75%`

---

## 11. 问题定位流程（你现在最实用）

1. 看卡片 `Source`
- `Local Cache`：先怀疑历史低质量缓存
- `Free Dictionary`：重点看是否语境偏差
- `OpenRouter`：看后端日志是否抖动

2. 看 Dev Panel
- `Success` 高但 `Learning Success` 低：说明“技术通，内容不准”

3. 看后端健康与日志
- `/api/health`
- server 控制台是否频繁 500/network_error

4. 必要时清理缓存重测

```js
localStorage.removeItem("contextvocab_card_cache")
```

---

## 12. 作为 AI 产品经理，后续演进建议

### 12.1 功能侧（MVP -> v1）

1. 语义质量路由
- 词典结果先打分，不达标自动升级 AI 精修

2. 短语优先
- 从“单词解释”升级为“词组/搭配解释”优先

3. 功能词过滤
- 低学习价值词不生成完整卡，改为轻提示

4. 复习闭环质量
- 错词自动回流 + 次日追踪复习完成率

### 12.2 性能侧

1. 双层缓存命中率提升（本地 + 服务端）
2. 降低词典请求串行耗时（并行化可控）
3. 高并发下同词请求去重（已做，可继续优化 TTL）

### 12.3 数据与评估侧

1. 建立内容质量标注集（50~100 词）
2. 每周跑离线评估：语境贴合、可记忆性、错误率
3. 面板中加入“错义率”与“人工抽检通过率”

### 12.4 简历表达建议（AI PM 视角）

可描述为：

- 你主导了一个“语境词汇学习”产品闭环，从阅读-练习-复习打通核心路径
- 设计并落地了多层生成架构（缓存/词典/词库/AI）与降级策略
- 引入了可观测指标体系（技术成功与学习成功分离）推动质量迭代
- 将“能返回”升级为“可学习”的质量标准

---

## 13. 常见命令

```bash
npm run dev:full
npm run build
npm run import:papers
npm run report:analytics
npm run report:paper-quality
```
