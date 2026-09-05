// GENERATED. Do not edit.
export default {
  "schemaVersion": 1,
  "baseProfiles": [
    {
      "id": "ai-balanced",
      "name": "AI Balanced",
      "description": "Relaxed AI routing with region-aware selectors."
    }
  ],
  "groups": {
    "manual": "🚀 手動選擇",
    "auto": "♻️ 自動選擇",
    "direct": "🎯 全球直連",
    "reject": "⛔ 拒絕",
    "fallback": "🐟 漏網之魚",
    "stable-session": "💳 穩定會話",
    "high-risk-account": "🔐 高風險帳戶",
    "other": "🌐 其他／未識別節點",
    "us": "🇺🇸 美國節點",
    "jp": "🇯🇵 日本節點",
    "sg": "🇸🇬 新加坡節點",
    "tw": "🇹🇼 台灣節點",
    "kr": "🇰🇷 韓國節點",
    "hk": "🇭🇰 香港節點",
    "mo": "🇲🇴 澳門節點",
    "uk": "🇬🇧 英國節點",
    "fr": "🇫🇷 法國節點",
    "de": "🇩🇪 德國節點",
    "it": "🇮🇹 義大利節點",
    "no": "🇳🇴 挪威節點",
    "ca": "🇨🇦 加拿大節點",
    "au": "🇦🇺 澳洲節點",
    "ru": "🇷🇺 俄羅斯節點",
    "ua": "🇺🇦 烏克蘭節點",
    "tr": "🇹🇷 土耳其節點",
    "chatgpt": "🤖 ChatGPT",
    "copilot": "🧑‍💻 Copilot",
    "claude": "🤖 Claude",
    "gemini": "🤖 Gemini",
    "notebooklm": "🤖 NotebookLM",
    "jules": "🤖 Jules",
    "perplexity": "🤖 Perplexity",
    "grok": "🤖 Grok",
    "poe": "🤖 Poe",
    "openrouter": "🤖 OpenRouter",
    "cursor": "🤖 Cursor",
    "huggingface": "🤗 Hugging Face",
    "mirasim": "🤖 Mirasim",
    "antigravity": "🤖 Antigravity",
    "google-labs": "🤖 Google Labs",
    "stitch": "🤖 Stitch",
    "android-studio-ai": "🤖 Android Studio AI",
    "gemini-cloud": "🤖 Gemini Cloud",
    "vertex-ai": "🤖 Vertex AI",
    "opencode": "🤖 OpenCode",
    "ai-other": "🤖 AI Other",
    "ai-cn-other": "🤖 AI CN Other"
  },
  "regions": [
    {
      "id": "us",
      "name": "United States",
      "group": "🇺🇸 美國節點",
      "terms": "🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC",
      "filterPattern": "(?i)(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)",
      "countryCodes": [
        "US"
      ],
      "aliases": [
        "United States",
        "USA",
        "America",
        "美國",
        "美国"
      ],
      "keywords": [
        "LAX",
        "SFO",
        "SJC",
        "SEA",
        "DFW",
        "NYC",
        "JFK",
        "EWR",
        "IAD",
        "ATL",
        "ORD",
        "MIA",
        "🇺🇸"
      ],
      "routable": true
    },
    {
      "id": "jp",
      "name": "Japan",
      "group": "🇯🇵 日本節點",
      "terms": "🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai",
      "filterPattern": "(?i)(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)",
      "countryCodes": [
        "JP"
      ],
      "aliases": [
        "Japan",
        "日本"
      ],
      "keywords": [
        "Tokyo",
        "東京",
        "东京",
        "Osaka",
        "大阪",
        "NRT",
        "HND",
        "KIX",
        "TYO",
        "OSA",
        "Kansai",
        "🇯🇵"
      ],
      "routable": true
    },
    {
      "id": "sg",
      "name": "Singapore",
      "group": "🇸🇬 新加坡節點",
      "terms": "🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN",
      "filterPattern": "(?i)(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)",
      "countryCodes": [
        "SG"
      ],
      "aliases": [
        "Singapore",
        "新加坡",
        "獅城",
        "狮城"
      ],
      "keywords": [
        "SIN",
        "🇸🇬"
      ],
      "routable": true
    },
    {
      "id": "tw",
      "name": "Taiwan",
      "group": "🇹🇼 台灣節點",
      "terms": "🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC",
      "filterPattern": "(?i)(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)",
      "countryCodes": [
        "TW"
      ],
      "aliases": [
        "Taiwan",
        "台灣",
        "臺灣",
        "台湾"
      ],
      "keywords": [
        "TPE",
        "台北",
        "臺北",
        "新北",
        "台中",
        "臺中",
        "高雄",
        "彰化",
        "ROC",
        "🇹🇼"
      ],
      "routable": true
    },
    {
      "id": "kr",
      "name": "South Korea",
      "group": "🇰🇷 韓國節點",
      "terms": "🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN",
      "filterPattern": "(?i)(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN)",
      "countryCodes": [
        "KR"
      ],
      "aliases": [
        "South Korea",
        "Korea",
        "韓國",
        "韩国"
      ],
      "keywords": [
        "Seoul",
        "首爾",
        "首尔",
        "ICN",
        "Chuncheon",
        "春川",
        "🇰🇷"
      ],
      "routable": true
    },
    {
      "id": "hk",
      "name": "Hong Kong",
      "group": "🇭🇰 香港節點",
      "terms": "🇭🇰|香港|Hong Kong|HongKong|HKG|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b",
      "filterPattern": "(?i)(?:🇭🇰|香港|Hong Kong|HongKong|HKG|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b)",
      "countryCodes": [
        "HK"
      ],
      "aliases": [
        "Hong Kong",
        "香港",
        "HK"
      ],
      "keywords": [
        "HKG",
        "🇭🇰"
      ],
      "routable": false
    },
    {
      "id": "mo",
      "name": "Macao",
      "group": "🇲🇴 澳門節點",
      "terms": "🇲🇴|Macao|Macau|澳門|澳门|\\bMO(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|MFM",
      "filterPattern": "(?i)(?:🇲🇴|Macao|Macau|澳門|澳门|\\bMO(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|MFM)",
      "countryCodes": [
        "MO"
      ],
      "aliases": [
        "Macao",
        "Macau",
        "澳門",
        "澳门"
      ],
      "keywords": [
        "MFM",
        "🇲🇴"
      ],
      "routable": false
    },
    {
      "id": "uk",
      "name": "United Kingdom",
      "group": "🇬🇧 英國節點",
      "terms": "🇬🇧|United Kingdom|Britain|英國|英国|London|倫敦|伦敦|\\bUK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|\\bGB(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|LHR|LGW|MAN|LCY",
      "filterPattern": "(?i)(?:🇬🇧|United Kingdom|Britain|英國|英国|London|倫敦|伦敦|\\bUK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|\\bGB(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|LHR|LGW|MAN|LCY)",
      "countryCodes": [
        "GB"
      ],
      "aliases": [
        "United Kingdom",
        "Britain",
        "英國",
        "英国"
      ],
      "keywords": [
        "LHR",
        "LGW",
        "MAN",
        "LCY",
        "London",
        "倫敦",
        "伦敦",
        "🇬🇧"
      ],
      "routable": false
    },
    {
      "id": "fr",
      "name": "France",
      "group": "🇫🇷 法國節點",
      "terms": "🇫🇷|France|法國|法国|Paris|巴黎|\\bFR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|CDG|ORY",
      "filterPattern": "(?i)(?:🇫🇷|France|法國|法国|Paris|巴黎|\\bFR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|CDG|ORY)",
      "countryCodes": [
        "FR"
      ],
      "aliases": [
        "France",
        "法國",
        "法国"
      ],
      "keywords": [
        "CDG",
        "ORY",
        "Paris",
        "巴黎",
        "🇫🇷"
      ],
      "routable": false
    },
    {
      "id": "de",
      "name": "Germany",
      "group": "🇩🇪 德國節點",
      "terms": "🇩🇪|Germany|德國|德国|Frankfurt|Frankfurt am Main|Berlin|慕尼黑|法蘭克福|法兰克福|柏林|\\bDE(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|FRA|MUC|BER",
      "filterPattern": "(?i)(?:🇩🇪|Germany|德國|德国|Frankfurt|Frankfurt am Main|Berlin|慕尼黑|法蘭克福|法兰克福|柏林|\\bDE(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|FRA|MUC|BER)",
      "countryCodes": [
        "DE"
      ],
      "aliases": [
        "Germany",
        "德國",
        "德国"
      ],
      "keywords": [
        "FRA",
        "MUC",
        "BER",
        "Frankfurt",
        "Frankfurt am Main",
        "Berlin",
        "慕尼黑",
        "法蘭克福",
        "法兰克福",
        "柏林",
        "🇩🇪"
      ],
      "routable": false
    },
    {
      "id": "it",
      "name": "Italy",
      "group": "🇮🇹 義大利節點",
      "terms": "🇮🇹|Italy|Italia|義大利|意大利|Milan|Rome|米蘭|米兰|羅馬|罗马|\\bIT(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|MXP|FCO",
      "filterPattern": "(?i)(?:🇮🇹|Italy|Italia|義大利|意大利|Milan|Rome|米蘭|米兰|羅馬|罗马|\\bIT(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|MXP|FCO)",
      "countryCodes": [
        "IT"
      ],
      "aliases": [
        "Italy",
        "Italia",
        "義大利",
        "意大利"
      ],
      "keywords": [
        "MXP",
        "FCO",
        "Milan",
        "Rome",
        "米蘭",
        "米兰",
        "羅馬",
        "罗马",
        "🇮🇹"
      ],
      "routable": false
    },
    {
      "id": "no",
      "name": "Norway",
      "group": "🇳🇴 挪威節點",
      "terms": "🇳🇴|Norway|挪威|Oslo|奧斯陸|奥斯陆|\\bNO(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|OSL",
      "filterPattern": "(?i)(?:🇳🇴|Norway|挪威|Oslo|奧斯陸|奥斯陆|\\bNO(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|OSL)",
      "countryCodes": [
        "NO"
      ],
      "aliases": [
        "Norway",
        "挪威"
      ],
      "keywords": [
        "OSL",
        "Oslo",
        "奧斯陸",
        "奥斯陆",
        "🇳🇴"
      ],
      "routable": false
    },
    {
      "id": "ca",
      "name": "Canada",
      "group": "🇨🇦 加拿大節點",
      "terms": "🇨🇦|Canada|加拿大|Toronto|Vancouver|Montreal|多倫多|多伦多|溫哥華|温哥华|\\bCA(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|YYZ|YVR|YUL",
      "filterPattern": "(?i)(?:🇨🇦|Canada|加拿大|Toronto|Vancouver|Montreal|多倫多|多伦多|溫哥華|温哥华|\\bCA(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|YYZ|YVR|YUL)",
      "countryCodes": [
        "CA"
      ],
      "aliases": [
        "Canada",
        "加拿大"
      ],
      "keywords": [
        "YYZ",
        "YVR",
        "YUL",
        "Toronto",
        "Vancouver",
        "Montreal",
        "多倫多",
        "多伦多",
        "溫哥華",
        "温哥华",
        "🇨🇦"
      ],
      "routable": false
    },
    {
      "id": "au",
      "name": "Australia",
      "group": "🇦🇺 澳洲節點",
      "terms": "🇦🇺|Australia|澳洲|澳大利亞|澳大利亚|Sydney|Melbourne|雪梨|悉尼|墨爾本|墨尔本|\\bAU(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|SYD|MEL",
      "filterPattern": "(?i)(?:🇦🇺|Australia|澳洲|澳大利亞|澳大利亚|Sydney|Melbourne|雪梨|悉尼|墨爾本|墨尔本|\\bAU(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|SYD|MEL)",
      "countryCodes": [
        "AU"
      ],
      "aliases": [
        "Australia",
        "澳洲",
        "澳大利亞",
        "澳大利亚"
      ],
      "keywords": [
        "SYD",
        "MEL",
        "Sydney",
        "Melbourne",
        "雪梨",
        "悉尼",
        "墨爾本",
        "墨尔本",
        "🇦🇺"
      ],
      "routable": false
    },
    {
      "id": "ru",
      "name": "Russia",
      "group": "🇷🇺 俄羅斯節點",
      "terms": "🇷🇺|Russia|俄羅斯|俄罗斯|Moscow|莫斯科|\\bRU(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|SVO|DME",
      "filterPattern": "(?i)(?:🇷🇺|Russia|俄羅斯|俄罗斯|Moscow|莫斯科|\\bRU(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|SVO|DME)",
      "countryCodes": [
        "RU"
      ],
      "aliases": [
        "Russia",
        "俄羅斯",
        "俄罗斯"
      ],
      "keywords": [
        "SVO",
        "DME",
        "Moscow",
        "莫斯科",
        "🇷🇺"
      ],
      "routable": false
    },
    {
      "id": "ua",
      "name": "Ukraine",
      "group": "🇺🇦 烏克蘭節點",
      "terms": "🇺🇦|Ukraine|烏克蘭|乌克兰|Kyiv|Kiev|基輔|基辅|\\bUA(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|KBP",
      "filterPattern": "(?i)(?:🇺🇦|Ukraine|烏克蘭|乌克兰|Kyiv|Kiev|基輔|基辅|\\bUA(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|KBP)",
      "countryCodes": [
        "UA"
      ],
      "aliases": [
        "Ukraine",
        "烏克蘭",
        "乌克兰"
      ],
      "keywords": [
        "KBP",
        "Kyiv",
        "Kiev",
        "基輔",
        "基辅",
        "🇺🇦"
      ],
      "routable": false
    },
    {
      "id": "tr",
      "name": "Turkey",
      "group": "🇹🇷 土耳其節點",
      "terms": "🇹🇷|Turkey|Türkiye|土耳其|Istanbul|伊斯坦堡|伊斯坦布尔|\\bTR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|IST|SAW",
      "filterPattern": "(?i)(?:🇹🇷|Turkey|Türkiye|土耳其|Istanbul|伊斯坦堡|伊斯坦布尔|\\bTR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|IST|SAW)",
      "countryCodes": [
        "TR"
      ],
      "aliases": [
        "Turkey",
        "Türkiye",
        "土耳其"
      ],
      "keywords": [
        "IST",
        "SAW",
        "Istanbul",
        "伊斯坦堡",
        "伊斯坦布尔",
        "🇹🇷"
      ],
      "routable": false
    }
  ],
  "routableRegionOrder": [
    "us",
    "jp",
    "sg",
    "tw",
    "kr"
  ],
  "regionGroups": {
    "🇺🇸 美國節點": "us",
    "🇯🇵 日本節點": "jp",
    "🇸🇬 新加坡節點": "sg",
    "🇹🇼 台灣節點": "tw",
    "🇰🇷 韓國節點": "kr"
  },
  "stableRegionGroups": {
    "🇯🇵 JP Stable": "jp",
    "🇸🇬 SG Stable": "sg",
    "🇺🇸 US Stable": "us"
  },
  "otherRegionGroup": "🌐 其他／未識別節點",
  "render": {
    "preamble": [
      ";Custom_OpenClash_Rules",
      ";AI 專用訂閱轉換模板（YAML / INI 行为显式分离）",
      ";作者：https://github.com/mythic3011/rules",
      ";項目地址：https://github.com/mythic3011/rules",
      ";基於 Custom_Clash_AI.yaml 的寬鬆版路由策略，但維持 subconverter [custom] 方言。",
      ";YAML 使用 rule-providers；INI 只使用 ruleset= / custom_proxy_group=，不包含 YAML rule-providers 語法。",
      ";Provider-level exclude-filter only applies to YAML output. INI relies on group regex filtering and explicit comments.",
      ";Cloudflare generate_204 checks proxy reachability only. It does not validate SSH-to-VPS path quality.",
      ";GENERATED by profile resolver. Do not edit manually.",
      "",
      "[custom]",
      "",
      ";設定規則標誌位",
      ";以下規則按由上而下順序遍歷，優先命中上位規則，規則重複無影響",
      ""
    ],
    "suffix": [
      "",
      "",
      ";下方参数请勿修改",
      "enable_rule_generator=true",
      "overwrite_original_rules=true"
    ]
  },
  "plan": {
    "sections": [
      {
        "role": "foundation-rules",
        "type": "rules",
        "rules": [
          {
            "kind": "geosite",
            "target": "🎯 全球直連",
            "url": null,
            "interval": null,
            "value": "private",
            "options": []
          },
          {
            "kind": "geoip",
            "target": "🎯 全球直連",
            "url": null,
            "interval": null,
            "value": "private",
            "options": [
              "no-resolve"
            ]
          }
        ],
        "comments": [],
        "leadingBlank": false,
        "emitIfEmpty": true
      },
      {
        "role": "legacy-before",
        "type": "rules",
        "rules": [
          {
            "kind": "remote-classical",
            "target": "🔐 Claude Account Guard",
            "url": "https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/anthropic.yaml",
            "interval": 10800,
            "value": null,
            "options": []
          },
          {
            "kind": "remote-classical",
            "target": "⛔ 拒絕",
            "url": "https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/anthropic.yaml",
            "interval": 10800,
            "value": null,
            "options": []
          }
        ],
        "comments": [],
        "leadingBlank": true,
        "emitIfEmpty": true
      },
      {
        "role": "service-rule-clusters",
        "type": "clusters",
        "clusters": [
          {
            "source": "service",
            "rules": [
              {
                "kind": "geosite",
                "target": "🤖 ChatGPT",
                "url": null,
                "interval": null,
                "value": "openai",
                "options": []
              }
            ]
          },
          {
            "source": "service",
            "rules": [
              {
                "kind": "remote-classical",
                "target": "🧑‍💻 Copilot",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Copilot_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "geosite",
                "target": "🧑‍💻 Copilot",
                "url": null,
                "interval": null,
                "value": "github-copilot",
                "options": []
              }
            ]
          },
          {
            "source": "service",
            "rules": [
              {
                "kind": "remote-classical",
                "target": "🤖 Gemini",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Gemini_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 NotebookLM",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_NotebookLM_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Jules",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Jules_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "geosite",
                "target": "🤖 Perplexity",
                "url": null,
                "interval": null,
                "value": "perplexity",
                "options": []
              },
              {
                "kind": "geosite",
                "target": "🤖 Grok",
                "url": null,
                "interval": null,
                "value": "xai",
                "options": []
              },
              {
                "kind": "geosite",
                "target": "🤖 Poe",
                "url": null,
                "interval": null,
                "value": "poe",
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 OpenRouter",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_OpenRouter_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Cursor",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Cursor_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤗 Hugging Face",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_HuggingFace_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Mirasim",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Mirasim_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Antigravity",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Antigravity_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Google Labs",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_GoogleLabs_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Stitch",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Stitch_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Android Studio AI",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_AndroidStudioAI_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Gemini Cloud",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_GeminiCloud_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Vertex AI",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_VertexAI_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              }
            ]
          },
          {
            "source": "service",
            "rules": [
              {
                "kind": "remote-classical",
                "target": "🤖 OpenCode",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_OpenCode_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              }
            ]
          }
        ],
        "leadingBlank": false,
        "blankBeforeFirst": true,
        "blankBetween": true
      },
      {
        "role": "legacy-after-head",
        "type": "rules",
        "rules": [
          {
            "kind": "remote-classical",
            "target": "🌊 Windsurf",
            "url": "https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/windsurf.yaml",
            "interval": 10800,
            "value": null,
            "options": []
          },
          {
            "kind": "remote-classical",
            "target": "🤗 Hugging Face",
            "url": "https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/huggingface.yaml",
            "interval": 10800,
            "value": null,
            "options": []
          }
        ],
        "comments": [],
        "leadingBlank": true,
        "emitIfEmpty": true
      },
      {
        "role": "process-rules",
        "type": "rules",
        "rules": [],
        "comments": [],
        "leadingBlank": true,
        "emitIfEmpty": false
      },
      {
        "role": "legacy-after-tail",
        "type": "rules",
        "rules": [
          {
            "kind": "remote-classical",
            "target": "🤖 AI Other",
            "url": "https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/all.yaml",
            "interval": 10800,
            "value": null,
            "options": []
          },
          {
            "kind": "geosite",
            "target": "🤖 AI Other",
            "url": null,
            "interval": null,
            "value": "google-deepmind",
            "options": []
          },
          {
            "kind": "geosite",
            "target": "🤖 AI Other",
            "url": null,
            "interval": null,
            "value": "category-ai-!cn",
            "options": []
          }
        ],
        "comments": [],
        "leadingBlank": true,
        "emitIfEmpty": true
      },
      {
        "role": "routing-tail-clusters",
        "type": "clusters",
        "clusters": [
          {
            "source": "companion",
            "rules": [
              {
                "kind": "remote-classical",
                "target": "🎯 全球直連",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/SSH_Direct_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🚀 手動選擇",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/SSH_Proxy_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              }
            ]
          },
          {
            "source": "companion",
            "rules": [
              {
                "kind": "remote-classical",
                "target": "🎯 全球直連",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Gaming_Direct_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              }
            ]
          },
          {
            "source": "companion",
            "rules": [
              {
                "kind": "remote-classical",
                "target": "🎯 全球直連",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/HuggingFace_Download_Direct_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🎯 全球直連",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Cursor_Download_Direct_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              }
            ]
          },
          {
            "source": "companion",
            "rules": [
              {
                "kind": "remote-classical",
                "target": "🔐 高風險帳戶",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_Stripe_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🔐 高風險帳戶",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_PayPal_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🔐 高風險帳戶",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_Wise_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🔐 高風險帳戶",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_Revolut_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🔐 高風險帳戶",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_IBKR_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🔐 高風險帳戶",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_Alpaca_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              }
            ]
          },
          {
            "source": "external",
            "rules": [
              {
                "kind": "remote-domain",
                "target": "🎯 全球直連",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Direct_Domain.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🎯 全球直連",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Direct_Classical_IP.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              }
            ]
          },
          {
            "source": "external",
            "rules": [
              {
                "kind": "remote-domain",
                "target": "🚀 手動選擇",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Proxy_Domain.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🚀 手動選擇",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Proxy_Classical_IP.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              }
            ]
          },
          {
            "source": "external",
            "rules": [
              {
                "kind": "geoip",
                "target": "🎯 全球直連",
                "url": null,
                "interval": null,
                "value": "HK",
                "options": [
                  "no-resolve"
                ]
              }
            ]
          },
          {
            "source": "external",
            "rules": [
              {
                "kind": "final",
                "target": "🐟 漏網之魚",
                "url": null,
                "interval": null,
                "value": null,
                "options": []
              }
            ]
          }
        ],
        "leadingBlank": true,
        "blankBeforeFirst": false,
        "blankBetween": true
      },
      {
        "role": "foundation-groups",
        "type": "groups",
        "groups": [
          {
            "type": "select-group",
            "name": "🎯 全球直連",
            "candidates": [
              {
                "kind": "node-filter",
                "value": "[]DIRECT"
              }
            ]
          },
          {
            "type": "select-group",
            "name": "⛔ 拒絕",
            "candidates": [
              {
                "kind": "node-filter",
                "value": "[]REJECT"
              }
            ]
          }
        ],
        "title": "Level 0 — Foundation groups",
        "subtitle": "Define these before anything references them",
        "blankBetweenGroups": false
      },
      {
        "role": "automatic-region-groups",
        "type": "groups",
        "groups": [
          {
            "type": "proxy-group",
            "name": "🇺🇸 美國節點",
            "kind": "url-test",
            "candidates": [],
            "filterPattern": "(?i)(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)",
            "healthCheckUrl": "https://cp.cloudflare.com/generate_204",
            "interval": 300,
            "tolerance": 50
          },
          {
            "type": "proxy-group",
            "name": "🇯🇵 日本節點",
            "kind": "url-test",
            "candidates": [],
            "filterPattern": "(?i)(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)",
            "healthCheckUrl": "https://cp.cloudflare.com/generate_204",
            "interval": 300,
            "tolerance": 50
          },
          {
            "type": "proxy-group",
            "name": "🇸🇬 新加坡節點",
            "kind": "url-test",
            "candidates": [],
            "filterPattern": "(?i)(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)",
            "healthCheckUrl": "https://cp.cloudflare.com/generate_204",
            "interval": 300,
            "tolerance": 50
          },
          {
            "type": "proxy-group",
            "name": "🇹🇼 台灣節點",
            "kind": "url-test",
            "candidates": [],
            "filterPattern": "(?i)(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)",
            "healthCheckUrl": "https://cp.cloudflare.com/generate_204",
            "interval": 300,
            "tolerance": 50
          },
          {
            "type": "proxy-group",
            "name": "🇰🇷 韓國節點",
            "kind": "url-test",
            "candidates": [],
            "filterPattern": "(?i)(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN)",
            "healthCheckUrl": "https://cp.cloudflare.com/generate_204",
            "interval": 300,
            "tolerance": 50
          },
          {
            "type": "proxy-group",
            "name": "🌐 其他／未識別節點",
            "kind": "select",
            "candidates": [],
            "filterPattern": "(?i)^(?!.*(?:剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明|🇭🇰|香港|Hong Kong|Hong-Kong|\\bHKG\\b|\\bHK\\b|(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)|(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)|(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)|(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)|(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN))).*$",
            "healthCheckUrl": null,
            "interval": null,
            "tolerance": null
          }
        ],
        "title": "Level 1 — Automatic region groups",
        "subtitle": null,
        "blankBetweenGroups": true
      },
      {
        "role": "stable-region-groups",
        "type": "groups",
        "groups": [
          {
            "type": "select-group",
            "name": "🇯🇵 JP Stable",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              },
              {
                "kind": "node-filter",
                "value": "(?i)🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai"
              }
            ]
          },
          {
            "type": "select-group",
            "name": "🇸🇬 SG Stable",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              },
              {
                "kind": "node-filter",
                "value": "(?i)🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN"
              }
            ]
          },
          {
            "type": "select-group",
            "name": "🇺🇸 US Stable",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              },
              {
                "kind": "node-filter",
                "value": "(?i)🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|\\bUSA\\b|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC"
              }
            ]
          }
        ],
        "title": "Level 1 — Stable manual region groups",
        "subtitle": null,
        "blankBetweenGroups": true
      },
      {
        "role": "shared-routing-groups",
        "type": "groups",
        "groups": [
          {
            "type": "proxy-group",
            "name": "♻️ 自動選擇",
            "kind": "fallback",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "🇺🇸 美國節點"
              },
              {
                "kind": "group-ref",
                "value": "🇯🇵 日本節點"
              },
              {
                "kind": "group-ref",
                "value": "🇸🇬 新加坡節點"
              },
              {
                "kind": "group-ref",
                "value": "🇹🇼 台灣節點"
              },
              {
                "kind": "group-ref",
                "value": "🇰🇷 韓國節點"
              },
              {
                "kind": "group-ref",
                "value": "🌐 其他／未識別節點"
              },
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ],
            "filterPattern": null,
            "healthCheckUrl": "https://cp.cloudflare.com/generate_204",
            "interval": 300,
            "tolerance": 50
          },
          {
            "type": "proxy-group",
            "name": "🚀 手動選擇",
            "kind": "select",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "♻️ 自動選擇"
              },
              {
                "kind": "group-ref",
                "value": "🎯 全球直連"
              },
              {
                "kind": "group-ref",
                "value": "🇺🇸 美國節點"
              },
              {
                "kind": "group-ref",
                "value": "🇯🇵 日本節點"
              },
              {
                "kind": "group-ref",
                "value": "🇸🇬 新加坡節點"
              },
              {
                "kind": "group-ref",
                "value": "🇹🇼 台灣節點"
              },
              {
                "kind": "group-ref",
                "value": "🇰🇷 韓國節點"
              },
              {
                "kind": "group-ref",
                "value": "🌐 其他／未識別節點"
              },
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ],
            "filterPattern": "(?i)^(?!.*(?:🇭🇰|香港|Hong Kong|Hong-Kong|\\bHKG\\b|\\bHK\\b|剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$",
            "healthCheckUrl": null,
            "interval": null,
            "tolerance": null
          },
          {
            "type": "proxy-group",
            "name": "💳 穩定會話",
            "kind": "select",
            "candidates": [
              {
                "kind": "node-filter",
                "value": "[]DIRECT"
              },
              {
                "kind": "node-filter",
                "value": "[]REJECT"
              }
            ],
            "filterPattern": "(?i)^(?!.*(?:剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$",
            "healthCheckUrl": null,
            "interval": null,
            "tolerance": null
          },
          {
            "type": "proxy-group",
            "name": "🔐 高風險帳戶",
            "kind": "select",
            "candidates": [
              {
                "kind": "node-filter",
                "value": "[]REJECT"
              },
              {
                "kind": "group-ref",
                "value": "💳 穩定會話"
              }
            ],
            "filterPattern": null,
            "healthCheckUrl": null,
            "interval": null,
            "tolerance": null
          }
        ],
        "title": "Level 2 — Shared routing selectors",
        "subtitle": null,
        "blankBetweenGroups": true
      },
      {
        "role": "service-selectors",
        "type": "selectors",
        "selectors": [
          {
            "comments": [
              "; ChatGPT is fail-closed.",
              "; User must explicitly select 手動選擇."
            ],
            "group": {
              "type": "select-group",
              "name": "🤖 ChatGPT",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                },
                {
                  "kind": "group-ref",
                  "value": "🚀 手動選擇"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🧑‍💻 Copilot",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Gemini",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 NotebookLM",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Jules",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Perplexity",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Grok",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Poe",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 OpenRouter",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Cursor",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤗 Hugging Face",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Mirasim",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Antigravity",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Google Labs",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Stitch",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Android Studio AI",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Gemini Cloud",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 Vertex AI",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          },
          {
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 OpenCode",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🎯 全球直連"
                },
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 美國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 日本節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 新加坡節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇹🇼 台灣節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🇰🇷 韓國節點"
                },
                {
                  "kind": "group-ref",
                  "value": "🌐 其他／未識別節點"
                },
                {
                  "kind": "group-ref",
                  "value": "⛔ 拒絕"
                }
              ]
            }
          }
        ],
        "title": "Level 3 — AI service selectors",
        "subtitle": "One service = one visible group",
        "blankBetweenSelectors": true
      },
      {
        "role": "account-group",
        "type": "groups",
        "groups": [
          {
            "type": "select-group",
            "name": "🔐 Claude Account Guard",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ]
          }
        ],
        "title": "Account-protected service",
        "subtitle": null,
        "blankBetweenGroups": false
      },
      {
        "role": "stable-session-groups",
        "type": "groups",
        "groups": [
          {
            "type": "select-group",
            "name": "🌊 Windsurf",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "🇺🇸 US Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇸🇬 SG Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇯🇵 JP Stable"
              },
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ]
          },
          {
            "type": "select-group",
            "name": "🤗 Hugging Face",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "🇺🇸 US Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇸🇬 SG Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇯🇵 JP Stable"
              },
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ]
          },
          {
            "type": "select-group",
            "name": "🤖 AI Other",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "🎯 全球直連"
              },
              {
                "kind": "group-ref",
                "value": "🇺🇸 US Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇸🇬 SG Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇯🇵 JP Stable"
              },
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ]
          }
        ],
        "title": "Stable-session / explicitly separated AI services",
        "subtitle": null,
        "blankBetweenGroups": true
      },
      {
        "role": "final-group",
        "type": "groups",
        "groups": [
          {
            "type": "select-group",
            "name": "🐟 漏網之魚",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "🎯 全球直連"
              },
              {
                "kind": "group-ref",
                "value": "🚀 手動選擇"
              },
              {
                "kind": "group-ref",
                "value": "♻️ 自動選擇"
              },
              {
                "kind": "group-ref",
                "value": "🌐 其他／未識別節點"
              },
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ]
          }
        ],
        "title": "Level 4 — Final catch-all selector",
        "subtitle": null,
        "blankBetweenGroups": false
      }
    ]
  },
  "parityFixtures": {
    "disable-jp": {
      "spec": {
        "schemaVersion": 1,
        "baseProfile": "ai-balanced",
        "disabledNodeRegions": [
          "jp"
        ],
        "onlyNodeRegions": [],
        "preferredNodeRegions": []
      },
      "customBodySha256": "95734b21dbd6772d2d34f6efc114968f73d1d3b50321e8d9b4e73ccb5e584a6d"
    },
    "only-us-sg-prefer-sg": {
      "spec": {
        "schemaVersion": 1,
        "baseProfile": "ai-balanced",
        "disabledNodeRegions": [],
        "onlyNodeRegions": [
          "us",
          "sg"
        ],
        "preferredNodeRegions": [
          "sg"
        ]
      },
      "customBodySha256": "c77f4717e5081ba12c0cb4ff6c8bc751a9a302fbfe94f532e2761342f21a05cf"
    },
    "disable-hk": {
      "spec": {
        "schemaVersion": 1,
        "baseProfile": "ai-balanced",
        "disabledNodeRegions": [
          "hk"
        ],
        "onlyNodeRegions": [],
        "preferredNodeRegions": []
      },
      "customBodySha256": "331e24065f4053750626918c7afa8347e749d5778e2f79a6dc61df904f312dc9"
    }
  }
};
