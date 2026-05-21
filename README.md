<div align="center">

> 🇭🇰 **A maintained fork optimized for Hong Kong users & AI services**
>
> 📌 Based on: [Aethersailor/Custom_OpenClash_Rules](https://github.com/Aethersailor/Custom_OpenClash_Rules)

</div>

<h1 align="center">
  🚀 OpenClash Configuration<br>
  &<br>
  🛡️ Traffic Shaping Rules & Anti-Leak Templates
</h1>

<p align="center">
 <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/mythic3011/rules?style=flat">
 <img alt="GitHub commit activity" src="https://img.shields.io/github/commit-activity/t/mythic3011/rules?style=flat">
 <img alt="OpenClash" src="https://img.shields.io/badge/OpenClash-integrated-brightgreen?style=flat">
</p>

---

## 🎯 What This Fork Includes

- **🇭🇰 Hong Kong-optimized configurations** - ISP DNS routing and local network optimizations
- **🤖 AI service support** - Pre-configured groups for ChatGPT, Claude, Copilot, Gemini, and other AI tools
- **🎮 Gaming optimizations** - Separate download/gaming traffic handling
- **📊 DNS leak prevention** - Comprehensive DNS policy enforcement
- **🔄 Auto-updating rules** - Daily automatic rule and GeoSite database updates
- **📦 Ready-to-use templates** - Clash subscription conversion templates in `/cfg`
- **📚 Technical documentation** - Detailed setup guides in `/doc/openclash`

---

## 📖 Quick Start

**See the documentation in `/doc/openclash/` for detailed setup instructions:**

- `README.md` - Overview and quick reference
- `OPENCLASH_ADD_LOCAL_PROXY_TO_ACTIVE_CONFIG.md` - Adding proxy configurations
- `OPENCLASH_LOCAL_DNS_RECOVERY.md` - DNS troubleshooting
- `BANIP_DOH_SETUP_AND_FIX.md` - DoH (DNS over HTTPS) setup
- `RULE_ASSET_MATCHING_CONTRACT.md` - Rule asset specifications

### Key Features

1. **🧩 No plugin stacking** - All functionality via OpenClash alone
2. **🖱️ Simple setup** - Copy-paste configuration, no manual YAML editing
3. **🚀 Hong Kong ISP optimized** - Low latency, proper DNS resolution
4. **📁 Rich rule groups** - AI tools, gaming, streaming, social media, and more
5. **🌍 IPv6 compatible** - Full dual-stack support
6. **⚡ Auto-failover** - Automatic low-latency proxy selection

---

## 📋 Project Structure

```
├── cfg/                          # Clash configuration templates
│   ├── Custom_Clash.ini         # Main subscription conversion template
│   └── Custom_Clash_*.ini       # Variant templates (Lite, AI, GFW, etc.)
├── rule/                        # YAML rule files
│   ├── AI_*.yaml               # AI service rules
│   ├── Custom_*.yaml           # Custom routing rules
│   └── ...
├── dns/                         # DNS configuration files
│   ├── *.dnsmasq.conf          # Dnsmasq format rules
│   └── *.hosts.txt             # Hosts format rules
├── data/                        # Rule sources and metadata
├── doc/                         # Technical documentation
│   └── openclash/              # OpenClash-specific guides
├── py/                          # Python build scripts
└── reports/                     # Generated rule statistics
```

---

## 🛠️ Usage

**Subscribe to a configuration template:**

Use the subscription URL with a compatible Clash client (OpenClash on OpenWrt recommended):

```
https://raw.githubusercontent.com/mythic3011/rules/main/cfg/Custom_Clash.ini
```

Or one of the variants:

- `Custom_Clash_AI.ini` - Enhanced AI service support
- `Custom_Clash_Lite.ini` - Lightweight version
- `Custom_Clash_GFW.ini` - GFW filtering focus
- `Custom_Clash_Mainland.ini` - China mainland routing

---

## 📚 Documentation

All detailed documentation is in the `/doc/openclash/` directory. For comprehensive setup guides, troubleshooting, and advanced configurations, refer to those files.

---

## ⚠️ Disclaimer

> [!WARNING]
> **Usage Notice:**
>
> 1. This project is for technical learning and research only.
> 2. Users must comply with applicable local laws and regulations.
> 3. The maintainer provides no warranty or technical support guarantees.
> 4. Users are solely responsible for their actions and compliance with local laws.
> 5. This is a fork. See original project for upstream information.

For the complete legal disclaimer, see the original project.

---

## 📝 License

This fork retains the original CC-BY-SA-4.0 license from the upstream project.

See: [Aethersailor/Custom_OpenClash_Rules](https://github.com/Aethersailor/Custom_OpenClash_Rules)

---

## 🙏 Credits

- **Original Project**: [Aethersailor/Custom_OpenClash_Rules](https://github.com/Aethersailor/Custom_OpenClash_Rules)
- **OpenClash**: [vernesong/OpenClash](https://github.com/vernesong/OpenClash)
- **Core**: [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)
- **Rule Sources**: Multiple community projects (see main project)

---

## 📊 Repository Activity

<a href="https://www.star-history.com/#mythic3011/rules&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=mythic3011/rules&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=mythic3011/rules&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=mythic3011/rules&type=Date" />
 </picture>
</a>
