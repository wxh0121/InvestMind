# InvestMind

个人投资记账与持仓分析 PWA，用于本地记录资产持仓、查看资产分布、刷新支持的数据源价格，并通过规则引擎生成加仓观察建议。

> 本工具仅用于个人资产记录与规则化分析，不构成任何投资建议。投资有风险，决策需谨慎。

## 功能说明

- Dashboard：总资产、今日盈亏、总浮动盈亏、市场占比、资产类型占比、盈亏柱状图、加仓建议摘要。
- 持仓管理：新增、编辑、删除、搜索、按市场和资产类型筛选。
- 定投计划：通过 Vercel Cron 在交易日 00:00 自动执行加仓，支持按金额或数量定投，并按资产计价货币扣除对应现金。
- 一键刷新：前端调用 `/api/refresh-prices`，后端统一请求 OKX / Yahoo Finance / 天天基金适配层并返回标准化数据。
- 加仓分析：基于目标配置、单资产上限、价格相对成本偏离、今日涨跌幅、资产风险等级、技术指标与 GLM 摘要输出观察建议。
- 本地存储：IndexedDB 保存 holdings、snapshots、settings、transactions、dcaPlans，作为离线缓存。
- 账号与云端备份：登录后使用 Vercel Postgres / Neon 保存持仓备份，避免浏览器清理数据后丢失。
- 数据备份：支持导出 JSON、导入 JSON、导出 CSV。
- PWA：支持安装到手机主屏幕，内置 manifest 与 service worker。

## 技术栈

- React + TypeScript + Vite
- Tailwind CSS
- React Router
- Dexie.js / IndexedDB
- Recharts
- Vercel Serverless Functions

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`。

如果需要在本地调试 Vercel API：

```bash
npm i -g vercel
vercel dev
```

## Vercel 部署

1. 将项目推送到 GitHub。
2. 在 Vercel 新建项目并导入仓库。
3. Framework Preset 选择 Vite。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. 在 Project Settings 中配置环境变量。
7. 在 Vercel Storage 中创建 Postgres / Neon 数据库，并把连接串绑定到项目环境变量。

## 环境变量

复制 `.env.example` 并在 Vercel 中配置：

```bash
OKX_API_KEY=
OKX_API_SECRET=
OKX_API_PASSPHRASE=
OKX_BASE_URL=https://www.okx.com

YAHOO_BASE_URL=https://query1.finance.yahoo.com
FUND_BASE_URL=https://fundgz.1234567.com.cn
FUND_DETAIL_BASE_URL=https://fund.eastmoney.com
FX_BASE_URL=https://open.er-api.com

GLM_API_KEY=
GLM_BASE_URL=https://api.z.ai/api/paas/v4
GLM_MODEL=glm-4.5-air

POSTGRES_URL=
DATABASE_URL=
CRON_SECRET=

APP_BASE_CURRENCY=CNY
```

API Key 只在 `api/` 目录下的 Vercel Functions 中读取，不会进入前端 bundle。

## 账号与云端备份

- `POSTGRES_URL` 或 `DATABASE_URL` 用于账号、登录会话和云端持仓备份。
- 首次注册/登录后，系统会把当前浏览器里的本地持仓上传为云端备份。
- 之后新增持仓、加仓、减仓、定投计划、删除、刷新价格、导入备份、修改设置都会自动同步云端。
- 未登录时仍可继续使用，本地数据保存在浏览器 IndexedDB 中。

## Vercel Cron 定投

- `vercel.json` 已配置 `GET /api/cron/dca`，Cron 表达式为 `0 16 * * *`。
- Vercel Cron 使用 UTC 时区，`16:00 UTC` 对应北京时间每天 `00:00`。
- Cron 会读取云端备份里的定投计划，刷新对应资产价格，按资产币种扣除现金；现金不足会写入定投失败状态。
- Vercel Hobby 计划每天只能触发一次 Cron，所以交易日定投固定为北京时间 `00:00`，不再由前端每分钟轮询；周六、周日会自动跳过并顺延到下一个交易日。
- 可选配置 `CRON_SECRET`；配置后 Cron 入口会校验 `Authorization: Bearer <CRON_SECRET>`。

## OKX API 配置

- `GET /api/okx/balances` 使用 OKX 私有接口，需要配置 `OKX_API_KEY`、`OKX_API_SECRET`、`OKX_API_PASSPHRASE`。
- `GET /api/okx/prices?symbols=BTC,ETH` 使用 OKX 公共 ticker 接口。
- 加密资产价格默认映射为 `SYMBOL-USDT`，例如 `BTC-USDT`。
- 加密资产 24 小时连续交易，当前版本用 `open24h` 作为昨日价格近似值，后续可替换为更严格的 K 线收盘价逻辑。

## Yahoo Finance 行情配置

- `GET /api/yahoo/prices?symbols=TSLA,600519.SS,0700.HK,%5EGSPC` 使用 Yahoo Finance chart 接口获取证券与指数报价。
- 美股可直接使用 `TSLA`；港股可使用 `0700.HK` 或在港股市场下输入 `700`；A 股可使用 `600519.SS`、`000001.SZ`，也支持 `SH600519`、`SZ000001`。
- 主要指数可直接使用 Yahoo 符号，例如 `%5EGSPC`、`%5EIXIC`、`%5EHSI`，或常用简写 `GSPC`、`IXIC`、`HSI`。
- 如需替换为自有行情服务，可设置 `YAHOO_BASE_URL` 并在 `api/_lib/yahoo.ts` 中保持相同字段映射。

## 国内基金净值配置

- `GET /api/funds/prices?symbols=020973` 优先使用天天基金估算净值接口；当 QDII 等基金没有估算净值时，会自动兜底到东财基金详情净值走势。
- 新增国内基金时，资产代码填写基金代码，例如 `020973`；资产类型选择基金类后，数据来源会默认切换为「天天基金」。
- 当前价格优先使用估算净值 `gsz`，昨日价格使用上一确认单位净值 `dwjz`。
- 对类似 `019641` 这类 QDII 基金，当前价格使用最新确认单位净值，昨日价格使用前一条确认单位净值。
- 如需替换为自有基金净值服务，可设置 `FUND_BASE_URL` / `FUND_DETAIL_BASE_URL` 并在 `lib/server/funds.ts` 中保持相同字段映射。

## 汇率配置

- `GET /api/fx/rates?base=CNY&symbols=USD,HKD,EUR,JPY,SGD` 使用 ExchangeRate-API 免费接口获取实时汇率。
- 首页总资产、总成本、今日盈亏、总浮动盈亏、市场占比、资产类型占比会先转换到设置里的基础货币后再汇总。
- 汇率表中 `rates.USD` 表示 `1 USD` 可兑换多少基础货币。默认基础货币为 `CNY`。

## GLM 摘要配置

- `POST /api/analysis/ai-summary` 使用 Z.AI 兼容 OpenAI 的 Chat Completions 接口生成持仓摘要。
- `GLM_API_KEY` 必须只放在 `.env.local` 或 Vercel 环境变量中，不要写入前端代码。
- `GLM_MODEL` 默认 `glm-4.5-air`；如果平台模型名有调整，只需要改环境变量。
- 技术指标由本地服务先计算；GLM 可选择大盘分析或单个技术指标资产分析，避免一次发送过多持仓。

## 数据备份

未登录时，所有个人数据默认保存在浏览器 IndexedDB 中；登录后会额外同步到云端数据库。建议定期到「设置」页：

- 导出 JSON：完整备份 holdings、snapshots、settings、dcaPlans。
- 导入 JSON：恢复备份。
- 导出 CSV：导出当前持仓明细，便于表格查看。

更换浏览器、清理站点数据、无痕模式或系统清理工具可能删除本地数据；登录账号后可从云端恢复，离线 JSON 备份仍建议保留。

## 注意事项

- 账号系统依赖 Vercel Postgres / Neon 环境变量；未配置数据库时，登录注册会被拒绝，但本地记录仍可使用。
- 定投依赖云端数据库和 Vercel Cron；未登录或未同步到云端的本地计划不会在浏览器关闭时后台执行。
- 多币种会按设置里的基础货币进行汇率折算；汇率服务失败时可能沿用已有汇率或默认值。
- 所有分析建议均来自本地规则引擎、技术指标和模型摘要，不代表任何投资建议。
- 手动数据源资产不会被一键刷新覆盖。
