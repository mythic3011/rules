# 🤖 GitHub Workflows

這裡存放了項目的自動化工作流配置。

## ⚙️ 分支说明

- 可选仓库变量：`WORK_BRANCH`
- 用途：当默认分支被切换为占位空分支（如 `rm`）时，工作流会优先在 `WORK_BRANCH` 指定的真实工作分支上执行。
- 默认行为：若未设置 `WORK_BRANCH`，多数流程回退到 `main`。

## 📂 工作流列表

| 文件名 | 描述 | 触发条件 |
| :--- | :--- | :--- |
| **[auto-generate-adblock.yml](auto-generate-adblock.yml)** | 自動拉取 adblock / tracking / telemetry / malware 上游清單，生成 `dnsmasq`、`hosts` 及極小型 Clash 補充規則 | 對應 `data/`、`dns/local_*`、`py/generate_adblock_outputs.py` 變更 / 每日定時 / 手動觸發 |
| **[deploy-reports-site.yml](deploy-reports-site.yml)** | 將獨立的報表站點部署到 GitHub Pages，展示生成後的分類統計、來源數量與輸出連結 | `site/`、`reports/` 變更 / 手動觸發 |
| **[auto-generate-ai-profiles.yml](auto-generate-ai-profiles.yml)** | 自動生成 AI profiles、模板 YAML / INI 與 AI rule provider 輸出 | AI profile generator / template 變更 / 手動觸發 |
| **[auto-generate-rules.yml](auto-generate-rules.yml)** | 从 `.list` 规则文件自动生成 `.yaml` 和 `.mrs` 格式的规则集 | `rule/*.list` 变更 / 手动触发 |
| **[auto-update-game-cdn.yml](auto-update-game-cdn.yml)** | 从 v2fly 上游自动更新 `Game_Download_CDN.list` 规则文件 | 每 8 小时 / 手动触发 |
| **[auto-update-mainland.yml](auto-update-mainland.yml)** | 根据 `Custom_Clash.ini` 自动生成 `Custom_Clash_Mainland.ini` | `cfg/Custom_Clash.ini` 变更 / 手动触发 |
| **[codeql.yml](codeql.yml)** | CodeQL 代码安全性分析（分析 Actions 和 Python） | Push / Pull Request / 每日定时 / 手动触发 |
| **[dependabot-auto-merge.yml](dependabot-auto-merge.yml)** | 自动合并带有 `automerge` 标签的 Dependabot PR | Dependabot PR 打开/更新 |
| **[purge-jsdelivr.yml](purge-jsdelivr.yml)** | 自动刷新 jsDelivr CDN 缓存，并实现防抖（60 秒等待批量合并提交） | `cfg/`, `rule/`, `game_rule/`, `shell/`, `overwrite/` 变更 / 手动触发 |

## 📂 子目录

- **[archived](archived/README.md)**: 存放已废弃或不再使用的工作流。
