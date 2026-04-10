<h1 align="center">
  🐚 Utility Scripts
</h1>

<p align="center"><b>✨ 方便、快捷、标准化的 OpenClash 维护脚本 ✨</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/Shell-Bash-4EAA25?style=flat&logo=gnu-bash&logoColor=white" alt="Bash">
  <img src="https://img.shields.io/badge/System-OpenWrt-0055AA?style=flat&logo=openwrt&logoColor=white" alt="OpenWrt">
  <img src="https://img.shields.io/badge/License-CC_BY--SA_4.0-lightgrey?style=flat&logo=creativecommons&logoColor=white" alt="License">
</p>

---

## 📑 脚本索引

| 脚本名称 | 功能简介 | 适用架构 |
| :--- | :--- | :--- |
| [**check_cpu_version.sh**](#-check_cpu_versionsh) | 🔍 CPU 架构与指令集检测 | `Multi-Arch` |
| [**install_openclash_dev.sh**](#-install_openclash_devsh) | 📦 OpenClash Dev 极速基础安装 | `OpenWrt` |
| [**install_openclash_dev_update.sh**](#-install_openclash_dev_updatesh) | 🚀 全自动化安装/更新/修复 | `OpenWrt` |
| [**apply_adblock_dnsmasq.sh**](#-apply_adblock_dnsmasqsh) | 🧱 拉取并应用 adblock dnsmasq 输出 | `OpenWrt` |
| [**setup_adblock_cron.sh**](#-setup_adblock_cronsh) | ⏰ 安装 adblock 自动更新 cron | `OpenWrt` |

---

## 🔍 **check_cpu_version.sh**

<p>
  <img src="https://img.shields.io/badge/Function-CPU_Detect-blue?style=flat-square" alt="Function: CPU Detect">
  <img src="https://img.shields.io/badge/Arch-Multi--Arch-orange?style=flat-square" alt="Arch: Multi-Arch">
</p>

**功能说明：**  
该脚本通过读取 `/proc/cpuinfo` 和内核信息，解析 CPU Flags、FPU 状态及 ABI 版本，输出标准化的内核版本名称。这有助于 OpenClash 下载正确版本的 Meta 内核。

**核心特性：**

- ✅ **微架构识别 (x86_64)**：识别 `AVX512` (v4)、`AVX2` (v3)、`SSE4.2` (v2) 等指令集。
- ✅ **MIPS 浮点检测**：自动检测硬件 FPU 状态以区分 `hardfloat` / `softfloat`。
- ✅ **LoongArch ABI**：根据内核版本自动判断 `abi1` / `abi2`。
- ✅ **通用映射**：自动处理 `aarch64` → `arm64` 等常见别名映射。

**使用命令：**

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
wget -qO- "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@refs/heads/${RULES_BRANCH}/shell/check_cpu_version.sh" | sh
```

<details>
<summary>📋 点击查看示例输出</summary>

```text
# ARM64 设备
linux-arm64

# x86_64 支持 AVX2 的设备
linux-amd64-v3

# MIPS 硬浮点设备
linux-mips-hardfloat
```

</details>

---

## 📦 **install_openclash_dev.sh**

<p>
  <img src="https://img.shields.io/badge/Function-Install-green?style=flat-square" alt="Function: Install">
  <img src="https://img.shields.io/badge/Edition-Basic-lightgrey?style=flat-square" alt="Edition: Basic">
  <img src="https://img.shields.io/badge/Manager-OPKG%2FAPK-blueviolet?style=flat-square" alt="Manager: OPKG/APK">
</p>

**功能说明：**  
OpenClash Dev 版本安装工具。仅包含**安装插件本体**并**更新 Meta 内核**的功能。适合在网络环境良好且依赖已完备的情况下使用。

**核心特性：**

- ✅ **双包管理器支持**：自动适配 `OPKG` (OpenWrt) 和 `APK` (Snapshot)。
- ✅ **内核自动更新**：安装完成后立即调用内部脚本更新 Meta 内核，无需二次操作。
- ✅ **配置初始化**：自动切换至 Dev 更新分支并配置下载源（如 jsDelivr）。

**使用场景：**

- 仅需安装插件本体和内核，不需要更新 GeoIP 等数据库。
- 修复已损坏的 OpenClash 安装。

**使用命令：**

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
wget -qO- "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@refs/heads/${RULES_BRANCH}/shell/install_openclash_dev.sh" | sh
```

---

## 🚀 **install_openclash_dev_update.sh**

<p>
  <img src="https://img.shields.io/badge/Function-Full_Update-brightgreen?style=flat-square" alt="Function: Full Update">
  <img src="https://img.shields.io/badge/Edition-Ultimate-gold?style=flat-square" alt="Edition: Ultimate">
  <img src="https://img.shields.io/badge/Feature-Smart_Core-ff69b4?style=flat-square" alt="Feature: Smart Core">
</p>

**功能说明：**  
全功能安装脚本。集成了环境诊断、多源下载保障、空间自适应等逻辑。适合首次安装或日常维护。

**核心特性：**

- ✅ **🛡️ 防火墙自适应依赖**：自动识别系统防火墙类型（`nftables` / `iptables`），精准安装所需的特定依赖包（如 `kmod-nft-tproxy` vs `iptables-mod-tproxy`）。
- ✅ **🧠 Smart 内核空间自适应**：在启用 Smart 内核时，自动检测 `/etc/openclash` 剩余空间，自动选择下载 **Large** (30MB+)、**Middle** 或 **Small** 模型，空间极度不足时自动关闭功能，防止爆盘。
- ✅ **🌐 多源下载回退**：针对网络波动与下载失败，提供多种下载源与重试策略，提高成功率。
- ✅ **⚙️ 全资源同步**：一次运行，同步更新 Meta 内核、GeoIP/GeoSite/GeoASN 数据库及相关数据文件。
- ✅ **🧩 个性化扩展**：支持加载 `/etc/config/openclash-set` 用户自定义脚本。

**使用场景：**

- 🆕 **首次安装** (强烈推荐，自动补全依赖)
- 🔄 **Master 转 Dev** 版本
- 🛠️ **固件更新后的重装/恢复**
- 🆙 **日常全量更新**

**使用命令：**

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
wget -qO- "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@refs/heads/${RULES_BRANCH}/shell/install_openclash_dev_update.sh" | sh
```

---

## 🧱 **apply_adblock_dnsmasq.sh**

**功能说明：**
從本倉庫拉取生成好的 `adblock` / `tracking` / `telemetry` / `malware` `dnsmasq` 輸出，部署到 OpenWrt 當前使用中的 `dnsmasq` 規則目錄，並重啟 `dnsmasq` 生效。

預設優先使用 `JSON manifest` 模式，按 `shell/manifests/adblock.json` 決定要下載哪些 `dnsmasq conf` 與 `hosts` 區塊。
如果系統缺少 `jq`，且 `AUTO_INSTALL_DEPS=1`，腳本會嘗試用 `opkg` 自動安裝；如果 manifest 模式失敗，且 `ALLOW_LEGACY_FALLBACK=1`，就會自動回退到舊版 env-driven 行為。

**使用命令：**

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
wget -qO- "https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/${RULES_BRANCH}/shell/apply_adblock_dnsmasq.sh" | sh
```

如需同時把生成的 `dns/*.hosts.txt` 合併進 `/etc/hosts`：

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
ENABLE_HOSTS_MERGE=1 wget -qO- "https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/${RULES_BRANCH}/shell/apply_adblock_dnsmasq.sh" | sh
```

如需把生成的 `dns/*.hosts.txt` 合併進自定義 hosts 檔案，例如你目前 OpenWrt 使用的 `/etc/dnsmasq.custom-blocks.hosts`：

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
ENABLE_HOSTS_MERGE=1 HOSTS_TARGET_FILE=/etc/dnsmasq.custom-blocks.hosts wget -qO- "https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/${RULES_BRANCH}/shell/apply_adblock_dnsmasq.sh" | sh
```

如需把遠端 Adobe hosts 清單當作資料源，合併進本地 hosts 檔案的獨立標記區塊：

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
ENABLE_ADOBE_REMOTE=1 HOSTS_TARGET_FILE=/etc/dnsmasq.custom-blocks.hosts wget -qO- "https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/${RULES_BRANCH}/shell/apply_adblock_dnsmasq.sh" | sh
```

預設 Adobe 遠端來源：

```bash
ADOBE_REMOTE_URL="https://raw.githubusercontent.com/ethanaicode/Adobe-Block-Hosts-List/refs/heads/main/hosts"
```

可選分類開關：

```bash
ENABLE_ADBLOCK=1
ENABLE_TRACKING_BLOCK=0
ENABLE_TELEMETRY_BLOCK=0
ENABLE_MALWARE_BLOCK=0
ENABLE_HOSTS_MERGE=0
ENABLE_ADOBE_REMOTE=0
HOSTS_TARGET_FILE=/etc/hosts
AUTO_INSTALL_DEPS=1
ALLOW_LEGACY_FALLBACK=1
MANIFEST_URL=https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/main/shell/manifests/adblock.json
```

建議把大型 `hosts` 類資料合併到 dnsmasq 額外 hosts 檔，例如 `/etc/dnsmasq.custom-blocks.hosts`，而不是直接寫進 `/etc/hosts`。
Adobe 遠端來源會以獨立標記區塊寫入，不會覆蓋同一檔案內其他非標記內容。

---

## ⏰ **setup_adblock_cron.sh**

**功能說明：**
安裝 `cron` 定時任務，定期拉取並應用本倉庫生成的 adblock 輸出。腳本會先立即執行一次，再寫入計劃任務。

**使用命令：**

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
wget -qO- "https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/${RULES_BRANCH}/shell/setup_adblock_cron.sh" | sh
```

**可選環境變量：**

```bash
CRON_SCHEDULE="17 */12 * * *"
AUTO_INSTALL_DEPS=1
ALLOW_LEGACY_FALLBACK=1
MANIFEST_URL=https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/main/shell/manifests/adblock.json
ENABLE_ADBLOCK=1
ENABLE_TRACKING_BLOCK=0
ENABLE_TELEMETRY_BLOCK=0
ENABLE_MALWARE_BLOCK=0
ENABLE_HOSTS_MERGE=1
ENABLE_ADOBE_REMOTE=0
HOSTS_TARGET_FILE=/etc/dnsmasq.custom-blocks.hosts
ADOBE_REMOTE_URL=https://raw.githubusercontent.com/ethanaicode/Adobe-Block-Hosts-List/refs/heads/main/hosts
RULES_REPO="mythic3011/rules"
RULES_BRANCH="main"
```

建議做法：

- 大型 DNS blocklist 盡量交由 `dnsmasq` / `HTTPS DNS Proxy` 處理。
- Clash 只保留 `rule/Ads_Lite_Domain.yaml`、`rule/Tracking_Lite_Domain.yaml`、`rule/Malware_Lite_Domain.yaml` 這類極小型補充規則，避免 profile 過大、解析過慢。
- 如需自定 GitHub blocklist，直接編輯 `data/custom_*_sources.yaml`，然後等 GitHub Action 自動生成輸出。

---

## 📂 归档文件

> [!NOTE]
> `archived/` 文件夹包含已弃用的旧版脚本，仅供考古。
> 详情请查阅 [📜 Archived README](archived/README.md)
