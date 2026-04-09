# 🐍 Python Scripts

## 🛠️ 项目辅助与维护脚本 🛠️

這裡存放項目使用的 Python 維護腳本（如規則生成、檔案合併等）。

> [!CAUTION]
> **非開發人員請勿隨意運行此目錄下的腳本，可能會導致規則文件損壞。**

---

## 📂 目錄結構

- **[generate_adblock_outputs.py](generate_adblock_outputs.py)**: 從多個 GitHub / 上游 blocklist 自動生成 `dnsmasq`、`hosts` 與極小型 Clash 補充規則，支援 `adblock` / `tracking` / `malware` 分類、custom source 擴展及 policy-based include/exclude。
- **[generate_ai_profiles.py](generate_ai_profiles.py)**: 自動生成 AI profiles 的 YAML / INI 模板與對應 rule provider。
- **[generate_game_cdn.py](generate_game_cdn.py)**: 自動從 v2fly/domain-list-community 上游下載並生成 `Game_Download_CDN.list` 規則文件。
- **`archived/`**: 存放已廢棄或不再使用的歷史腳本。[查看詳情](archived/README.md)
