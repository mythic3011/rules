// GENERATED. Do not edit.
export default {
  "schemaVersion": 1,
  "templates": [
    {
      "id": "ai-balanced",
      "outputFormat": "ini",
      "name": "AI Balanced",
      "description": "AI-aware subscription template with region controls.",
      "supportsProfileOptions": true
    },
    {
      "id": "standard",
      "outputFormat": "ini",
      "name": "Standard",
      "description": "General-purpose subscription template.",
      "supportsProfileOptions": false
    },
    {
      "id": "lite",
      "outputFormat": "ini",
      "name": "Lite",
      "description": "Smaller general-purpose subscription template.",
      "supportsProfileOptions": false
    },
    {
      "id": "gfw",
      "outputFormat": "ini",
      "name": "GFW",
      "description": "Minimal GFW-oriented subscription template.",
      "supportsProfileOptions": false
    },
    {
      "id": "full",
      "outputFormat": "ini",
      "name": "Full",
      "description": "Full-rule subscription template.",
      "supportsProfileOptions": false
    },
    {
      "id": "mainland",
      "outputFormat": "ini",
      "name": "Mainland",
      "description": "Mainland-oriented subscription template.",
      "supportsProfileOptions": false
    },
    {
      "id": "ai-balanced",
      "outputFormat": "yaml",
      "name": "AI Balanced",
      "description": "AI-aware profile with region and service controls.",
      "supportsProfileOptions": true
    },
    {
      "id": "ai-strict",
      "outputFormat": "yaml",
      "name": "AI Strict",
      "description": "Fail-closed AI profile with account protections.",
      "supportsProfileOptions": true
    },
    {
      "id": "standard",
      "outputFormat": "yaml",
      "name": "Standard",
      "description": "General-purpose Mihomo profile.",
      "supportsProfileOptions": false
    }
  ],
  "defaultProfiles": {
    "ini": "ai-balanced",
    "yaml": "ai-balanced"
  },
  "accountProtection": {
    "serviceId": "claude",
    "protectedGroup": "🔐 Claude Account Guard",
    "rejectGroup": "⛔ 拒絕"
  },
  "baseProfiles": [
    {
      "id": "ai-balanced",
      "name": "AI Balanced",
      "description": "Relaxed AI routing with region-aware selectors."
    }
  ],
  "groups": {
    "manual": "🚀 手動選擇",
    "auto": "📌 固定節點",
    "dns": "🛡️ DNS Proxy",
    "direct": "🎯 全球直連",
    "reject": "⛔ 拒絕",
    "us-stable": "🇺🇸 US Stable",
    "sg-stable": "🇸🇬 SG Stable",
    "jp-stable": "🇯🇵 JP Stable",
    "fallback": "🐟 漏網之魚",
    "stable-session": "💳 穩定會話",
    "high-risk-account": "🔐 高風險帳戶",
    "other": "🌐 其他／未識別節點",
    "us": "🇺🇸 US Stable",
    "jp": "🇯🇵 JP Stable",
    "sg": "🇸🇬 SG Stable",
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
    "claude": "🔐 Claude Account Guard",
    "gemini": "🤖 Google AI",
    "notebooklm": "🤖 Google AI Tools",
    "jules": "🤖 Google AI Tools",
    "perplexity": "🤖 Perplexity",
    "grok": "🤖 Grok",
    "poe": "🤖 Poe",
    "openrouter": "🤖 OpenRouter",
    "cursor": "🤖 Cursor",
    "huggingface": "🤗 Hugging Face",
    "mirasim": "🤖 Mirasim",
    "antigravity": "🤖 Google AI Tools",
    "google-labs": "🤖 Google AI Tools",
    "stitch": "🤖 Google AI Tools",
    "android-studio-ai": "🤖 Google AI",
    "gemini-cloud": "🤖 Google AI Tools",
    "vertex-ai": "🤖 Google AI",
    "flow-music": "🎵 Flow Music",
    "opencode": "🤖 OpenCode",
    "ai-other": "🤖 AI Other",
    "ai-cn-other": "🤖 AI CN Other"
  },
  "regions": [
    {
      "id": "us",
      "name": "United States",
      "group": "🇺🇸 US Stable",
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
      "group": "🇯🇵 JP Stable",
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
      "group": "🇸🇬 SG Stable",
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
  "services": [
    {
      "id": "chatgpt",
      "name": "🤖 ChatGPT",
      "group": "🤖 ChatGPT",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "openai",
          "iniKind": "geosite",
          "iniValue": "openai"
        }
      ]
    },
    {
      "id": "copilot",
      "name": "🧑‍💻 Copilot",
      "group": "🧑‍💻 Copilot",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_Copilot_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Copilot_Classical.yaml"
        },
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "github-copilot",
          "iniKind": "geosite",
          "iniValue": "github-copilot"
        }
      ]
    },
    {
      "id": "claude",
      "name": "🔐 Claude Account Guard",
      "group": "🔐 Claude Account Guard",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_Claude_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Claude_Classical.yaml"
        },
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "anthropic",
          "iniKind": "geosite",
          "iniValue": "anthropic"
        },
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "category-ntp",
          "iniKind": "geosite",
          "iniValue": "category-ntp"
        }
      ]
    },
    {
      "id": "gemini",
      "name": "🤖 Google AI",
      "group": "🤖 Google AI",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_Gemini_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Gemini_Classical.yaml"
        }
      ]
    },
    {
      "id": "notebooklm",
      "name": "🤖 Google AI Tools",
      "group": "🤖 Google AI Tools",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_NotebookLM_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_NotebookLM_Classical.yaml"
        }
      ]
    },
    {
      "id": "jules",
      "name": "🤖 Google AI Tools",
      "group": "🤖 Google AI Tools",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_Jules_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Jules_Classical.yaml"
        }
      ]
    },
    {
      "id": "perplexity",
      "name": "🤖 Perplexity",
      "group": "🤖 Perplexity",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "perplexity",
          "iniKind": "geosite",
          "iniValue": "perplexity"
        }
      ]
    },
    {
      "id": "grok",
      "name": "🤖 Grok",
      "group": "🤖 Grok",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "xai",
          "iniKind": "geosite",
          "iniValue": "xai"
        }
      ]
    },
    {
      "id": "poe",
      "name": "🤖 Poe",
      "group": "🤖 Poe",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "poe",
          "iniKind": "geosite",
          "iniValue": "poe"
        }
      ]
    },
    {
      "id": "openrouter",
      "name": "🤖 OpenRouter",
      "group": "🤖 OpenRouter",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_OpenRouter_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_OpenRouter_Classical.yaml"
        }
      ]
    },
    {
      "id": "cursor",
      "name": "🤖 Cursor",
      "group": "🤖 Cursor",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_Cursor_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Cursor_Classical.yaml"
        }
      ]
    },
    {
      "id": "huggingface",
      "name": "🤗 Hugging Face",
      "group": "🤗 Hugging Face",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_HuggingFace_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_HuggingFace_Classical.yaml"
        }
      ]
    },
    {
      "id": "mirasim",
      "name": "🤖 Mirasim",
      "group": "🤖 Mirasim",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_Mirasim_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Mirasim_Classical.yaml"
        }
      ]
    },
    {
      "id": "antigravity",
      "name": "🤖 Google AI Tools",
      "group": "🤖 Google AI Tools",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_Antigravity_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Antigravity_Classical.yaml"
        }
      ]
    },
    {
      "id": "google-labs",
      "name": "🤖 Google AI Tools",
      "group": "🤖 Google AI Tools",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_GoogleLabs_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_GoogleLabs_Classical.yaml"
        }
      ]
    },
    {
      "id": "stitch",
      "name": "🤖 Google AI Tools",
      "group": "🤖 Google AI Tools",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_Stitch_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Stitch_Classical.yaml"
        }
      ]
    },
    {
      "id": "android-studio-ai",
      "name": "🤖 Google AI",
      "group": "🤖 Google AI",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_AndroidStudioAI_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_AndroidStudioAI_Classical.yaml"
        }
      ]
    },
    {
      "id": "gemini-cloud",
      "name": "🤖 Google AI Tools",
      "group": "🤖 Google AI Tools",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_GeminiCloud_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_GeminiCloud_Classical.yaml"
        }
      ]
    },
    {
      "id": "vertex-ai",
      "name": "🤖 Google AI",
      "group": "🤖 Google AI",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_VertexAI_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_VertexAI_Classical.yaml"
        }
      ]
    },
    {
      "id": "flow-music",
      "name": "🎵 Flow Music",
      "group": "🎵 Flow Music",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "Flow_Music_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Flow_Music_Classical.yaml"
        }
      ]
    },
    {
      "id": "opencode",
      "name": "🤖 OpenCode",
      "group": "🤖 OpenCode",
      "outputFormats": [
        "ini",
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "RULE-SET",
          "yamlValue": "AI_OpenCode_Classical",
          "iniKind": "remote-classical",
          "iniValue": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_OpenCode_Classical.yaml"
        }
      ]
    },
    {
      "id": "ai-other",
      "name": "🤖 AI Other",
      "group": "🤖 AI Other",
      "outputFormats": [
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "google-deepmind",
          "iniKind": "geosite",
          "iniValue": "google-deepmind"
        },
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "category-ai-!cn",
          "iniKind": "geosite",
          "iniValue": "category-ai-!cn"
        }
      ]
    },
    {
      "id": "ai-cn-other",
      "name": "🤖 AI CN Other",
      "group": "🤖 AI CN Other",
      "outputFormats": [
        "yaml"
      ],
      "ruleRefs": [
        {
          "yamlKind": "GEOSITE",
          "yamlValue": "category-ai-cn",
          "iniKind": "geosite",
          "iniValue": "category-ai-cn"
        }
      ]
    }
  ],
  "serviceGroups": [
    {
      "id": "chatgpt",
      "name": "🤖 ChatGPT",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "chatgpt"
      ],
      "defaultRoutes": [
        "us",
        "sg",
        "jp",
        "reject"
      ],
      "allowedRoutes": [
        "us",
        "sg",
        "jp",
        "reject",
        "tw",
        "kr",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "copilot",
      "name": "🧑‍💻 Copilot",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "copilot"
      ],
      "defaultRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "claude",
      "name": "🔐 Claude Account Guard",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "claude"
      ],
      "defaultRoutes": [
        "reject",
        "us",
        "sg",
        "jp"
      ],
      "allowedRoutes": [
        "reject",
        "us",
        "sg",
        "jp"
      ],
      "protected": true,
      "defaultRouteGroup": null
    },
    {
      "id": "gemini",
      "name": "🤖 Google AI",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "gemini",
        "android-studio-ai",
        "vertex-ai"
      ],
      "defaultRoutes": [
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "notebooklm",
      "name": "🤖 Google AI Tools",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "notebooklm",
        "jules",
        "antigravity",
        "google-labs",
        "stitch",
        "gemini-cloud"
      ],
      "defaultRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "perplexity",
      "name": "🤖 Perplexity",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "perplexity"
      ],
      "defaultRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "grok",
      "name": "🤖 Grok",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "grok"
      ],
      "defaultRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "poe",
      "name": "🤖 Poe",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "poe"
      ],
      "defaultRoutes": [
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "openrouter",
      "name": "🤖 OpenRouter",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "openrouter"
      ],
      "defaultRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "cursor",
      "name": "🤖 Cursor",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "cursor"
      ],
      "defaultRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "huggingface",
      "name": "🤗 Hugging Face",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "huggingface"
      ],
      "defaultRoutes": [
        "us",
        "sg",
        "jp",
        "reject"
      ],
      "allowedRoutes": [
        "us",
        "sg",
        "jp",
        "reject",
        "tw",
        "kr",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "mirasim",
      "name": "🤖 Mirasim",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "mirasim"
      ],
      "defaultRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "flow-music",
      "name": "🎵 Flow Music",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "flow-music"
      ],
      "defaultRoutes": [
        "jp",
        "sg",
        "us",
        "reject"
      ],
      "allowedRoutes": [
        "jp",
        "sg",
        "us",
        "reject",
        "tw",
        "kr",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "opencode",
      "name": "🤖 OpenCode",
      "outputFormat": "ini",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "opencode"
      ],
      "defaultRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": null
    },
    {
      "id": "chatgpt",
      "name": "🤖 ChatGPT",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "chatgpt"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "copilot",
      "name": "🧑‍💻 Copilot",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "copilot"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "claude",
      "name": "🔐 Claude Account Guard",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "claude"
      ],
      "defaultRoutes": [
        "reject",
        "us",
        "sg",
        "jp"
      ],
      "allowedRoutes": [
        "reject",
        "us",
        "sg",
        "jp"
      ],
      "protected": true,
      "defaultRouteGroup": null
    },
    {
      "id": "gemini",
      "name": "🤖 Google AI",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "gemini",
        "android-studio-ai",
        "vertex-ai"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "notebooklm",
      "name": "🤖 Google AI Tools",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "notebooklm",
        "jules",
        "antigravity",
        "google-labs",
        "stitch",
        "gemini-cloud"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "perplexity",
      "name": "🤖 Perplexity",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "perplexity"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "grok",
      "name": "🤖 Grok",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "grok"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "poe",
      "name": "🤖 Poe",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "poe"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "openrouter",
      "name": "🤖 OpenRouter",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "openrouter"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "cursor",
      "name": "🤖 Cursor",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "cursor"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "huggingface",
      "name": "🤗 Hugging Face",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "huggingface"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "mirasim",
      "name": "🤖 Mirasim",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "mirasim"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "flow-music",
      "name": "🎵 Flow Music",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "flow-music"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "opencode",
      "name": "🤖 OpenCode",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "opencode"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "ai-other",
      "name": "🤖 AI Other",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "ai-other"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "ai-cn-other",
      "name": "🤖 AI CN Other",
      "outputFormat": "yaml",
      "baseProfile": "ai-balanced",
      "serviceIds": [
        "ai-cn-other"
      ],
      "defaultRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "manual",
        "direct",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "chatgpt",
      "name": "🤖 ChatGPT",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "chatgpt"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "copilot",
      "name": "🧑‍💻 Copilot",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "copilot"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "claude",
      "name": "🔐 Claude Account Guard",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "claude"
      ],
      "defaultRoutes": [
        "reject",
        "us",
        "sg",
        "jp"
      ],
      "allowedRoutes": [
        "reject",
        "us",
        "sg",
        "jp"
      ],
      "protected": true,
      "defaultRouteGroup": null
    },
    {
      "id": "gemini",
      "name": "🤖 Google AI",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "gemini",
        "android-studio-ai",
        "vertex-ai"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "notebooklm",
      "name": "🤖 Google AI Tools",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "notebooklm",
        "jules",
        "antigravity",
        "google-labs",
        "stitch",
        "gemini-cloud"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "perplexity",
      "name": "🤖 Perplexity",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "perplexity"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "grok",
      "name": "🤖 Grok",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "grok"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "poe",
      "name": "🤖 Poe",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "poe"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "openrouter",
      "name": "🤖 OpenRouter",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "openrouter"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "cursor",
      "name": "🤖 Cursor",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "cursor"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "huggingface",
      "name": "🤗 Hugging Face",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "huggingface"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "mirasim",
      "name": "🤖 Mirasim",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "mirasim"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "flow-music",
      "name": "🎵 Flow Music",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "flow-music"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "opencode",
      "name": "🤖 OpenCode",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "opencode"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "ai-other",
      "name": "🤖 AI Other",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "ai-other"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    },
    {
      "id": "ai-cn-other",
      "name": "🤖 AI CN Other",
      "outputFormat": "yaml",
      "baseProfile": "ai-strict",
      "serviceIds": [
        "ai-cn-other"
      ],
      "defaultRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject"
      ],
      "allowedRoutes": [
        "default",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other",
        "reject",
        "hk",
        "mo",
        "uk",
        "fr",
        "de",
        "it",
        "no",
        "ca",
        "au",
        "ru",
        "ua",
        "tr"
      ],
      "protected": false,
      "defaultRouteGroup": "📌 固定節點",
      "defaultRouteCandidates": [
        "reject",
        "us",
        "jp",
        "sg",
        "tw",
        "kr",
        "other"
      ]
    }
  ],
  "reservedGroupNames": [
    "DIRECT",
    "REJECT",
    "⛔ 拒絕",
    "🇦🇺 澳洲節點",
    "🇨🇦 加拿大節點",
    "🇩🇪 德國節點",
    "🇫🇷 法國節點",
    "🇬🇧 英國節點",
    "🇭🇰 香港節點",
    "🇮🇹 義大利節點",
    "🇯🇵 JP Stable",
    "🇰🇷 韓國節點",
    "🇲🇴 澳門節點",
    "🇳🇴 挪威節點",
    "🇷🇺 俄羅斯節點",
    "🇸🇬 SG Stable",
    "🇹🇷 土耳其節點",
    "🇹🇼 台灣節點",
    "🇺🇦 烏克蘭節點",
    "🇺🇸 US Stable",
    "🌐 其他／未識別節點",
    "🎯 全球直連",
    "🎵 Flow Music · 固定節點",
    "🐟 漏網之魚",
    "💳 穩定會話",
    "📌 固定節點",
    "🔐 Claude Account Guard · 固定節點",
    "🔐 高風險帳戶",
    "🚀 手動選擇",
    "🛡️ DNS Proxy",
    "🤖 AI CN Other · 固定節點",
    "🤖 AI Other · 固定節點",
    "🤖 ChatGPT · 固定節點",
    "🤖 Cursor · 固定節點",
    "🤖 Google AI Tools · 固定節點",
    "🤖 Google AI · 固定節點",
    "🤖 Grok · 固定節點",
    "🤖 Mirasim · 固定節點",
    "🤖 OpenCode · 固定節點",
    "🤖 OpenRouter · 固定節點",
    "🤖 Perplexity · 固定節點",
    "🤖 Poe · 固定節點",
    "🤗 Hugging Face · 固定節點",
    "🧑‍💻 Copilot · 固定節點"
  ],
  "serviceGroupRouteLabels": {
    "reject": "⛔ 拒絕",
    "direct": "🎯 全球直連",
    "default": "📌 固定節點",
    "other": "🌐 其他／未識別節點",
    "manual": "🚀 手動選擇"
  },
  "serviceGroupLimits": {
    "maxGroups": 32,
    "maxNameLength": 80,
    "maxIdLength": 63,
    "maxRoutesPerGroup": 22
  },
  "routableRegionOrder": [
    "us",
    "jp",
    "sg",
    "tw",
    "kr"
  ],
  "regionGroups": {
    "🇺🇸 US Stable": "us",
    "🇯🇵 JP Stable": "jp",
    "🇸🇬 SG Stable": "sg",
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
    ],
    "localized": {
      "en": {
        "header": [
          "; Generated by Profile Builder.",
          "; Privacy guards run before service routes.",
          "; Group headings describe choices; they do not change rule priority."
        ],
        "footer": [
          "; Do not modify the settings below."
        ],
        "sections": {
          "foundation-rules": "Privacy and foundation rules",
          "legacy-before": "Earlier compatibility rules",
          "service-rule-clusters": "Service routing rules",
          "legacy-after-head": "Compatibility rules",
          "process-rules": "Process routing rules",
          "legacy-after-tail": "Additional compatibility rules",
          "routing-tail-clusters": "Final routing rules",
          "foundation-groups": "Shared routing groups",
          "automatic-region-groups": "Regional node selectors",
          "stable-region-groups": "Stable regional selectors",
          "shared-routing-groups": "Shared service groups",
          "service-selectors": "Service choices",
          "account-group": "Account protection groups",
          "stable-session-groups": "Stable session groups",
          "final-group": "Fallback routing"
        }
      },
      "zh-Hant": {
        "header": [
          "; 由 Profile Builder 產生。",
          "; 隱私保護規則先於服務路由執行。",
          "; 群組標題只描述選項，不會改變規則優先順序。"
        ],
        "footer": [
          "; 以下參數請勿修改。"
        ],
        "sections": {
          "foundation-rules": "隱私與基礎規則",
          "legacy-before": "相容性規則",
          "service-rule-clusters": "服務路由規則",
          "legacy-after-head": "相容性規則",
          "process-rules": "程序路由規則",
          "legacy-after-tail": "其他相容性規則",
          "routing-tail-clusters": "最後路由規則",
          "foundation-groups": "共用路由群組",
          "automatic-region-groups": "地區節點選擇",
          "stable-region-groups": "穩定地區選擇",
          "shared-routing-groups": "共用服務群組",
          "service-selectors": "服務選項",
          "account-group": "帳戶保護群組",
          "stable-session-groups": "穩定會話群組",
          "final-group": "後備路由"
        }
      },
      "zh-Hans": {
        "header": [
          "; 由 Profile Builder 生成。",
          "; 隐私保护规则先于服务路由执行。",
          "; 组标题只描述选项，不会改变规则优先级。"
        ],
        "footer": [
          "; 以下参数请勿修改。"
        ],
        "sections": {
          "foundation-rules": "隐私与基础规则",
          "legacy-before": "兼容规则",
          "service-rule-clusters": "服务路由规则",
          "legacy-after-head": "兼容规则",
          "process-rules": "进程路由规则",
          "legacy-after-tail": "其他兼容规则",
          "routing-tail-clusters": "最终路由规则",
          "foundation-groups": "共享路由组",
          "automatic-region-groups": "地区节点选择",
          "stable-region-groups": "稳定地区选择",
          "shared-routing-groups": "共享服务组",
          "service-selectors": "服务选项",
          "account-group": "账户保护组",
          "stable-session-groups": "稳定会话组",
          "final-group": "回退路由"
        }
      }
    },
    "defaultLanguage": "en"
  },
  "plan": {
    "sections": [
      {
        "role": "foundation-rules",
        "type": "rules",
        "rules": [
          {
            "kind": "remote-classical",
            "target": "⛔ 拒絕",
            "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Privacy_Guard_Classical.yaml",
            "interval": 28800,
            "value": null,
            "options": []
          },
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
            "target": "🎵 Flow Music",
            "url": "https://raw.githubusercontent.com/mythic3011/rules/0e9631339904f4a989c884781570b5756d82c9a3/rule/Flow_Music_Classical.yaml",
            "interval": 10800,
            "value": null,
            "options": []
          },
          {
            "kind": "remote-classical",
            "target": "🔐 Claude Account Guard",
            "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Claude_Classical.yaml",
            "interval": 28800,
            "value": null,
            "options": []
          },
          {
            "kind": "geosite",
            "target": "🔐 Claude Account Guard",
            "url": null,
            "interval": null,
            "value": "anthropic",
            "options": []
          },
          {
            "kind": "geosite",
            "target": "🔐 Claude Account Guard",
            "url": null,
            "interval": null,
            "value": "category-ntp",
            "options": []
          },
          {
            "kind": "remote-classical",
            "target": "🔐 Claude Account Guard",
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
                "target": "🤖 Google AI",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Gemini_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Google AI Tools",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_NotebookLM_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Google AI Tools",
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
                "target": "🤖 Google AI Tools",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Antigravity_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Google AI Tools",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_GoogleLabs_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Google AI Tools",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Stitch_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Google AI",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_AndroidStudioAI_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Google AI Tools",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_GeminiCloud_Classical.yaml",
                "interval": 28800,
                "value": null,
                "options": []
              },
              {
                "kind": "remote-classical",
                "target": "🤖 Google AI",
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
                "target": "🎵 Flow Music",
                "url": "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Flow_Music_Classical.yaml",
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
              },
              {
                "kind": "geoip",
                "target": "🎯 全球直連",
                "url": null,
                "interval": null,
                "value": "CN",
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
            "name": "🇹🇼 台灣節點",
            "kind": "select",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ],
            "filterPattern": "(?i)(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)",
            "healthCheckUrl": null,
            "interval": null,
            "tolerance": null
          },
          {
            "type": "proxy-group",
            "name": "🇰🇷 韓國節點",
            "kind": "select",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ],
            "filterPattern": "(?i)(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN)",
            "healthCheckUrl": null,
            "interval": null,
            "tolerance": null
          },
          {
            "type": "proxy-group",
            "name": "🌐 其他／未識別節點",
            "kind": "select",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ],
            "filterPattern": "(?i)^(?!.*(?:剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明|🇭🇰|香港|Hong Kong|Hong-Kong|\\bHKG\\b|\\bHK\\b|(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)|(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)|(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)|(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)|(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN))).*$",
            "healthCheckUrl": null,
            "interval": null,
            "tolerance": null
          }
        ],
        "title": "Level 1 — Regional node selectors",
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
            "name": "📌 固定節點",
            "kind": "select",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              },
              {
                "kind": "group-ref",
                "value": "🇺🇸 US Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇯🇵 JP Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇸🇬 SG Stable"
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
              }
            ],
            "filterPattern": null,
            "healthCheckUrl": null,
            "interval": null,
            "tolerance": null
          },
          {
            "type": "proxy-group",
            "name": "🚀 手動選擇",
            "kind": "select",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "📌 固定節點"
              },
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
                "value": "🇯🇵 JP Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇸🇬 SG Stable"
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
            "comments": [],
            "group": {
              "type": "select-group",
              "name": "🤖 ChatGPT",
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
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
              "name": "🤖 Google AI",
              "candidates": [
                {
                  "kind": "group-ref",
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
              "name": "🤖 Google AI Tools",
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
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
                  "value": "🇺🇸 US Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇯🇵 JP Stable"
                },
                {
                  "kind": "group-ref",
                  "value": "🇸🇬 SG Stable"
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
            "name": "🎵 Flow Music",
            "candidates": [
              {
                "kind": "group-ref",
                "value": "🇯🇵 JP Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇸🇬 SG Stable"
              },
              {
                "kind": "group-ref",
                "value": "🇺🇸 US Stable"
              },
              {
                "kind": "group-ref",
                "value": "⛔ 拒絕"
              }
            ]
          },
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
                "value": "📌 固定節點"
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
  "mihomoProfile": {
    "port": 7890,
    "socks-port": 7891,
    "mixed-port": 7893,
    "redir-port": 7892,
    "tproxy-port": 7895,
    "allow-lan": true,
    "bind-address": "*",
    "mode": "rule",
    "tcp-concurrent": true,
    "unified-delay": true,
    "proxy-providers": {
      "provider1": {
        "type": "http",
        "url": "url",
        "interval": 3600,
        "path": "./proxy_provider/provider1.yaml",
        "proxy": "DIRECT",
        "header": null,
        "health-check": {
          "enable": true,
          "interval": 600,
          "url": "https://cp.cloudflare.com/generate_204"
        },
        "override": {
          "skip-cert-verify": true,
          "udp": true
        },
        "exclude-filter": "(?i)(剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)"
      }
    },
    "geox-url": {
      "mmdb": "https://testingcf.jsdelivr.net/gh/alecthw/mmdb_china_ip_list@release/Country.mmdb",
      "geoip": "https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
      "geosite": "https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
      "asn": "https://testingcf.jsdelivr.net/gh/xishang0128/geoip@release/GeoLite2-ASN.mmdb"
    },
    "geo-auto-update": true,
    "geo-update-interval": 24,
    "geodata-mode": true,
    "log-level": "info",
    "ipv6": false,
    "profile": {
      "store-selected": true,
      "store-fake-ip": true
    },
    "tun": {
      "enable": true,
      "stack": "system",
      "dns-hijack": [
        "any:53",
        "tcp://any:53"
      ],
      "auto-detect-interface": false,
      "auto-route": false,
      "auto-redirect": false,
      "strict-route": false,
      "endpoint-independent-nat": true
    },
    "dns": {
      "enable": true,
      "listen": "0.0.0.0:7874",
      "ipv6": false,
      "enhanced-mode": "fake-ip",
      "fake-ip-range": "198.18.0.1/16",
      "fake-ip-filter": [
        "*.lan",
        "localhost.ptlogin2.qq.com"
      ],
      "fake-ip-filter-mode": "blacklist",
      "use-system-hosts": false,
      "respect-rules": false,
      "default-nameserver": [
        "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
        "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
      ],
      "nameserver": [
        "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
        "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
      ],
      "proxy-server-nameserver": [
        "https://8.8.8.8/dns-query#DIRECT",
        "https://8.8.4.4/dns-query#DIRECT"
      ],
      "direct-nameserver": [
        "https://127.0.0.1:5053/dns-query#DIRECT"
      ],
      "direct-nameserver-follow-policy": false,
      "nameserver-policy": {
        "geosite:private": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "geosite:cn": [
          "https://127.0.0.1:5053/dns-query#DIRECT"
        ],
        "geosite:openai": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "geosite:bing": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "geosite:category-ads-all": [
          "https://dns.adguard-dns.com/dns-query#🛡️ DNS Proxy"
        ],
        "+.anthropic.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.claude.ai": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.perplexity.ai": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "jules.google.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "jules.googleapis.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.x.ai": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.poe.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.openrouter.ai": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.cursor.sh": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.cursorapi.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.cursorvm.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.huggingface.co": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.mirasim.ai": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.antigravity.google": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.labs.google": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "cloudaicompanion.googleapis.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "cloudcode-pa.googleapis.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "geminicloudassist.googleapis.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "aiplatform.googleapis.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "stitch.withgoogle.com": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "+.opencode.ai": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "geosite:google-deepmind": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "geosite:category-ai-!cn": [
          "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
          "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
        ],
        "geosite:category-ai-cn": [
          "https://127.0.0.1:5053/dns-query#DIRECT"
        ]
      }
    },
    "proxy-groups": [
      {
        "name": "🚀 手動選擇",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ],
        "filter": "(?i)^(?!.*(?:🇭🇰|香港|Hong Kong|Hong-Kong|\bHKG\b|\bHK\b|剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$",
        "use": [
          "provider1"
        ]
      },
      {
        "name": "📌 固定節點",
        "type": "select",
        "proxies": [
          "⛔ 拒絕",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點"
        ]
      },
      {
        "name": "🛡️ DNS Proxy",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "REJECT"
        ],
        "default-selected": "📌 固定節點"
      },
      {
        "name": "💳 穩定會話",
        "type": "select",
        "proxies": [
          "DIRECT",
          "REJECT"
        ],
        "use": [
          "provider1"
        ]
      },
      {
        "name": "🔐 高風險帳戶",
        "type": "select",
        "proxies": [
          "REJECT",
          "💳 穩定會話"
        ],
        "default-selected": "REJECT"
      },
      {
        "name": "🤖 ChatGPT",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🧑‍💻 Copilot",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🔐 Claude Account Guard",
        "type": "select",
        "proxies": [
          "⛔ 拒絕",
          "🇺🇸 US Stable",
          "🇸🇬 SG Stable",
          "🇯🇵 JP Stable"
        ]
      },
      {
        "name": "🤖 Google AI",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 Google AI Tools",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 Perplexity",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 Grok",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 Poe",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 OpenRouter",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 Cursor",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤗 Hugging Face",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 Mirasim",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🎵 Flow Music",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 OpenCode",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 AI Other",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🤖 AI CN Other",
        "type": "select",
        "proxies": [
          "📌 固定節點",
          "🚀 手動選擇",
          "🎯 全球直連",
          "🇺🇸 US Stable",
          "🇯🇵 JP Stable",
          "🇸🇬 SG Stable",
          "🇹🇼 台灣節點",
          "🇰🇷 韓國節點",
          "🌐 其他／未識別節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "⛔ 拒絕",
        "type": "select",
        "proxies": [
          "REJECT"
        ]
      },
      {
        "name": "🐟 漏網之魚",
        "type": "select",
        "proxies": [
          "🎯 全球直連",
          "🚀 手動選擇",
          "📌 固定節點",
          "⛔ 拒絕"
        ]
      },
      {
        "name": "🇺🇸 US Stable",
        "type": "select",
        "filter": "(?i)(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)",
        "proxies": [
          "REJECT"
        ],
        "use": [
          "provider1"
        ]
      },
      {
        "name": "🇯🇵 JP Stable",
        "type": "select",
        "filter": "(?i)(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)",
        "proxies": [
          "REJECT"
        ],
        "use": [
          "provider1"
        ]
      },
      {
        "name": "🇸🇬 SG Stable",
        "type": "select",
        "filter": "(?i)(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)",
        "proxies": [
          "REJECT"
        ],
        "use": [
          "provider1"
        ]
      },
      {
        "name": "🇹🇼 台灣節點",
        "type": "select",
        "filter": "(?i)(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)",
        "proxies": [
          "REJECT"
        ],
        "use": [
          "provider1"
        ]
      },
      {
        "name": "🇰🇷 韓國節點",
        "type": "select",
        "filter": "(?i)(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN)",
        "proxies": [
          "REJECT"
        ],
        "use": [
          "provider1"
        ]
      },
      {
        "name": "🌐 其他／未識別節點",
        "type": "select",
        "filter": "(?i)^(?!.*(?:🇭🇰|香港|Hong Kong|Hong-Kong|\\bHKG\\b|\\bHK\\b|剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$",
        "exclude-filter": "(?i)(?:(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)|(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)|(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)|(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)|(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN))",
        "proxies": [
          "REJECT"
        ],
        "use": [
          "provider1"
        ]
      },
      {
        "name": "🎯 全球直連",
        "type": "select",
        "proxies": [
          "DIRECT"
        ]
      }
    ],
    "rules": [
      "RULE-SET,Privacy_Guard_Classical,⛔ 拒絕",
      "GEOSITE,private,🎯 全球直連",
      "GEOIP,private,🎯 全球直連,no-resolve",
      "GEOSITE,openai,🤖 ChatGPT",
      "RULE-SET,AI_Copilot_Classical,🧑‍💻 Copilot",
      "GEOSITE,github-copilot,🧑‍💻 Copilot",
      "RULE-SET,AI_Claude_Classical,🔐 Claude Account Guard",
      "GEOSITE,anthropic,🔐 Claude Account Guard",
      "GEOSITE,category-ntp,🔐 Claude Account Guard",
      "RULE-SET,AI_Gemini_Classical,🤖 Google AI",
      "RULE-SET,AI_NotebookLM_Classical,🤖 Google AI Tools",
      "RULE-SET,AI_Jules_Classical,🤖 Google AI Tools",
      "GEOSITE,perplexity,🤖 Perplexity",
      "GEOSITE,xai,🤖 Grok",
      "GEOSITE,poe,🤖 Poe",
      "RULE-SET,AI_OpenRouter_Classical,🤖 OpenRouter",
      "RULE-SET,AI_Cursor_Classical,🤖 Cursor",
      "RULE-SET,AI_HuggingFace_Classical,🤗 Hugging Face",
      "RULE-SET,AI_Mirasim_Classical,🤖 Mirasim",
      "RULE-SET,AI_Antigravity_Classical,🤖 Google AI Tools",
      "RULE-SET,AI_GoogleLabs_Classical,🤖 Google AI Tools",
      "RULE-SET,AI_Stitch_Classical,🤖 Google AI Tools",
      "RULE-SET,AI_AndroidStudioAI_Classical,🤖 Google AI",
      "RULE-SET,AI_GeminiCloud_Classical,🤖 Google AI Tools",
      "RULE-SET,AI_VertexAI_Classical,🤖 Google AI",
      "RULE-SET,Flow_Music_Classical,🎵 Flow Music",
      "RULE-SET,AI_OpenCode_Classical,🤖 OpenCode",
      "GEOSITE,google-deepmind,🤖 AI Other",
      "GEOSITE,category-ai-!cn,🤖 AI Other",
      "GEOSITE,category-ai-cn,🤖 AI CN Other",
      "RULE-SET,SSH_Direct_Classical,🎯 全球直連",
      "RULE-SET,SSH_Proxy_Classical,🚀 手動選擇",
      "RULE-SET,Gaming_Direct_Classical,🎯 全球直連",
      "RULE-SET,HuggingFace_Download_Direct_Classical,🎯 全球直連",
      "RULE-SET,Cursor_Download_Direct_Classical,🎯 全球直連",
      "RULE-SET,Finance_Stripe_Classical,🔐 高風險帳戶",
      "RULE-SET,Finance_PayPal_Classical,🔐 高風險帳戶",
      "RULE-SET,Finance_Wise_Classical,🔐 高風險帳戶",
      "RULE-SET,Finance_Revolut_Classical,🔐 高風險帳戶",
      "RULE-SET,Finance_IBKR_Classical,🔐 高風險帳戶",
      "RULE-SET,Finance_Alpaca_Classical,🔐 高風險帳戶",
      "RULE-SET,Custom_Direct_Domain,🎯 全球直連",
      "RULE-SET,Custom_Direct_Classical_IP,🎯 全球直連",
      "RULE-SET,Custom_Proxy_Domain,🚀 手動選擇",
      "RULE-SET,Custom_Proxy_Classical_IP,🚀 手動選擇",
      "GEOIP,HK,🎯 全球直連,no-resolve",
      "GEOIP,CN,🎯 全球直連,no-resolve",
      "SRC-IP-CIDR,10.0.0.11/32,🎯 全球直連",
      "MATCH,🐟 漏網之魚"
    ],
    "rule-providers": {
      "Privacy_Guard_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "IP-CIDR6,::/0,no-resolve",
          "DST-PORT,53",
          "DST-PORT,853",
          "DST-PORT,3478",
          "DST-PORT,5349",
          "DST-PORT,19302-19309",
          "DOMAIN-KEYWORD,stun"
        ]
      },
      "AI_Copilot_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,copilot.com",
          "DOMAIN-SUFFIX,copilot.microsoft.com",
          "DOMAIN-SUFFIX,copilot.cloud.microsoft"
        ]
      },
      "AI_Claude_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,anthropic.com",
          "DOMAIN-SUFFIX,claude.ai",
          "DOMAIN-SUFFIX,claude.com",
          "DOMAIN-SUFFIX,clau.de",
          "DOMAIN-SUFFIX,claudemcpclient.com",
          "DOMAIN-SUFFIX,claudemcpcontent.com",
          "DOMAIN-SUFFIX,claudeusercontent.com",
          "DOMAIN-SUFFIX,sentry.io",
          "DOMAIN-SUFFIX,statsigapi.net",
          "DOMAIN-SUFFIX,intercom.io",
          "DOMAIN-SUFFIX,intercomcdn.com",
          "DOMAIN,servd-anthropic-website.b-cdn.net",
          "DOMAIN,anthropic.com.cdn.cloudflare.net",
          "DOMAIN,anthropic.auth0.com",
          "DOMAIN,anthropic-com.ghost.io",
          "DOMAIN,browser-intake-us5-datadoghq.com",
          "DOMAIN,cdn.usefathom.com",
          "DOMAIN-KEYWORD,datadog",
          "DOMAIN-KEYWORD,sentry",
          "DOMAIN-KEYWORD,sift",
          "IP-CIDR,160.79.104.0/21",
          "IP-CIDR6,2607:6bc0::/32"
        ]
      },
      "AI_Gemini_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,gemini.google",
          "DOMAIN-SUFFIX,ai.google.dev",
          "DOMAIN-SUFFIX,ai.studio",
          "DOMAIN-SUFFIX,aistudio.google.com",
          "DOMAIN-SUFFIX,gemini.gstatic.com",
          "DOMAIN-SUFFIX,generativeai.google",
          "DOMAIN-SUFFIX,makersuite.google.com",
          "DOMAIN,gemini.google.com",
          "DOMAIN,generativelanguage.googleapis.com",
          "DOMAIN,geller-pa.googleapis.com",
          "DOMAIN,proactivebackend-pa.googleapis.com",
          "DOMAIN,robinfrontend-pa.googleapis.com"
        ]
      },
      "AI_NotebookLM_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,notebook.google",
          "DOMAIN-SUFFIX,notebook.google.com",
          "DOMAIN-SUFFIX,notebooklm.google",
          "DOMAIN-SUFFIX,notebooklm.google.com",
          "DOMAIN-SUFFIX,notebooklm.cloud.google.com",
          "DOMAIN,notebooklm-pa.googleapis.com",
          "DOMAIN,notebooklm.googleapis.com"
        ]
      },
      "AI_Jules_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN,jules.google.com",
          "DOMAIN,jules.googleapis.com"
        ]
      },
      "AI_OpenRouter_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,openrouter.ai"
        ]
      },
      "AI_Cursor_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,cursor.sh",
          "DOMAIN-SUFFIX,cursorapi.com",
          "DOMAIN-SUFFIX,cursorvm.com"
        ]
      },
      "AI_HuggingFace_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,huggingface.co"
        ]
      },
      "AI_Mirasim_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,mirasim.ai"
        ]
      },
      "AI_Antigravity_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,antigravity.google",
          "DOMAIN-SUFFIX,antigravity-unleash.goog",
          "DOMAIN-SUFFIX,daily-cloudcode-pa.googleapis.com",
          "DOMAIN-SUFFIX,cloudcode-pa.googleapis.com"
        ]
      },
      "AI_GoogleLabs_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,labs.google"
        ]
      },
      "AI_Stitch_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN,stitch.withgoogle.com"
        ]
      },
      "AI_AndroidStudioAI_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN,cloudaicompanion.googleapis.com",
          "DOMAIN,cloudcode-pa.googleapis.com"
        ]
      },
      "AI_GeminiCloud_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN,geminicloudassist.googleapis.com"
        ]
      },
      "AI_VertexAI_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN,aiplatform.googleapis.com",
          "DOMAIN-KEYWORD,-aiplatform.googleapis.com"
        ]
      },
      "Flow_Music_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN,storage.googleapis.com"
        ]
      },
      "AI_OpenCode_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,opencode.ai"
        ]
      },
      "SSH_Direct_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": []
      },
      "SSH_Proxy_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": []
      },
      "Gaming_Direct_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,steamcontent.com",
          "DOMAIN-SUFFIX,steampipe.akamaized.net",
          "DOMAIN-SUFFIX,steamserver.net",
          "DOMAIN-SUFFIX,battle.net",
          "DOMAIN-SUFFIX,blizzard.com",
          "DOMAIN-SUFFIX,blzstatic.cn",
          "DOMAIN-SUFFIX,origin.com",
          "DOMAIN-SUFFIX,warframe.com",
          "DOMAIN-SUFFIX,square-enix.com",
          "DOMAIN-SUFFIX,finalfantasyxiv.com",
          "DOMAIN-SUFFIX,ffxiv.com",
          "DOMAIN-SUFFIX,nintendo.net",
          "DOMAIN-SUFFIX,srv.nintendo.net",
          "DOMAIN-SUFFIX,cdn.nintendo.net",
          "DOMAIN-SUFFIX,stun.playstation.net",
          "DOMAIN-SUFFIX,xboxlive.com",
          "DOMAIN-SUFFIX,uu.163.com",
          "DOMAIN-SUFFIX,n0808.com",
          "DOMAIN-SUFFIX,sandai.net",
          "DOMAIN-SUFFIX,epicgames.com",
          "DOMAIN-SUFFIX,epicgamescdn.com"
        ]
      },
      "HuggingFace_Download_Direct_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,hf.co"
        ]
      },
      "Cursor_Download_Direct_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,cursor-cdn.com"
        ]
      },
      "Finance_Stripe_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,stripe.com",
          "DOMAIN-SUFFIX,stripecdn.com",
          "DOMAIN,m.stripe.network"
        ]
      },
      "Finance_PayPal_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,paypal.com",
          "DOMAIN-SUFFIX,paypalobjects.com"
        ]
      },
      "Finance_Wise_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,wise.com",
          "DOMAIN-SUFFIX,wise-sandbox.com",
          "DOMAIN,api-mtls.transferwise.com"
        ]
      },
      "Finance_Revolut_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN-SUFFIX,revolut.com"
        ]
      },
      "Finance_IBKR_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN,api.ibkr.com",
          "DOMAIN-SUFFIX,interactivebrokers.com"
        ]
      },
      "Finance_Alpaca_Classical": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "DOMAIN,api.alpaca.markets",
          "DOMAIN,paper-api.alpaca.markets",
          "DOMAIN,data.alpaca.markets",
          "DOMAIN,stream.data.alpaca.markets",
          "DOMAIN,broker-api.alpaca.markets",
          "DOMAIN,authx.alpaca.markets",
          "DOMAIN,data.sandbox.alpaca.markets",
          "DOMAIN,stream.data.sandbox.alpaca.markets",
          "DOMAIN,broker-api.sandbox.alpaca.markets"
        ]
      },
      "Custom_Direct_Domain": {
        "type": "inline",
        "behavior": "domain",
        "payload": [
          "*m-team*",
          "*quickconnect*",
          "*synology*",
          "+.00333118.com",
          "+.0044696.com",
          "+.03241119.xyz",
          "+.0734cn.top",
          "+.112114.xyz",
          "+.115cdn.de",
          "+.17van.com",
          "+.1996999.xyz",
          "+.204cloud.com",
          "+.2mcnxs.cc",
          "+.365ting.com",
          "+.3d-apollo.com",
          "+.3dwhere.com",
          "+.3gxk.net",
          "+.419g.com",
          "+.4399zmxy.com",
          "+.4xiaoshuo.org",
          "+.51tbox.com",
          "+.51wanxue.com",
          "+.51zmt.top",
          "+.52jiawei.com",
          "+.52met.com",
          "+.52muban.com",
          "+.55555.ink",
          "+.657192.com",
          "+.66990000.xyz",
          "+.6v520.net",
          "+.737698.xyz",
          "+.77shuku.org",
          "+.7sef.com",
          "+.85sc.com",
          "+.86656.net",
          "+.8kc.top",
          "+.900cha.com",
          "+.91shenfan.com",
          "+.97973399.com",
          "+.985hezi.com",
          "+.998tool.com",
          "+.a0d.top",
          "+.aaawz.cc",
          "+.acggit.com",
          "+.adobe.com",
          "+.afeica.com",
          "+.afuns.me",
          "+.aibeike.com",
          "+.aichangbaishan.com",
          "+.aidien.fun",
          "+.aidream.website",
          "+.aigodlike.com",
          "+.aisnogames.com",
          "+.aistudio-app.com",
          "+.akamaihd.net",
          "+.akamaized.net",
          "+.alonginwind.eu.org",
          "+.alonginwind.to",
          "+.aloys233.top",
          "+.antping.com",
          "+.anycubic.com",
          "+.anyrouter.top",
          "+.anytocopy.com",
          "+.api.myip.com",
          "+.apm-log-upload-os.hoyoverse.com",
          "+.aqtwwx.net",
          "+.argotunnel.com",
          "+.armvm.com",
          "+.asgardion.space",
          "+.atticus.vip",
          "+.awstme.top",
          "+.axuex.top",
          "+.babawar.com",
          "+.baiyishequ.com",
          "+.banban.work",
          "+.bangumi.tv",
          "+.batchat.com",
          "+.bdcb.cc",
          "+.beautifulcarrot.com",
          "+.belimked.com",
          "+.betahub.tech",
          "+.bgm.tv",
          "+.biandangroup.com",
          "+.biaoda.me",
          "+.bingshandashu.com",
          "+.bjtzeduyun.com",
          "+.bochaai.com",
          "+.bochk.com",
          "+.boxim.online",
          "+.boyuemobile.com",
          "+.bsbsb.top",
          "+.bunny.net",
          "+.canghaiip.com",
          "+.cangjie-lang.net",
          "+.cc.cd",
          "+.cdn.ist",
          "+.centbrowser.net",
          "+.cftunnel.com",
          "+.cg3da.com",
          "+.cgicop.com",
          "+.chaxunjiao.com",
          "+.chaz.fun",
          "+.checkip.dyndns.org",
          "+.checkipv6.dyndns.org",
          "+.chenyuxia.com",
          "+.cheriexsky.love",
          "+.cheshire.top",
          "+.chessease.net",
          "+.chii.in",
          "+.chinatle.com",
          "+.chujingapp.com",
          "+.chushi.cool",
          "+.clivia.fun",
          "+.cmbc.run",
          "+.cmhk.com",
          "+.cn-music.mefun.vip",
          "+.cnb.space",
          "+.cocav.com",
          "+.codeloop.top",
          "+.coffee-iot.com",
          "+.congmiqq.com",
          "+.coros.com",
          "+.crtyhr.com",
          "+.cyouzai.com",
          "+.d4ctech.com",
          "+.dadateach.com",
          "+.dahai96.com",
          "+.daocloud.vip",
          "+.day.app",
          "+.dayilive.com",
          "+.dcgstd.com",
          "+.ddsrem.com",
          "+.ddzn.tech",
          "+.dell.com",
          "+.dfhog.com",
          "+.dhub.kubesre.xyz",
          "+.dingdingzn.com",
          "+.diyiedu.com",
          "+.dnshe.com",
          "+.docker.1panel.live",
          "+.docker.kejilion.pro",
          "+.docker.unsee.tech",
          "+.dockerpull.org",
          "+.dockerpull.pw",
          "+.dothantech.com",
          "+.douqq.com",
          "+.drvceo.com",
          "+.dskj-ops.com",
          "+.dushe1.app",
          "+.eagsen.com",
          "+.easytier.top",
          "+.easytomessage.com",
          "+.einfo-tech.com",
          "+.emby.yun",
          "+.englibrary.com",
          "+.enyugame.net",
          "+.epark.cc",
          "+.epg.aptv.app",
          "+.epg.v1.mk",
          "+.et0731.com",
          "+.everdrawing.com",
          "+.excelbbx.net",
          "+.fdfinvoice.com",
          "+.feihengip.com",
          "+.feizhiyi.com",
          "+.fengsutb.com",
          "+.ffhome.com",
          "+.fjpit.com",
          "+.flingtrainer.com",
          "+.fofuai.com",
          "+.fowep.com",
          "+.freetv.top",
          "+.frp-ski.com",
          "+.fssbcc.top",
          "+.fsytss.com",
          "+.ft07.com",
          "+.functorz.com",
          "+.fuyinkeji.top",
          "+.fuziche.com",
          "+.fzshouji.com",
          "+.fzvcolco.com",
          "+.fzwqq.com",
          "+.gaishitongshu.com",
          "+.game.maj-soul.com",
          "+.gamepp.com",
          "+.gangtise.com",
          "+.gaojiua.com",
          "+.gaze.run",
          "+.gdcucc.v1.mk",
          "+.geektool.top",
          "+.gegeselect.hk",
          "+.ggbond.org",
          "+.gh-proxy.com",
          "+.gh.con.sh",
          "+.gh.ddlc.top",
          "+.gh.llkk.cc",
          "+.ghfast.top",
          "+.ghoxz.com",
          "+.ghp.ci",
          "+.ghproxy.cc",
          "+.ghproxy.cfd",
          "+.ghps.cc",
          "+.giomeru.com",
          "+.girigirilove.com",
          "+.git.886.be",
          "+.github.abskoop.workers.dev",
          "+.github.boki.moe",
          "+.github.moeyy.xyz",
          "+.github.site",
          "+.github.store",
          "+.giveup.top",
          "+.gjtool.com",
          "+.gmoj.net",
          "+.gmya.net",
          "+.goalmapapp.com",
          "+.goka.top",
          "+.googoc.com",
          "+.gootho.com",
          "+.gpetrip.com",
          "+.gpgwx.com",
          "+.gseen.com",
          "+.gsgltz.com",
          "+.gsjkjt.com",
          "+.gsnhcg.com",
          "+.gsstic.com",
          "+.guaitao.cc",
          "+.gvgoo.com",
          "+.gwmapp-w.com",
          "+.gxnnjidingkeji.top",
          "+.gzybao.com",
          "+.halvie.com",
          "+.ham.xin",
          "+.hangnakeji.com",
          "+.haoxueche.com",
          "+.harbourmooc.com",
          "+.hbcof.com",
          "+.hbctic.com",
          "+.hdbz.net",
          "+.hexiny.com",
          "+.hezuvip.com",
          "+.hf-mirror.com",
          "+.hhtvc.com",
          "+.hijin.vip",
          "+.hiwms.com",
          "+.hkchat.app",
          "+.hnxzctec.com",
          "+.hongxingdl.com",
          "+.hongxingdl.love",
          "+.hsbc.com.hk",
          "+.hstbroker.com",
          "+.hszq6.com",
          "+.htkgsx.com",
          "+.hub.crdz.gq",
          "+.hub.gitmirror.com",
          "+.hub.rat.dev",
          "+.hub.xdark.top",
          "+.huikao8.com",
          "+.hutaoyun.top",
          "+.hwbim.com",
          "+.hwjianmo.com",
          "+.hwzuku.com",
          "+.hybiome.com",
          "+.hzlawyer.net",
          "+.hzqsn.com",
          "+.icvcs.com",
          "+.idsduf.com",
          "+.ifconfig.co",
          "+.ifengmap.com",
          "+.ifish7.com",
          "+.igpsport.com",
          "+.ijingyi.com",
          "+.ilucky.net",
          "+.imacos.top",
          "+.immortalwrt.org",
          "+.iosgujian.com",
          "+.iot889.com",
          "+.iotrix.net",
          "+.ip159.com",
          "+.ip6.seeip.org",
          "+.ipapi.co",
          "+.ipshu.com",
          "+.istoreos.com",
          "+.itptg.com",
          "+.jduoduo.com",
          "+.jfjt.cc",
          "+.jh96095.com",
          "+.jiaoyanyun.com",
          "+.jieyoutsg.com",
          "+.jiliuwang.net",
          "+.jingheiot.com",
          "+.jiqw.com",
          "+.jjzyy.org",
          "+.jsdelivr.com",
          "+.jsdelivr.net",
          "+.julebu.co",
          "+.jxjktzjt.com",
          "+.jxpp.com",
          "+.jzagile.com",
          "+.kaihong.com",
          "+.kaijiejinrong.com",
          "+.kaipanhong.com",
          "+.kancaibao.com",
          "+.kaspersky-labs.com",
          "+.kaspersky.com",
          "+.kcbd.top",
          "+.kejiweixun.com",
          "+.keyoo.com",
          "+.kgithub.com",
          "+.kit327.com",
          "+.kmeila.com",
          "+.kuaicha888.com",
          "+.lanyun.net",
          "+.laogongju.com",
          "+.latexlive.com",
          "+.leelen.com",
          "+.letaoedu.com",
          "+.lg3000.top",
          "+.liunn.com",
          "+.liveperson.net",
          "+.longmenshuju.com",
          "+.lsbj365.com",
          "+.lucky.gd",
          "+.lyihub.com",
          "+.lyilife.com",
          "+.m-team.cc",
          "+.m-team.io",
          "+.machtalk.net",
          "+.manfuz.co",
          "+.mblyun.com",
          "+.mc-user.com",
          "+.mchuiji.com",
          "+.mcxyzt.cc",
          "+.medtechshare.com",
          "+.meishiffx.online",
          "+.meiyitou.top",
          "+.melecode.com",
          "+.members.3322.org",
          "+.meoof-pet.com",
          "+.micu.hk",
          "+.mifeng.plus",
          "+.mifon.com",
          "+.minor-api-os.hoyoverse.com",
          "+.misea.top",
          "+.mixly.org",
          "+.mobai.sbs",
          "+.modelscope.net",
          "+.morefuntengyun.com",
          "+.msftconnecttest.com",
          "+.msftncsi.com",
          "+.mslmc.net",
          "+.mtaokj.com",
          "+.mykuaidi.com",
          "+.myshopex.com",
          "+.naixi.com",
          "+.nanhuabx.com",
          "+.nanshe-tech.com",
          "+.natchecker.com",
          "+.neihang.net",
          "+.netzz.net",
          "+.nhk.or.jp",
          "+.nicezhuanye.com",
          "+.nkxingxh.top",
          "+.nn.ci",
          "+.nodcloud.com",
          "+.nxog.top",
          "+.oceando.cloud",
          "+.ok321.top",
          "+.onebuygz.com",
          "+.onetools.top",
          "+.openkylin.top",
          "+.opentrust.net",
          "+.osbdf.com",
          "+.ottai.com",
          "+.ottiptv.cc",
          "+.ourschool.cc",
          "+.p01.epsonconnect.com",
          "+.packertec.com",
          "+.paperang.com",
          "+.passnat.com",
          "+.piedaochuan.top",
          "+.pixcheese.com",
          "+.pkghund.com",
          "+.plusde1.younoyes.com",
          "+.plushk1.younoyes.com",
          "+.plushk2.younoyes.com",
          "+.plushk3.younoyes.com",
          "+.plusjp1.younoyes.com",
          "+.plusus1.younoyes.com",
          "+.plusus2.younoyes.com",
          "+.plusus3.younoyes.com",
          "+.ponyemu.com",
          "+.pool.ntp.org",
          "+.powershellgallery.com",
          "+.privateapi.xyz",
          "+.ptl.gs",
          "+.ptlgs.org",
          "+.pwithe.com",
          "+.qianfan.app",
          "+.qiankunshopping.com",
          "+.qianuni.com",
          "+.qianxuecloud.com",
          "+.qianxueyunke.com",
          "+.qiaoqiaoyun.com",
          "+.qiaoxuesi.com",
          "+.qinglue.com",
          "+.qmeng.top",
          "+.quanxinfu.com",
          "+.qweatherapi.com",
          "+.qzyun.net",
          "+.rayws.top",
          "+.redenmc.com",
          "+.registry.dockermirror.com",
          "+.rewards.bing.com",
          "+.royqh.net",
          "+.rsfcxq.com",
          "+.ruijie.com",
          "+.saduck.top",
          "+.sanligu.top",
          "+.sapphiretech.com",
          "+.scbaijia.com",
          "+.scnyw.com",
          "+.scratch5.com",
          "+.sct.ftqq.com",
          "+.sdk-log-upload-os.hoyoverse.com",
          "+.seaflysoft.com",
          "+.seedpace.com",
          "+.server2.cn2gias.uk",
          "+.sgtv.ii00.cc",
          "+.shanghai-parking.com",
          "+.shineacc.com",
          "+.shuangqingtech.com",
          "+.shuinfo.com",
          "+.shunjing.xin",
          "+.shuqiandiqiu.com",
          "+.shyxhy.com",
          "+.sixloy428.top",
          "+.sksight.com",
          "+.snfox.com",
          "+.snltty.com",
          "+.soulteary.com",
          "+.sptv.ii00.cc",
          "+.ssjj2.com",
          "+.starlink.uno",
          "+.stkfanli.com",
          "+.sunrisecontent.akamaized.net",
          "+.suyur.com",
          "+.svyun.com",
          "+.sxlljm.com",
          "+.tailgdd.com",
          "+.tailscale.com",
          "+.tailscaled.com",
          "+.talk-cloud.net",
          "+.tangguobaohe.com",
          "+.tclai.top",
          "+.tcp.mk",
          "+.tcp.pub",
          "+.tcp5.com",
          "+.tcy365.net",
          "+.tdrgame.top",
          "+.terra-master.com",
          "+.theluyuan.com",
          "+.thinkerride.com",
          "+.thmnet.com",
          "+.tianlala.com",
          "+.timbrd.com",
          "+.tixue.net",
          "+.tmallyc.com",
          "+.tnas.link",
          "+.tnas.online",
          "+.tool56.com",
          "+.topwd.top",
          "+.tozi-cn.top",
          "+.ts3.ink",
          "+.tulipsport.com",
          "+.tumukaoyan.com",
          "+.tuxing.art",
          "+.twinkstar.com",
          "+.u-carloan.com",
          "+.uascent-iot.com",
          "+.ugdocker.link",
          "+.ulife.group",
          "+.us.ci",
          "+.vanjee.net",
          "+.vbkhk.com",
          "+.vbkr.com",
          "+.vbkrhk.com",
          "+.vclbroker.com",
          "+.vclbrokers.com",
          "+.vcltrade.com",
          "+.vgogbuy.com",
          "+.vv1865.com",
          "+.warmheart.top",
          "+.we-stats.com",
          "+.webs.vc",
          "+.wenyi188.com",
          "+.weshape3d.com",
          "+.wewillpro.com",
          "+.wildfirechat.net",
          "+.wjx.top",
          "+.wlcdn88.com",
          "+.wologic.net",
          "+.wpurl.cc",
          "+.wwwh.eu.org",
          "+.wwwwqq.com",
          "+.wxdw.top",
          "+.x86pi.com",
          "+.xbcloudprint.com",
          "+.xbgjw.com",
          "+.xboxfan.com",
          "+.xdqtech.com",
          "+.xdtool.com",
          "+.xesabc.com",
          "+.xfltd.org",
          "+.xgzb.top",
          "+.xiankabao.com",
          "+.xiaobeiyangji.com",
          "+.xiaochuanyun.com",
          "+.xiaolikj.online",
          "+.xiaoxia.vip",
          "+.xiberia.net",
          "+.ximogo.com",
          "+.xingaochengtai.com",
          "+.xinghaiwaimai.com",
          "+.xingyaozhilian.com",
          "+.xiqueer.com",
          "+.xiwang.com",
          "+.xixih.cc",
          "+.xkkapk.com",
          "+.xn--4kq62z5rby2qupq9ub.top",
          "+.xn--cesw6hd3s99f.com",
          "+.xn--vhqr42drhf5k7b.com",
          "+.xopenbeta.com",
          "+.xuanyuancode.com",
          "+.xuepaipai.com",
          "+.xxir.com",
          "+.xxrsm.com",
          "+.xzsckj.com",
          "+.xzzhtc.com",
          "+.ycjintou.com",
          "+.ydayc.com",
          "+.yicaiykt.com",
          "+.yiso.fun",
          "+.yixc.com",
          "+.yongyu.xyz",
          "+.yooc.me",
          "+.youzhiyouxing.com",
          "+.yunzuoye.net",
          "+.yyshub.top",
          "+.yzcsoft.com",
          "+.z-tek.com",
          "+.z6e.com",
          "+.zcloud.world",
          "+.zctnet.top",
          "+.zeekrline.com",
          "+.zhangleglobal.com",
          "+.zhi10.com",
          "+.zhituwujie.com",
          "+.zhixingyunke.com",
          "+.zhongancloud.com",
          "+.zhouyiy.com",
          "+.zhu.today",
          "+.zjxhedu.com",
          "+.zmis.me",
          "+.znnu.com",
          "+.znztv.com",
          "+.zqin758.xyz",
          "+.zsytit.com",
          "+.ztytech.com",
          "+.zuobiao.press",
          "+.zysou.com",
          "+.zzz-log-upload-os.hoyoverse.com",
          "controlplane.tailscale.com",
          "log.tailscale.com",
          "login.tailscale.com"
        ]
      },
      "Custom_Direct_Classical_IP": {
        "type": "inline",
        "behavior": "classical",
        "payload": [
          "IP-CIDR,108.174.48.100/32,no-resolve",
          "IP-CIDR,198.41.192.0/24,no-resolve",
          "IP-CIDR,198.41.200.0/24,no-resolve",
          "IP-CIDR,218.78.7.16/32,no-resolve",
          "IP-CIDR,5.5.5.5/32,no-resolve",
          "IP-CIDR,98.126.27.164/32,no-resolve",
          "SRC-PORT,41641"
        ]
      },
      "Custom_Proxy_Domain": {
        "type": "inline",
        "behavior": "domain",
        "payload": [
          "+.7pzzv.us",
          "+.arduino.cc",
          "+.clientservices.googleapis.com",
          "+.cloudsync-prod.s3.us-east-1.amazonaws.com",
          "+.dmhy.org",
          "+.googleapis.cn",
          "+.hoyolab.com",
          "+.hoyoverse.com",
          "+.ip.sb",
          "+.ipify.org",
          "+.mtalk.google.com",
          "+.onedrive.live.com",
          "+.platformio.org",
          "+.services.googleapis.cn",
          "+.stun.playstation.net",
          "+.xn--ngstr-lra8j.com"
        ]
      },
      "Custom_Proxy_Classical_IP": {
        "type": "inline",
        "behavior": "classical",
        "payload": []
      }
    }
  },
  "outputProfiles": {
    "yaml": {
      "ai-balanced": {
        "port": 7890,
        "socks-port": 7891,
        "mixed-port": 7893,
        "redir-port": 7892,
        "tproxy-port": 7895,
        "allow-lan": true,
        "bind-address": "*",
        "mode": "rule",
        "tcp-concurrent": true,
        "unified-delay": true,
        "proxy-providers": {
          "provider1": {
            "type": "http",
            "url": "url",
            "interval": 3600,
            "path": "./proxy_provider/provider1.yaml",
            "proxy": "DIRECT",
            "header": null,
            "health-check": {
              "enable": true,
              "interval": 600,
              "url": "https://cp.cloudflare.com/generate_204"
            },
            "override": {
              "skip-cert-verify": true,
              "udp": true
            },
            "exclude-filter": "(?i)(剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)"
          }
        },
        "geox-url": {
          "mmdb": "https://testingcf.jsdelivr.net/gh/alecthw/mmdb_china_ip_list@release/Country.mmdb",
          "geoip": "https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
          "geosite": "https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
          "asn": "https://testingcf.jsdelivr.net/gh/xishang0128/geoip@release/GeoLite2-ASN.mmdb"
        },
        "geo-auto-update": true,
        "geo-update-interval": 24,
        "geodata-mode": true,
        "log-level": "info",
        "ipv6": false,
        "profile": {
          "store-selected": true,
          "store-fake-ip": true
        },
        "tun": {
          "enable": true,
          "stack": "system",
          "dns-hijack": [
            "any:53",
            "tcp://any:53"
          ],
          "auto-detect-interface": false,
          "auto-route": false,
          "auto-redirect": false,
          "strict-route": false,
          "endpoint-independent-nat": true
        },
        "dns": {
          "enable": true,
          "listen": "0.0.0.0:7874",
          "ipv6": false,
          "enhanced-mode": "fake-ip",
          "fake-ip-range": "198.18.0.1/16",
          "fake-ip-filter": [
            "*.lan",
            "localhost.ptlogin2.qq.com"
          ],
          "fake-ip-filter-mode": "blacklist",
          "use-system-hosts": false,
          "respect-rules": false,
          "default-nameserver": [
            "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
            "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
          ],
          "nameserver": [
            "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
            "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
          ],
          "proxy-server-nameserver": [
            "https://8.8.8.8/dns-query#DIRECT",
            "https://8.8.4.4/dns-query#DIRECT"
          ],
          "direct-nameserver": [
            "https://127.0.0.1:5053/dns-query#DIRECT"
          ],
          "direct-nameserver-follow-policy": false,
          "nameserver-policy": {
            "geosite:private": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:cn": [
              "https://127.0.0.1:5053/dns-query#DIRECT"
            ],
            "geosite:openai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:bing": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ads-all": [
              "https://dns.adguard-dns.com/dns-query#🛡️ DNS Proxy"
            ],
            "+.anthropic.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.claude.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.perplexity.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "jules.google.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "jules.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.x.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.poe.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.openrouter.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursor.sh": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursorapi.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursorvm.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.huggingface.co": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.mirasim.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.antigravity.google": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.labs.google": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "cloudaicompanion.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "cloudcode-pa.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geminicloudassist.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "aiplatform.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "stitch.withgoogle.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.opencode.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:google-deepmind": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ai-!cn": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ai-cn": [
              "https://127.0.0.1:5053/dns-query#DIRECT"
            ]
          }
        },
        "proxy-groups": [
          {
            "name": "🚀 手動選擇",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ],
            "filter": "(?i)^(?!.*(?:🇭🇰|香港|Hong Kong|Hong-Kong|\bHKG\b|\bHK\b|剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "📌 固定節點",
            "type": "select",
            "proxies": [
              "⛔ 拒絕",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點"
            ]
          },
          {
            "name": "🛡️ DNS Proxy",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "REJECT"
            ],
            "default-selected": "📌 固定節點"
          },
          {
            "name": "💳 穩定會話",
            "type": "select",
            "proxies": [
              "DIRECT",
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🔐 高風險帳戶",
            "type": "select",
            "proxies": [
              "REJECT",
              "💳 穩定會話"
            ],
            "default-selected": "REJECT"
          },
          {
            "name": "🤖 ChatGPT",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🧑‍💻 Copilot",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🔐 Claude Account Guard",
            "type": "select",
            "proxies": [
              "⛔ 拒絕",
              "🇺🇸 US Stable",
              "🇸🇬 SG Stable",
              "🇯🇵 JP Stable"
            ]
          },
          {
            "name": "🤖 Google AI",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Google AI Tools",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Perplexity",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Grok",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Poe",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 OpenRouter",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Cursor",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤗 Hugging Face",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Mirasim",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🎵 Flow Music",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 OpenCode",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 AI Other",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 AI CN Other",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🚀 手動選擇",
              "🎯 全球直連",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "⛔ 拒絕",
            "type": "select",
            "proxies": [
              "REJECT"
            ]
          },
          {
            "name": "🐟 漏網之魚",
            "type": "select",
            "proxies": [
              "🎯 全球直連",
              "🚀 手動選擇",
              "📌 固定節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🇺🇸 US Stable",
            "type": "select",
            "filter": "(?i)(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇯🇵 JP Stable",
            "type": "select",
            "filter": "(?i)(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇸🇬 SG Stable",
            "type": "select",
            "filter": "(?i)(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇹🇼 台灣節點",
            "type": "select",
            "filter": "(?i)(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇰🇷 韓國節點",
            "type": "select",
            "filter": "(?i)(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🌐 其他／未識別節點",
            "type": "select",
            "filter": "(?i)^(?!.*(?:🇭🇰|香港|Hong Kong|Hong-Kong|\\bHKG\\b|\\bHK\\b|剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$",
            "exclude-filter": "(?i)(?:(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)|(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)|(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)|(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)|(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN))",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎯 全球直連",
            "type": "select",
            "proxies": [
              "DIRECT"
            ]
          }
        ],
        "rules": [
          "RULE-SET,Privacy_Guard_Classical,⛔ 拒絕",
          "GEOSITE,private,🎯 全球直連",
          "GEOIP,private,🎯 全球直連,no-resolve",
          "GEOSITE,openai,🤖 ChatGPT",
          "RULE-SET,AI_Copilot_Classical,🧑‍💻 Copilot",
          "GEOSITE,github-copilot,🧑‍💻 Copilot",
          "RULE-SET,AI_Claude_Classical,🔐 Claude Account Guard",
          "GEOSITE,anthropic,🔐 Claude Account Guard",
          "GEOSITE,category-ntp,🔐 Claude Account Guard",
          "RULE-SET,AI_Gemini_Classical,🤖 Google AI",
          "RULE-SET,AI_NotebookLM_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_Jules_Classical,🤖 Google AI Tools",
          "GEOSITE,perplexity,🤖 Perplexity",
          "GEOSITE,xai,🤖 Grok",
          "GEOSITE,poe,🤖 Poe",
          "RULE-SET,AI_OpenRouter_Classical,🤖 OpenRouter",
          "RULE-SET,AI_Cursor_Classical,🤖 Cursor",
          "RULE-SET,AI_HuggingFace_Classical,🤗 Hugging Face",
          "RULE-SET,AI_Mirasim_Classical,🤖 Mirasim",
          "RULE-SET,AI_Antigravity_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_GoogleLabs_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_Stitch_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_AndroidStudioAI_Classical,🤖 Google AI",
          "RULE-SET,AI_GeminiCloud_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_VertexAI_Classical,🤖 Google AI",
          "RULE-SET,Flow_Music_Classical,🎵 Flow Music",
          "RULE-SET,AI_OpenCode_Classical,🤖 OpenCode",
          "GEOSITE,google-deepmind,🤖 AI Other",
          "GEOSITE,category-ai-!cn,🤖 AI Other",
          "GEOSITE,category-ai-cn,🤖 AI CN Other",
          "RULE-SET,SSH_Direct_Classical,🎯 全球直連",
          "RULE-SET,SSH_Proxy_Classical,🚀 手動選擇",
          "RULE-SET,Gaming_Direct_Classical,🎯 全球直連",
          "RULE-SET,HuggingFace_Download_Direct_Classical,🎯 全球直連",
          "RULE-SET,Cursor_Download_Direct_Classical,🎯 全球直連",
          "RULE-SET,Finance_Stripe_Classical,🔐 高風險帳戶",
          "RULE-SET,Finance_PayPal_Classical,🔐 高風險帳戶",
          "RULE-SET,Finance_Wise_Classical,🔐 高風險帳戶",
          "RULE-SET,Finance_Revolut_Classical,🔐 高風險帳戶",
          "RULE-SET,Finance_IBKR_Classical,🔐 高風險帳戶",
          "RULE-SET,Finance_Alpaca_Classical,🔐 高風險帳戶",
          "RULE-SET,Custom_Direct_Domain,🎯 全球直連",
          "RULE-SET,Custom_Direct_Classical_IP,🎯 全球直連",
          "RULE-SET,Custom_Proxy_Domain,🚀 手動選擇",
          "RULE-SET,Custom_Proxy_Classical_IP,🚀 手動選擇",
          "GEOIP,HK,🎯 全球直連,no-resolve",
          "GEOIP,CN,🎯 全球直連,no-resolve",
          "SRC-IP-CIDR,10.0.0.11/32,🎯 全球直連",
          "MATCH,🐟 漏網之魚"
        ],
        "rule-providers": {
          "Privacy_Guard_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "IP-CIDR6,::/0,no-resolve",
              "DST-PORT,53",
              "DST-PORT,853",
              "DST-PORT,3478",
              "DST-PORT,5349",
              "DST-PORT,19302-19309",
              "DOMAIN-KEYWORD,stun"
            ]
          },
          "AI_Copilot_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,copilot.com",
              "DOMAIN-SUFFIX,copilot.microsoft.com",
              "DOMAIN-SUFFIX,copilot.cloud.microsoft"
            ]
          },
          "AI_Claude_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,anthropic.com",
              "DOMAIN-SUFFIX,claude.ai",
              "DOMAIN-SUFFIX,claude.com",
              "DOMAIN-SUFFIX,clau.de",
              "DOMAIN-SUFFIX,claudemcpclient.com",
              "DOMAIN-SUFFIX,claudemcpcontent.com",
              "DOMAIN-SUFFIX,claudeusercontent.com",
              "DOMAIN-SUFFIX,sentry.io",
              "DOMAIN-SUFFIX,statsigapi.net",
              "DOMAIN-SUFFIX,intercom.io",
              "DOMAIN-SUFFIX,intercomcdn.com",
              "DOMAIN,servd-anthropic-website.b-cdn.net",
              "DOMAIN,anthropic.com.cdn.cloudflare.net",
              "DOMAIN,anthropic.auth0.com",
              "DOMAIN,anthropic-com.ghost.io",
              "DOMAIN,browser-intake-us5-datadoghq.com",
              "DOMAIN,cdn.usefathom.com",
              "DOMAIN-KEYWORD,datadog",
              "DOMAIN-KEYWORD,sentry",
              "DOMAIN-KEYWORD,sift",
              "IP-CIDR,160.79.104.0/21",
              "IP-CIDR6,2607:6bc0::/32"
            ]
          },
          "AI_Gemini_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,gemini.google",
              "DOMAIN-SUFFIX,ai.google.dev",
              "DOMAIN-SUFFIX,ai.studio",
              "DOMAIN-SUFFIX,aistudio.google.com",
              "DOMAIN-SUFFIX,gemini.gstatic.com",
              "DOMAIN-SUFFIX,generativeai.google",
              "DOMAIN-SUFFIX,makersuite.google.com",
              "DOMAIN,gemini.google.com",
              "DOMAIN,generativelanguage.googleapis.com",
              "DOMAIN,geller-pa.googleapis.com",
              "DOMAIN,proactivebackend-pa.googleapis.com",
              "DOMAIN,robinfrontend-pa.googleapis.com"
            ]
          },
          "AI_NotebookLM_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,notebook.google",
              "DOMAIN-SUFFIX,notebook.google.com",
              "DOMAIN-SUFFIX,notebooklm.google",
              "DOMAIN-SUFFIX,notebooklm.google.com",
              "DOMAIN-SUFFIX,notebooklm.cloud.google.com",
              "DOMAIN,notebooklm-pa.googleapis.com",
              "DOMAIN,notebooklm.googleapis.com"
            ]
          },
          "AI_Jules_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,jules.google.com",
              "DOMAIN,jules.googleapis.com"
            ]
          },
          "AI_OpenRouter_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,openrouter.ai"
            ]
          },
          "AI_Cursor_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,cursor.sh",
              "DOMAIN-SUFFIX,cursorapi.com",
              "DOMAIN-SUFFIX,cursorvm.com"
            ]
          },
          "AI_HuggingFace_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,huggingface.co"
            ]
          },
          "AI_Mirasim_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,mirasim.ai"
            ]
          },
          "AI_Antigravity_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,antigravity.google",
              "DOMAIN-SUFFIX,antigravity-unleash.goog",
              "DOMAIN-SUFFIX,daily-cloudcode-pa.googleapis.com",
              "DOMAIN-SUFFIX,cloudcode-pa.googleapis.com"
            ]
          },
          "AI_GoogleLabs_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,labs.google"
            ]
          },
          "AI_Stitch_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,stitch.withgoogle.com"
            ]
          },
          "AI_AndroidStudioAI_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,cloudaicompanion.googleapis.com",
              "DOMAIN,cloudcode-pa.googleapis.com"
            ]
          },
          "AI_GeminiCloud_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,geminicloudassist.googleapis.com"
            ]
          },
          "AI_VertexAI_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,aiplatform.googleapis.com",
              "DOMAIN-KEYWORD,-aiplatform.googleapis.com"
            ]
          },
          "Flow_Music_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,storage.googleapis.com"
            ]
          },
          "AI_OpenCode_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,opencode.ai"
            ]
          },
          "SSH_Direct_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": []
          },
          "SSH_Proxy_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": []
          },
          "Gaming_Direct_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,steamcontent.com",
              "DOMAIN-SUFFIX,steampipe.akamaized.net",
              "DOMAIN-SUFFIX,steamserver.net",
              "DOMAIN-SUFFIX,battle.net",
              "DOMAIN-SUFFIX,blizzard.com",
              "DOMAIN-SUFFIX,blzstatic.cn",
              "DOMAIN-SUFFIX,origin.com",
              "DOMAIN-SUFFIX,warframe.com",
              "DOMAIN-SUFFIX,square-enix.com",
              "DOMAIN-SUFFIX,finalfantasyxiv.com",
              "DOMAIN-SUFFIX,ffxiv.com",
              "DOMAIN-SUFFIX,nintendo.net",
              "DOMAIN-SUFFIX,srv.nintendo.net",
              "DOMAIN-SUFFIX,cdn.nintendo.net",
              "DOMAIN-SUFFIX,stun.playstation.net",
              "DOMAIN-SUFFIX,xboxlive.com",
              "DOMAIN-SUFFIX,uu.163.com",
              "DOMAIN-SUFFIX,n0808.com",
              "DOMAIN-SUFFIX,sandai.net",
              "DOMAIN-SUFFIX,epicgames.com",
              "DOMAIN-SUFFIX,epicgamescdn.com"
            ]
          },
          "HuggingFace_Download_Direct_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,hf.co"
            ]
          },
          "Cursor_Download_Direct_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,cursor-cdn.com"
            ]
          },
          "Finance_Stripe_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,stripe.com",
              "DOMAIN-SUFFIX,stripecdn.com",
              "DOMAIN,m.stripe.network"
            ]
          },
          "Finance_PayPal_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,paypal.com",
              "DOMAIN-SUFFIX,paypalobjects.com"
            ]
          },
          "Finance_Wise_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,wise.com",
              "DOMAIN-SUFFIX,wise-sandbox.com",
              "DOMAIN,api-mtls.transferwise.com"
            ]
          },
          "Finance_Revolut_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,revolut.com"
            ]
          },
          "Finance_IBKR_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,api.ibkr.com",
              "DOMAIN-SUFFIX,interactivebrokers.com"
            ]
          },
          "Finance_Alpaca_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,api.alpaca.markets",
              "DOMAIN,paper-api.alpaca.markets",
              "DOMAIN,data.alpaca.markets",
              "DOMAIN,stream.data.alpaca.markets",
              "DOMAIN,broker-api.alpaca.markets",
              "DOMAIN,authx.alpaca.markets",
              "DOMAIN,data.sandbox.alpaca.markets",
              "DOMAIN,stream.data.sandbox.alpaca.markets",
              "DOMAIN,broker-api.sandbox.alpaca.markets"
            ]
          },
          "Custom_Direct_Domain": {
            "type": "inline",
            "behavior": "domain",
            "payload": [
              "*m-team*",
              "*quickconnect*",
              "*synology*",
              "+.00333118.com",
              "+.0044696.com",
              "+.03241119.xyz",
              "+.0734cn.top",
              "+.112114.xyz",
              "+.115cdn.de",
              "+.17van.com",
              "+.1996999.xyz",
              "+.204cloud.com",
              "+.2mcnxs.cc",
              "+.365ting.com",
              "+.3d-apollo.com",
              "+.3dwhere.com",
              "+.3gxk.net",
              "+.419g.com",
              "+.4399zmxy.com",
              "+.4xiaoshuo.org",
              "+.51tbox.com",
              "+.51wanxue.com",
              "+.51zmt.top",
              "+.52jiawei.com",
              "+.52met.com",
              "+.52muban.com",
              "+.55555.ink",
              "+.657192.com",
              "+.66990000.xyz",
              "+.6v520.net",
              "+.737698.xyz",
              "+.77shuku.org",
              "+.7sef.com",
              "+.85sc.com",
              "+.86656.net",
              "+.8kc.top",
              "+.900cha.com",
              "+.91shenfan.com",
              "+.97973399.com",
              "+.985hezi.com",
              "+.998tool.com",
              "+.a0d.top",
              "+.aaawz.cc",
              "+.acggit.com",
              "+.adobe.com",
              "+.afeica.com",
              "+.afuns.me",
              "+.aibeike.com",
              "+.aichangbaishan.com",
              "+.aidien.fun",
              "+.aidream.website",
              "+.aigodlike.com",
              "+.aisnogames.com",
              "+.aistudio-app.com",
              "+.akamaihd.net",
              "+.akamaized.net",
              "+.alonginwind.eu.org",
              "+.alonginwind.to",
              "+.aloys233.top",
              "+.antping.com",
              "+.anycubic.com",
              "+.anyrouter.top",
              "+.anytocopy.com",
              "+.api.myip.com",
              "+.apm-log-upload-os.hoyoverse.com",
              "+.aqtwwx.net",
              "+.argotunnel.com",
              "+.armvm.com",
              "+.asgardion.space",
              "+.atticus.vip",
              "+.awstme.top",
              "+.axuex.top",
              "+.babawar.com",
              "+.baiyishequ.com",
              "+.banban.work",
              "+.bangumi.tv",
              "+.batchat.com",
              "+.bdcb.cc",
              "+.beautifulcarrot.com",
              "+.belimked.com",
              "+.betahub.tech",
              "+.bgm.tv",
              "+.biandangroup.com",
              "+.biaoda.me",
              "+.bingshandashu.com",
              "+.bjtzeduyun.com",
              "+.bochaai.com",
              "+.bochk.com",
              "+.boxim.online",
              "+.boyuemobile.com",
              "+.bsbsb.top",
              "+.bunny.net",
              "+.canghaiip.com",
              "+.cangjie-lang.net",
              "+.cc.cd",
              "+.cdn.ist",
              "+.centbrowser.net",
              "+.cftunnel.com",
              "+.cg3da.com",
              "+.cgicop.com",
              "+.chaxunjiao.com",
              "+.chaz.fun",
              "+.checkip.dyndns.org",
              "+.checkipv6.dyndns.org",
              "+.chenyuxia.com",
              "+.cheriexsky.love",
              "+.cheshire.top",
              "+.chessease.net",
              "+.chii.in",
              "+.chinatle.com",
              "+.chujingapp.com",
              "+.chushi.cool",
              "+.clivia.fun",
              "+.cmbc.run",
              "+.cmhk.com",
              "+.cn-music.mefun.vip",
              "+.cnb.space",
              "+.cocav.com",
              "+.codeloop.top",
              "+.coffee-iot.com",
              "+.congmiqq.com",
              "+.coros.com",
              "+.crtyhr.com",
              "+.cyouzai.com",
              "+.d4ctech.com",
              "+.dadateach.com",
              "+.dahai96.com",
              "+.daocloud.vip",
              "+.day.app",
              "+.dayilive.com",
              "+.dcgstd.com",
              "+.ddsrem.com",
              "+.ddzn.tech",
              "+.dell.com",
              "+.dfhog.com",
              "+.dhub.kubesre.xyz",
              "+.dingdingzn.com",
              "+.diyiedu.com",
              "+.dnshe.com",
              "+.docker.1panel.live",
              "+.docker.kejilion.pro",
              "+.docker.unsee.tech",
              "+.dockerpull.org",
              "+.dockerpull.pw",
              "+.dothantech.com",
              "+.douqq.com",
              "+.drvceo.com",
              "+.dskj-ops.com",
              "+.dushe1.app",
              "+.eagsen.com",
              "+.easytier.top",
              "+.easytomessage.com",
              "+.einfo-tech.com",
              "+.emby.yun",
              "+.englibrary.com",
              "+.enyugame.net",
              "+.epark.cc",
              "+.epg.aptv.app",
              "+.epg.v1.mk",
              "+.et0731.com",
              "+.everdrawing.com",
              "+.excelbbx.net",
              "+.fdfinvoice.com",
              "+.feihengip.com",
              "+.feizhiyi.com",
              "+.fengsutb.com",
              "+.ffhome.com",
              "+.fjpit.com",
              "+.flingtrainer.com",
              "+.fofuai.com",
              "+.fowep.com",
              "+.freetv.top",
              "+.frp-ski.com",
              "+.fssbcc.top",
              "+.fsytss.com",
              "+.ft07.com",
              "+.functorz.com",
              "+.fuyinkeji.top",
              "+.fuziche.com",
              "+.fzshouji.com",
              "+.fzvcolco.com",
              "+.fzwqq.com",
              "+.gaishitongshu.com",
              "+.game.maj-soul.com",
              "+.gamepp.com",
              "+.gangtise.com",
              "+.gaojiua.com",
              "+.gaze.run",
              "+.gdcucc.v1.mk",
              "+.geektool.top",
              "+.gegeselect.hk",
              "+.ggbond.org",
              "+.gh-proxy.com",
              "+.gh.con.sh",
              "+.gh.ddlc.top",
              "+.gh.llkk.cc",
              "+.ghfast.top",
              "+.ghoxz.com",
              "+.ghp.ci",
              "+.ghproxy.cc",
              "+.ghproxy.cfd",
              "+.ghps.cc",
              "+.giomeru.com",
              "+.girigirilove.com",
              "+.git.886.be",
              "+.github.abskoop.workers.dev",
              "+.github.boki.moe",
              "+.github.moeyy.xyz",
              "+.github.site",
              "+.github.store",
              "+.giveup.top",
              "+.gjtool.com",
              "+.gmoj.net",
              "+.gmya.net",
              "+.goalmapapp.com",
              "+.goka.top",
              "+.googoc.com",
              "+.gootho.com",
              "+.gpetrip.com",
              "+.gpgwx.com",
              "+.gseen.com",
              "+.gsgltz.com",
              "+.gsjkjt.com",
              "+.gsnhcg.com",
              "+.gsstic.com",
              "+.guaitao.cc",
              "+.gvgoo.com",
              "+.gwmapp-w.com",
              "+.gxnnjidingkeji.top",
              "+.gzybao.com",
              "+.halvie.com",
              "+.ham.xin",
              "+.hangnakeji.com",
              "+.haoxueche.com",
              "+.harbourmooc.com",
              "+.hbcof.com",
              "+.hbctic.com",
              "+.hdbz.net",
              "+.hexiny.com",
              "+.hezuvip.com",
              "+.hf-mirror.com",
              "+.hhtvc.com",
              "+.hijin.vip",
              "+.hiwms.com",
              "+.hkchat.app",
              "+.hnxzctec.com",
              "+.hongxingdl.com",
              "+.hongxingdl.love",
              "+.hsbc.com.hk",
              "+.hstbroker.com",
              "+.hszq6.com",
              "+.htkgsx.com",
              "+.hub.crdz.gq",
              "+.hub.gitmirror.com",
              "+.hub.rat.dev",
              "+.hub.xdark.top",
              "+.huikao8.com",
              "+.hutaoyun.top",
              "+.hwbim.com",
              "+.hwjianmo.com",
              "+.hwzuku.com",
              "+.hybiome.com",
              "+.hzlawyer.net",
              "+.hzqsn.com",
              "+.icvcs.com",
              "+.idsduf.com",
              "+.ifconfig.co",
              "+.ifengmap.com",
              "+.ifish7.com",
              "+.igpsport.com",
              "+.ijingyi.com",
              "+.ilucky.net",
              "+.imacos.top",
              "+.immortalwrt.org",
              "+.iosgujian.com",
              "+.iot889.com",
              "+.iotrix.net",
              "+.ip159.com",
              "+.ip6.seeip.org",
              "+.ipapi.co",
              "+.ipshu.com",
              "+.istoreos.com",
              "+.itptg.com",
              "+.jduoduo.com",
              "+.jfjt.cc",
              "+.jh96095.com",
              "+.jiaoyanyun.com",
              "+.jieyoutsg.com",
              "+.jiliuwang.net",
              "+.jingheiot.com",
              "+.jiqw.com",
              "+.jjzyy.org",
              "+.jsdelivr.com",
              "+.jsdelivr.net",
              "+.julebu.co",
              "+.jxjktzjt.com",
              "+.jxpp.com",
              "+.jzagile.com",
              "+.kaihong.com",
              "+.kaijiejinrong.com",
              "+.kaipanhong.com",
              "+.kancaibao.com",
              "+.kaspersky-labs.com",
              "+.kaspersky.com",
              "+.kcbd.top",
              "+.kejiweixun.com",
              "+.keyoo.com",
              "+.kgithub.com",
              "+.kit327.com",
              "+.kmeila.com",
              "+.kuaicha888.com",
              "+.lanyun.net",
              "+.laogongju.com",
              "+.latexlive.com",
              "+.leelen.com",
              "+.letaoedu.com",
              "+.lg3000.top",
              "+.liunn.com",
              "+.liveperson.net",
              "+.longmenshuju.com",
              "+.lsbj365.com",
              "+.lucky.gd",
              "+.lyihub.com",
              "+.lyilife.com",
              "+.m-team.cc",
              "+.m-team.io",
              "+.machtalk.net",
              "+.manfuz.co",
              "+.mblyun.com",
              "+.mc-user.com",
              "+.mchuiji.com",
              "+.mcxyzt.cc",
              "+.medtechshare.com",
              "+.meishiffx.online",
              "+.meiyitou.top",
              "+.melecode.com",
              "+.members.3322.org",
              "+.meoof-pet.com",
              "+.micu.hk",
              "+.mifeng.plus",
              "+.mifon.com",
              "+.minor-api-os.hoyoverse.com",
              "+.misea.top",
              "+.mixly.org",
              "+.mobai.sbs",
              "+.modelscope.net",
              "+.morefuntengyun.com",
              "+.msftconnecttest.com",
              "+.msftncsi.com",
              "+.mslmc.net",
              "+.mtaokj.com",
              "+.mykuaidi.com",
              "+.myshopex.com",
              "+.naixi.com",
              "+.nanhuabx.com",
              "+.nanshe-tech.com",
              "+.natchecker.com",
              "+.neihang.net",
              "+.netzz.net",
              "+.nhk.or.jp",
              "+.nicezhuanye.com",
              "+.nkxingxh.top",
              "+.nn.ci",
              "+.nodcloud.com",
              "+.nxog.top",
              "+.oceando.cloud",
              "+.ok321.top",
              "+.onebuygz.com",
              "+.onetools.top",
              "+.openkylin.top",
              "+.opentrust.net",
              "+.osbdf.com",
              "+.ottai.com",
              "+.ottiptv.cc",
              "+.ourschool.cc",
              "+.p01.epsonconnect.com",
              "+.packertec.com",
              "+.paperang.com",
              "+.passnat.com",
              "+.piedaochuan.top",
              "+.pixcheese.com",
              "+.pkghund.com",
              "+.plusde1.younoyes.com",
              "+.plushk1.younoyes.com",
              "+.plushk2.younoyes.com",
              "+.plushk3.younoyes.com",
              "+.plusjp1.younoyes.com",
              "+.plusus1.younoyes.com",
              "+.plusus2.younoyes.com",
              "+.plusus3.younoyes.com",
              "+.ponyemu.com",
              "+.pool.ntp.org",
              "+.powershellgallery.com",
              "+.privateapi.xyz",
              "+.ptl.gs",
              "+.ptlgs.org",
              "+.pwithe.com",
              "+.qianfan.app",
              "+.qiankunshopping.com",
              "+.qianuni.com",
              "+.qianxuecloud.com",
              "+.qianxueyunke.com",
              "+.qiaoqiaoyun.com",
              "+.qiaoxuesi.com",
              "+.qinglue.com",
              "+.qmeng.top",
              "+.quanxinfu.com",
              "+.qweatherapi.com",
              "+.qzyun.net",
              "+.rayws.top",
              "+.redenmc.com",
              "+.registry.dockermirror.com",
              "+.rewards.bing.com",
              "+.royqh.net",
              "+.rsfcxq.com",
              "+.ruijie.com",
              "+.saduck.top",
              "+.sanligu.top",
              "+.sapphiretech.com",
              "+.scbaijia.com",
              "+.scnyw.com",
              "+.scratch5.com",
              "+.sct.ftqq.com",
              "+.sdk-log-upload-os.hoyoverse.com",
              "+.seaflysoft.com",
              "+.seedpace.com",
              "+.server2.cn2gias.uk",
              "+.sgtv.ii00.cc",
              "+.shanghai-parking.com",
              "+.shineacc.com",
              "+.shuangqingtech.com",
              "+.shuinfo.com",
              "+.shunjing.xin",
              "+.shuqiandiqiu.com",
              "+.shyxhy.com",
              "+.sixloy428.top",
              "+.sksight.com",
              "+.snfox.com",
              "+.snltty.com",
              "+.soulteary.com",
              "+.sptv.ii00.cc",
              "+.ssjj2.com",
              "+.starlink.uno",
              "+.stkfanli.com",
              "+.sunrisecontent.akamaized.net",
              "+.suyur.com",
              "+.svyun.com",
              "+.sxlljm.com",
              "+.tailgdd.com",
              "+.tailscale.com",
              "+.tailscaled.com",
              "+.talk-cloud.net",
              "+.tangguobaohe.com",
              "+.tclai.top",
              "+.tcp.mk",
              "+.tcp.pub",
              "+.tcp5.com",
              "+.tcy365.net",
              "+.tdrgame.top",
              "+.terra-master.com",
              "+.theluyuan.com",
              "+.thinkerride.com",
              "+.thmnet.com",
              "+.tianlala.com",
              "+.timbrd.com",
              "+.tixue.net",
              "+.tmallyc.com",
              "+.tnas.link",
              "+.tnas.online",
              "+.tool56.com",
              "+.topwd.top",
              "+.tozi-cn.top",
              "+.ts3.ink",
              "+.tulipsport.com",
              "+.tumukaoyan.com",
              "+.tuxing.art",
              "+.twinkstar.com",
              "+.u-carloan.com",
              "+.uascent-iot.com",
              "+.ugdocker.link",
              "+.ulife.group",
              "+.us.ci",
              "+.vanjee.net",
              "+.vbkhk.com",
              "+.vbkr.com",
              "+.vbkrhk.com",
              "+.vclbroker.com",
              "+.vclbrokers.com",
              "+.vcltrade.com",
              "+.vgogbuy.com",
              "+.vv1865.com",
              "+.warmheart.top",
              "+.we-stats.com",
              "+.webs.vc",
              "+.wenyi188.com",
              "+.weshape3d.com",
              "+.wewillpro.com",
              "+.wildfirechat.net",
              "+.wjx.top",
              "+.wlcdn88.com",
              "+.wologic.net",
              "+.wpurl.cc",
              "+.wwwh.eu.org",
              "+.wwwwqq.com",
              "+.wxdw.top",
              "+.x86pi.com",
              "+.xbcloudprint.com",
              "+.xbgjw.com",
              "+.xboxfan.com",
              "+.xdqtech.com",
              "+.xdtool.com",
              "+.xesabc.com",
              "+.xfltd.org",
              "+.xgzb.top",
              "+.xiankabao.com",
              "+.xiaobeiyangji.com",
              "+.xiaochuanyun.com",
              "+.xiaolikj.online",
              "+.xiaoxia.vip",
              "+.xiberia.net",
              "+.ximogo.com",
              "+.xingaochengtai.com",
              "+.xinghaiwaimai.com",
              "+.xingyaozhilian.com",
              "+.xiqueer.com",
              "+.xiwang.com",
              "+.xixih.cc",
              "+.xkkapk.com",
              "+.xn--4kq62z5rby2qupq9ub.top",
              "+.xn--cesw6hd3s99f.com",
              "+.xn--vhqr42drhf5k7b.com",
              "+.xopenbeta.com",
              "+.xuanyuancode.com",
              "+.xuepaipai.com",
              "+.xxir.com",
              "+.xxrsm.com",
              "+.xzsckj.com",
              "+.xzzhtc.com",
              "+.ycjintou.com",
              "+.ydayc.com",
              "+.yicaiykt.com",
              "+.yiso.fun",
              "+.yixc.com",
              "+.yongyu.xyz",
              "+.yooc.me",
              "+.youzhiyouxing.com",
              "+.yunzuoye.net",
              "+.yyshub.top",
              "+.yzcsoft.com",
              "+.z-tek.com",
              "+.z6e.com",
              "+.zcloud.world",
              "+.zctnet.top",
              "+.zeekrline.com",
              "+.zhangleglobal.com",
              "+.zhi10.com",
              "+.zhituwujie.com",
              "+.zhixingyunke.com",
              "+.zhongancloud.com",
              "+.zhouyiy.com",
              "+.zhu.today",
              "+.zjxhedu.com",
              "+.zmis.me",
              "+.znnu.com",
              "+.znztv.com",
              "+.zqin758.xyz",
              "+.zsytit.com",
              "+.ztytech.com",
              "+.zuobiao.press",
              "+.zysou.com",
              "+.zzz-log-upload-os.hoyoverse.com",
              "controlplane.tailscale.com",
              "log.tailscale.com",
              "login.tailscale.com"
            ]
          },
          "Custom_Direct_Classical_IP": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "IP-CIDR,108.174.48.100/32,no-resolve",
              "IP-CIDR,198.41.192.0/24,no-resolve",
              "IP-CIDR,198.41.200.0/24,no-resolve",
              "IP-CIDR,218.78.7.16/32,no-resolve",
              "IP-CIDR,5.5.5.5/32,no-resolve",
              "IP-CIDR,98.126.27.164/32,no-resolve",
              "SRC-PORT,41641"
            ]
          },
          "Custom_Proxy_Domain": {
            "type": "inline",
            "behavior": "domain",
            "payload": [
              "+.7pzzv.us",
              "+.arduino.cc",
              "+.clientservices.googleapis.com",
              "+.cloudsync-prod.s3.us-east-1.amazonaws.com",
              "+.dmhy.org",
              "+.googleapis.cn",
              "+.hoyolab.com",
              "+.hoyoverse.com",
              "+.ip.sb",
              "+.ipify.org",
              "+.mtalk.google.com",
              "+.onedrive.live.com",
              "+.platformio.org",
              "+.services.googleapis.cn",
              "+.stun.playstation.net",
              "+.xn--ngstr-lra8j.com"
            ]
          },
          "Custom_Proxy_Classical_IP": {
            "type": "inline",
            "behavior": "classical",
            "payload": []
          }
        }
      },
      "ai-strict": {
        "port": 7890,
        "socks-port": 7891,
        "mixed-port": 7893,
        "redir-port": 7892,
        "tproxy-port": 7895,
        "allow-lan": true,
        "bind-address": "*",
        "mode": "rule",
        "tcp-concurrent": true,
        "unified-delay": true,
        "proxy-providers": {
          "provider1": {
            "type": "http",
            "url": "url",
            "interval": 3600,
            "path": "./proxy_provider/provider1.yaml",
            "proxy": "DIRECT",
            "header": null,
            "health-check": {
              "enable": true,
              "interval": 600,
              "url": "https://cp.cloudflare.com/generate_204"
            },
            "override": {
              "skip-cert-verify": true,
              "udp": true
            },
            "exclude-filter": "(?i)(剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)"
          }
        },
        "geox-url": {
          "mmdb": "https://testingcf.jsdelivr.net/gh/alecthw/mmdb_china_ip_list@release/Country.mmdb",
          "geoip": "https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
          "geosite": "https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
          "asn": "https://testingcf.jsdelivr.net/gh/xishang0128/geoip@release/GeoLite2-ASN.mmdb"
        },
        "geo-auto-update": true,
        "geo-update-interval": 24,
        "geodata-mode": true,
        "log-level": "info",
        "ipv6": false,
        "profile": {
          "store-selected": true,
          "store-fake-ip": true
        },
        "tun": {
          "enable": true,
          "stack": "system",
          "dns-hijack": [
            "any:53",
            "tcp://any:53"
          ],
          "auto-detect-interface": false,
          "auto-route": false,
          "auto-redirect": false,
          "strict-route": false,
          "endpoint-independent-nat": true
        },
        "dns": {
          "enable": true,
          "listen": "0.0.0.0:7874",
          "ipv6": false,
          "enhanced-mode": "fake-ip",
          "fake-ip-range": "198.18.0.1/16",
          "fake-ip-filter": [
            "*.lan",
            "localhost.ptlogin2.qq.com"
          ],
          "fake-ip-filter-mode": "blacklist",
          "use-system-hosts": false,
          "respect-rules": false,
          "default-nameserver": [
            "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
            "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
          ],
          "nameserver": [
            "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
            "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
          ],
          "proxy-server-nameserver": [
            "https://8.8.8.8/dns-query#DIRECT",
            "https://8.8.4.4/dns-query#DIRECT"
          ],
          "direct-nameserver": [
            "https://127.0.0.1:5053/dns-query#DIRECT"
          ],
          "direct-nameserver-follow-policy": false,
          "nameserver-policy": {
            "geosite:private": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:cn": [
              "https://127.0.0.1:5053/dns-query#DIRECT"
            ],
            "geosite:openai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:bing": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ads-all": [
              "https://dns.adguard-dns.com/dns-query#🛡️ DNS Proxy"
            ],
            "+.anthropic.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.claude.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.perplexity.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "jules.google.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "jules.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.x.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.poe.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.openrouter.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursor.sh": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursorapi.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursorvm.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.huggingface.co": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.mirasim.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.antigravity.google": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.labs.google": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "cloudaicompanion.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "cloudcode-pa.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geminicloudassist.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "aiplatform.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "stitch.withgoogle.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.opencode.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:google-deepmind": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ai-!cn": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ai-cn": [
              "https://127.0.0.1:5053/dns-query#DIRECT"
            ]
          }
        },
        "proxy-groups": [
          {
            "name": "🚀 手動選擇",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ],
            "filter": "(?i)^(?!.*(?:🇭🇰|香港|Hong Kong|Hong-Kong|\bHKG\b|\bHK\b|剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "📌 固定節點",
            "type": "select",
            "proxies": [
              "⛔ 拒絕",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點"
            ]
          },
          {
            "name": "🛡️ DNS Proxy",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "REJECT"
            ],
            "default-selected": "📌 固定節點"
          },
          {
            "name": "🤖 ChatGPT",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🧑‍💻 Copilot",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🔐 Claude Account Guard",
            "type": "select",
            "proxies": [
              "⛔ 拒絕",
              "🇺🇸 US Stable",
              "🇸🇬 SG Stable",
              "🇯🇵 JP Stable"
            ]
          },
          {
            "name": "🤖 Google AI",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Google AI Tools",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Perplexity",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Grok",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Poe",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 OpenRouter",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Cursor",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤗 Hugging Face",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 Mirasim",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🎵 Flow Music",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 OpenCode",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 AI Other",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🤖 AI CN Other",
            "type": "select",
            "proxies": [
              "📌 固定節點",
              "🇺🇸 US Stable",
              "🇯🇵 JP Stable",
              "🇸🇬 SG Stable",
              "🇹🇼 台灣節點",
              "🇰🇷 韓國節點",
              "🌐 其他／未識別節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "⛔ 拒絕",
            "type": "select",
            "proxies": [
              "REJECT"
            ]
          },
          {
            "name": "🐟 漏網之魚",
            "type": "select",
            "proxies": [
              "🚀 手動選擇",
              "📌 固定節點",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🇺🇸 US Stable",
            "type": "select",
            "filter": "(?i)(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇯🇵 JP Stable",
            "type": "select",
            "filter": "(?i)(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇸🇬 SG Stable",
            "type": "select",
            "filter": "(?i)(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇹🇼 台灣節點",
            "type": "select",
            "filter": "(?i)(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇰🇷 韓國節點",
            "type": "select",
            "filter": "(?i)(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN)",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🌐 其他／未識別節點",
            "type": "select",
            "filter": "(?i)^(?!.*(?:🇭🇰|香港|Hong Kong|Hong-Kong|\\bHKG\\b|\\bHK\\b|剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$",
            "exclude-filter": "(?i)(?:(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)|(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)|(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)|(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)|(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN))",
            "proxies": [
              "REJECT"
            ],
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎯 全球直連",
            "type": "select",
            "proxies": [
              "DIRECT"
            ]
          }
        ],
        "rules": [
          "RULE-SET,Privacy_Guard_Classical,⛔ 拒絕",
          "GEOSITE,private,🎯 全球直連",
          "GEOIP,private,🎯 全球直連,no-resolve",
          "GEOSITE,openai,🤖 ChatGPT",
          "RULE-SET,AI_Copilot_Classical,🧑‍💻 Copilot",
          "GEOSITE,github-copilot,🧑‍💻 Copilot",
          "RULE-SET,AI_Claude_Classical,🔐 Claude Account Guard",
          "GEOSITE,anthropic,🔐 Claude Account Guard",
          "GEOSITE,category-ntp,🔐 Claude Account Guard",
          "RULE-SET,AI_Gemini_Classical,🤖 Google AI",
          "RULE-SET,AI_NotebookLM_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_Jules_Classical,🤖 Google AI Tools",
          "GEOSITE,perplexity,🤖 Perplexity",
          "GEOSITE,xai,🤖 Grok",
          "GEOSITE,poe,🤖 Poe",
          "RULE-SET,AI_OpenRouter_Classical,🤖 OpenRouter",
          "RULE-SET,AI_Cursor_Classical,🤖 Cursor",
          "RULE-SET,AI_HuggingFace_Classical,🤗 Hugging Face",
          "RULE-SET,AI_Mirasim_Classical,🤖 Mirasim",
          "RULE-SET,AI_Antigravity_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_GoogleLabs_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_Stitch_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_AndroidStudioAI_Classical,🤖 Google AI",
          "RULE-SET,AI_GeminiCloud_Classical,🤖 Google AI Tools",
          "RULE-SET,AI_VertexAI_Classical,🤖 Google AI",
          "RULE-SET,Flow_Music_Classical,🎵 Flow Music",
          "RULE-SET,AI_OpenCode_Classical,🤖 OpenCode",
          "GEOSITE,google-deepmind,🤖 AI Other",
          "GEOSITE,category-ai-!cn,🤖 AI Other",
          "GEOSITE,category-ai-cn,🤖 AI CN Other",
          "MATCH,⛔ 拒絕"
        ],
        "rule-providers": {
          "Privacy_Guard_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "IP-CIDR6,::/0,no-resolve",
              "DST-PORT,53",
              "DST-PORT,853",
              "DST-PORT,3478",
              "DST-PORT,5349",
              "DST-PORT,19302-19309",
              "DOMAIN-KEYWORD,stun"
            ]
          },
          "AI_Copilot_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,copilot.com",
              "DOMAIN-SUFFIX,copilot.microsoft.com",
              "DOMAIN-SUFFIX,copilot.cloud.microsoft"
            ]
          },
          "AI_Claude_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,anthropic.com",
              "DOMAIN-SUFFIX,claude.ai",
              "DOMAIN-SUFFIX,claude.com",
              "DOMAIN-SUFFIX,clau.de",
              "DOMAIN-SUFFIX,claudemcpclient.com",
              "DOMAIN-SUFFIX,claudemcpcontent.com",
              "DOMAIN-SUFFIX,claudeusercontent.com",
              "DOMAIN-SUFFIX,sentry.io",
              "DOMAIN-SUFFIX,statsigapi.net",
              "DOMAIN-SUFFIX,intercom.io",
              "DOMAIN-SUFFIX,intercomcdn.com",
              "DOMAIN,servd-anthropic-website.b-cdn.net",
              "DOMAIN,anthropic.com.cdn.cloudflare.net",
              "DOMAIN,anthropic.auth0.com",
              "DOMAIN,anthropic-com.ghost.io",
              "DOMAIN,browser-intake-us5-datadoghq.com",
              "DOMAIN,cdn.usefathom.com",
              "DOMAIN-KEYWORD,datadog",
              "DOMAIN-KEYWORD,sentry",
              "DOMAIN-KEYWORD,sift",
              "IP-CIDR,160.79.104.0/21",
              "IP-CIDR6,2607:6bc0::/32"
            ]
          },
          "AI_Gemini_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,gemini.google",
              "DOMAIN-SUFFIX,ai.google.dev",
              "DOMAIN-SUFFIX,ai.studio",
              "DOMAIN-SUFFIX,aistudio.google.com",
              "DOMAIN-SUFFIX,gemini.gstatic.com",
              "DOMAIN-SUFFIX,generativeai.google",
              "DOMAIN-SUFFIX,makersuite.google.com",
              "DOMAIN,gemini.google.com",
              "DOMAIN,generativelanguage.googleapis.com",
              "DOMAIN,geller-pa.googleapis.com",
              "DOMAIN,proactivebackend-pa.googleapis.com",
              "DOMAIN,robinfrontend-pa.googleapis.com"
            ]
          },
          "AI_NotebookLM_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,notebook.google",
              "DOMAIN-SUFFIX,notebook.google.com",
              "DOMAIN-SUFFIX,notebooklm.google",
              "DOMAIN-SUFFIX,notebooklm.google.com",
              "DOMAIN-SUFFIX,notebooklm.cloud.google.com",
              "DOMAIN,notebooklm-pa.googleapis.com",
              "DOMAIN,notebooklm.googleapis.com"
            ]
          },
          "AI_Jules_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,jules.google.com",
              "DOMAIN,jules.googleapis.com"
            ]
          },
          "AI_OpenRouter_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,openrouter.ai"
            ]
          },
          "AI_Cursor_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,cursor.sh",
              "DOMAIN-SUFFIX,cursorapi.com",
              "DOMAIN-SUFFIX,cursorvm.com"
            ]
          },
          "AI_HuggingFace_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,huggingface.co"
            ]
          },
          "AI_Mirasim_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,mirasim.ai"
            ]
          },
          "AI_Antigravity_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,antigravity.google",
              "DOMAIN-SUFFIX,antigravity-unleash.goog",
              "DOMAIN-SUFFIX,daily-cloudcode-pa.googleapis.com",
              "DOMAIN-SUFFIX,cloudcode-pa.googleapis.com"
            ]
          },
          "AI_GoogleLabs_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,labs.google"
            ]
          },
          "AI_Stitch_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,stitch.withgoogle.com"
            ]
          },
          "AI_AndroidStudioAI_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,cloudaicompanion.googleapis.com",
              "DOMAIN,cloudcode-pa.googleapis.com"
            ]
          },
          "AI_GeminiCloud_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,geminicloudassist.googleapis.com"
            ]
          },
          "AI_VertexAI_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,aiplatform.googleapis.com",
              "DOMAIN-KEYWORD,-aiplatform.googleapis.com"
            ]
          },
          "Flow_Music_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN,storage.googleapis.com"
            ]
          },
          "AI_OpenCode_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "DOMAIN-SUFFIX,opencode.ai"
            ]
          }
        }
      },
      "standard": {
        "port": 7890,
        "socks-port": 7891,
        "mixed-port": 7893,
        "redir-port": 7892,
        "tproxy-port": 7895,
        "allow-lan": true,
        "bind-address": "*",
        "mode": "rule",
        "tcp-concurrent": true,
        "unified-delay": true,
        "proxy-providers": {
          "provider1": {
            "type": "http",
            "url": "url",
            "interval": 3600,
            "path": "./proxy_provider/provider1.yaml",
            "proxy": "DIRECT",
            "header": null,
            "health-check": {
              "enable": true,
              "interval": 600,
              "url": "https://cp.cloudflare.com/generate_204"
            },
            "override": {
              "skip-cert-verify": true,
              "udp": true
            }
          }
        },
        "geox-url": {
          "mmdb": "https://testingcf.jsdelivr.net/gh/alecthw/mmdb_china_ip_list@release/Country.mmdb",
          "geoip": "https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
          "geosite": "https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
          "asn": "https://testingcf.jsdelivr.net/gh/xishang0128/geoip@release/GeoLite2-ASN.mmdb"
        },
        "geo-auto-update": true,
        "geo-update-interval": 24,
        "geodata-mode": true,
        "log-level": "info",
        "ipv6": false,
        "profile": {
          "store-selected": true,
          "store-fake-ip": true
        },
        "tun": {
          "enable": true,
          "stack": "system",
          "dns-hijack": [
            "any:53",
            "tcp://any:53"
          ],
          "auto-detect-interface": false,
          "auto-route": false,
          "auto-redirect": false,
          "strict-route": false,
          "endpoint-independent-nat": true
        },
        "sniffer": {
          "enable": true,
          "override-destination": true,
          "sniff": {
            "QUIC": {
              "ports": [
                443
              ]
            },
            "TLS": {
              "ports": [
                443,
                8443
              ]
            },
            "HTTP": {
              "ports": [
                80,
                "8080-8880"
              ],
              "override-destination": true
            }
          },
          "force-domain": [
            "+.netflix.com",
            "+.nflxvideo.net",
            "+.amazonaws.com",
            "+.media.dssott.com"
          ],
          "skip-domain": [
            "+.apple.com",
            "Mijia Cloud",
            "dlg.io.mi.com",
            "+.oray.com",
            "+.sunlogin.net",
            "+.push.apple.com"
          ],
          "parse-pure-ip": true,
          "force-dns-mapping": true
        },
        "dns": {
          "enable": true,
          "listen": "0.0.0.0:7874",
          "ipv6": false,
          "enhanced-mode": "fake-ip",
          "fake-ip-range": "198.18.0.1/16",
          "fake-ip-filter": [
            "*.lan",
            "localhost.ptlogin2.qq.com"
          ],
          "fake-ip-filter-mode": "blacklist",
          "use-system-hosts": false,
          "respect-rules": false,
          "default-nameserver": [
            "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
            "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
          ],
          "nameserver": [
            "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
            "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
          ],
          "proxy-server-nameserver": [
            "https://8.8.8.8/dns-query#DIRECT",
            "https://8.8.4.4/dns-query#DIRECT"
          ],
          "direct-nameserver": [
            "https://127.0.0.1:5053/dns-query#DIRECT"
          ],
          "direct-nameserver-follow-policy": false,
          "nameserver-policy": {
            "geosite:private": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:cn": [
              "https://127.0.0.1:5053/dns-query#DIRECT"
            ],
            "geosite:openai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:bing": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ads-all": [
              "https://dns.adguard-dns.com/dns-query#🛡️ DNS Proxy"
            ],
            "+.anthropic.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.claude.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.perplexity.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "jules.google.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "jules.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.x.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.poe.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.openrouter.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursor.sh": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursorapi.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.cursorvm.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.huggingface.co": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.mirasim.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.antigravity.google": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.labs.google": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "cloudaicompanion.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "cloudcode-pa.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geminicloudassist.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "aiplatform.googleapis.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "stitch.withgoogle.com": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "+.opencode.ai": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:google-deepmind": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ai-!cn": [
              "https://1.1.1.1/dns-query#🛡️ DNS Proxy",
              "https://1.0.0.1/dns-query#🛡️ DNS Proxy"
            ],
            "geosite:category-ai-cn": [
              "https://127.0.0.1:5053/dns-query#DIRECT"
            ]
          }
        },
        "proxy-groups": [
          {
            "name": "🛡️ DNS Proxy",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "⛔ 拒絕"
            ]
          },
          {
            "name": "🚀 手动选择",
            "type": "select",
            "url": "https://cp.cloudflare.com/generate_204",
            "interval": 300,
            "proxies": [
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "♻️ 自动选择",
            "type": "select",
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "💬 即时通讯",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ]
          },
          {
            "name": "🌐 社交媒体",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点",
              "🎯 全球直连"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🚀 GitHub",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🎯 全球直连",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ]
          },
          {
            "name": "🤖 ChatGPT",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🤖 AI服务",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎶 TikTok",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "📹 YouTube",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇸🇬 新加坡节点",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎥 Netflix",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇸🇬 新加坡节点",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎥 DisneyPlus",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇸🇬 新加坡节点",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎥 HBO",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇸🇬 新加坡节点",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎥 PrimeVideo",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇸🇬 新加坡节点",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎥 AppleTV+",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇸🇬 新加坡节点",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎥 Emby",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎻 Spotify",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "📺 Bahamut",
            "type": "select",
            "proxies": [
              "🇼🇸 台湾节点",
              "🚀 手动选择",
              "♻️ 自动选择",
              "🎯 全球直连"
            ]
          },
          {
            "name": "🌎 国外媒体",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇸🇬 新加坡节点",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🛒 国外电商",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点",
              "🎯 全球直连"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "📢 谷歌FCM",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ]
          },
          {
            "name": "🇬 谷歌服务",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ]
          },
          {
            "name": "🍎 苹果服务",
            "type": "select",
            "proxies": [
              "🎯 全球直连",
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ]
          },
          {
            "name": "Ⓜ️ 微软服务",
            "type": "select",
            "proxies": [
              "🎯 全球直连",
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ]
          },
          {
            "name": "🎮 游戏平台",
            "type": "select",
            "proxies": [
              "🎯 全球直连",
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ]
          },
          {
            "name": "🎮 Steam",
            "type": "select",
            "proxies": [
              "🎯 全球直连",
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🚀 测速工具",
            "type": "select",
            "proxies": [
              "🎯 全球直连",
              "🚀 手动选择",
              "♻️ 自动选择",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🐟 漏网之鱼",
            "type": "select",
            "proxies": [
              "🚀 手动选择",
              "♻️ 自动选择",
              "🎯 全球直连",
              "🇭🇰 香港节点",
              "🇺🇸 美国节点",
              "🇯🇵 日本节点",
              "🇸🇬 新加坡节点",
              "🇼🇸 台湾节点"
            ],
            "filter": "^(?!.*(DIRECT|直接连接|群|邀请|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|备用|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|无法|说明|使用|提示|特别|访问|支持|教程|关注|更新|作者|加入|USE|USED|TOTAL|EXPIRE|EMAIL|Panel|Channel|Author|Traffic|GB|Expire)).*$",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🔀 非标端口",
            "type": "select",
            "proxies": [
              "🐟 漏网之鱼",
              "🎯 全球直连"
            ]
          },
          {
            "name": "🇭🇰 香港节点",
            "type": "select",
            "filter": "(?i)(🇭🇰|港|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|hk|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌)",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇺🇸 美国节点",
            "type": "select",
            "filter": "(?i)(🇺🇸|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|纽纽|亚特兰大|迈阿密|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇯🇵 日本节点",
            "type": "select",
            "filter": "(?i)(🇯🇵|日本|川日|东京|大阪|泉日|埼玉|沪日|深日|(?<!尼|-)日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI)",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇸🇬 新加坡节点",
            "type": "select",
            "filter": "(?i)(🇸🇬|新加坡|坡|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN)",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🇼🇸 台湾节点",
            "type": "select",
            "filter": "(?i)(🇹🇼|🇼🇸|台|新北|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC)",
            "use": [
              "provider1"
            ]
          },
          {
            "name": "🎯 全球直连",
            "type": "select",
            "proxies": [
              "DIRECT"
            ]
          },
          {
            "name": "⛔ 拒絕",
            "type": "select",
            "proxies": [
              "REJECT"
            ]
          }
        ],
        "rules": [
          "RULE-SET,Privacy_Guard_Classical,REJECT,no-resolve",
          "GEOSITE,private,🎯 全球直连",
          "GEOIP,private,🎯 全球直连,no-resolve",
          "RULE-SET,Custom_Direct_Domain,🎯 全球直连",
          "RULE-SET,Custom_Direct_IP,🎯 全球直连,no-resolve",
          "RULE-SET,Custom_Direct_Port,🎯 全球直连",
          "RULE-SET,Custom_Proxy_Domain,🚀 手动选择",
          "RULE-SET,Custom_Proxy_IP,🚀 手动选择,no-resolve",
          "GEOSITE,google-cn,🎯 全球直连",
          "GEOSITE,category-games@cn,🎯 全球直连",
          "RULE-SET,Steam_CDN_Domain,🎯 全球直连",
          "RULE-SET,Steam_CDN_IP,🎯 全球直连,no-resolve",
          "GEOSITE,category-game-platforms-download,🎯 全球直连",
          "GEOSITE,category-public-tracker,🎯 全球直连",
          "GEOSITE,category-communication,💬 即时通讯",
          "GEOSITE,category-social-media-!cn,🌐 社交媒体",
          "GEOSITE,openai,🤖 ChatGPT",
          "GEOSITE,category-ai-!cn,🤖 AI服务",
          "GEOSITE,github,🚀 GitHub",
          "GEOSITE,category-speedtest,🚀 测速工具",
          "GEOSITE,steam,🎮 Steam",
          "GEOSITE,youtube,📹 YouTube",
          "GEOSITE,apple-tvplus,🎥 AppleTV+",
          "GEOSITE,apple,🍎 苹果服务",
          "GEOSITE,microsoft,Ⓜ️ 微软服务",
          "GEOSITE,googlefcm,📢 谷歌FCM",
          "GEOSITE,google,🇬 谷歌服务",
          "GEOSITE,tiktok,🎶 TikTok",
          "GEOSITE,netflix,🎥 Netflix",
          "GEOSITE,disney,🎥 DisneyPlus",
          "GEOSITE,hbo,🎥 HBO",
          "GEOSITE,primevideo,🎥 PrimeVideo",
          "GEOSITE,category-emby,🎥 Emby",
          "GEOSITE,spotify,🎻 Spotify",
          "GEOSITE,bahamut,📺 Bahamut",
          "GEOSITE,category-games,🎮 游戏平台",
          "GEOSITE,category-entertainment,🌎 国外媒体",
          "GEOSITE,category-ecommerce,🛒 国外电商",
          "GEOSITE,gfw,🚀 手动选择",
          "GEOIP,telegram,💬 即时通讯,no-resolve",
          "GEOIP,twitter,🌐 社交媒体,no-resolve",
          "GEOIP,facebook,🌐 社交媒体,no-resolve",
          "GEOIP,google,🇬 谷歌服务,no-resolve",
          "GEOIP,netflix,🎥 Netflix,no-resolve",
          "GEOSITE,cn,🎯 全球直连",
          "GEOIP,cn,🎯 全球直连,no-resolve",
          "RULE-SET,Custom_Port_Direct,🔀 非标端口",
          "MATCH,🐟 漏网之鱼"
        ],
        "rule-providers": {
          "Custom_Port_Direct": {
            "behavior": "classical",
            "interval": 10800,
            "type": "http",
            "url": "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Port_Direct.yaml",
            "format": "yaml"
          },
          "Custom_Direct_Domain": {
            "behavior": "domain",
            "interval": 10800,
            "type": "http",
            "url": "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Domain.mrs",
            "format": "mrs"
          },
          "Custom_Direct_IP": {
            "behavior": "ipcidr",
            "interval": 10800,
            "type": "http",
            "url": "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_IP.mrs",
            "format": "mrs"
          },
          "Custom_Direct_Port": {
            "behavior": "classical",
            "interval": 10800,
            "type": "http",
            "url": "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Classical_Port.yaml",
            "format": "yaml"
          },
          "Custom_Proxy_Domain": {
            "behavior": "domain",
            "interval": 10800,
            "type": "http",
            "url": "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Domain.mrs",
            "format": "mrs"
          },
          "Custom_Proxy_IP": {
            "behavior": "ipcidr",
            "interval": 10800,
            "type": "http",
            "url": "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_IP.mrs",
            "format": "mrs"
          },
          "Steam_CDN_Domain": {
            "behavior": "domain",
            "interval": 10800,
            "type": "http",
            "url": "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Steam_CDN_Domain.mrs",
            "format": "mrs"
          },
          "Steam_CDN_IP": {
            "behavior": "ipcidr",
            "interval": 10800,
            "type": "http",
            "url": "https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Steam_CDN_IP.mrs",
            "format": "mrs"
          },
          "Privacy_Guard_Classical": {
            "type": "inline",
            "behavior": "classical",
            "payload": [
              "IP-CIDR6,::/0,no-resolve",
              "DST-PORT,53",
              "DST-PORT,853",
              "DST-PORT,3478",
              "DST-PORT,5349",
              "DST-PORT,19302-19309",
              "DOMAIN-KEYWORD,stun"
            ]
          }
        }
      }
    }
  },
  "iniTemplates": {
    "ai-balanced": ";Custom_OpenClash_Rules\n;AI 專用訂閱轉換模板（YAML / INI 行为显式分离）\n;作者：https://github.com/mythic3011/rules\n;項目地址：https://github.com/mythic3011/rules\n;基於 Custom_Clash_AI.yaml 的寬鬆版路由策略，但維持 subconverter [custom] 方言。\n;YAML 使用 rule-providers；INI 只使用 ruleset= / custom_proxy_group=，不包含 YAML rule-providers 語法。\n;Provider-level exclude-filter only applies to YAML output. INI relies on group regex filtering and explicit comments.\n;Cloudflare generate_204 checks proxy reachability only. It does not validate SSH-to-VPS path quality.\n;GENERATED by internal/python/generate_ai_profiles.py. Do not edit manually.\n\n[custom]\n\n;設定規則標誌位\n;以下規則按由上而下順序遍歷，優先命中上位規則，規則重複無影響\n\nruleset=⛔ 拒絕,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Privacy_Guard_Classical.yaml,28800\nruleset=🎯 全球直連,[]GEOSITE,private\nruleset=🎯 全球直連,[]GEOIP,private,no-resolve\n\nruleset=🎵 Flow Music,clash-classic:https://raw.githubusercontent.com/mythic3011/rules/0e9631339904f4a989c884781570b5756d82c9a3/rule/Flow_Music_Classical.yaml,10800\nruleset=🔐 Claude Account Guard,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Claude_Classical.yaml,28800\nruleset=🔐 Claude Account Guard,[]GEOSITE,anthropic\nruleset=🔐 Claude Account Guard,[]GEOSITE,category-ntp\nruleset=🔐 Claude Account Guard,clash-classic:https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/anthropic.yaml,10800\n\nruleset=🤖 ChatGPT,[]GEOSITE,openai\n\nruleset=🧑‍💻 Copilot,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Copilot_Classical.yaml,28800\nruleset=🧑‍💻 Copilot,[]GEOSITE,github-copilot\n\nruleset=🤖 Google AI,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Gemini_Classical.yaml,28800\nruleset=🤖 Google AI Tools,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_NotebookLM_Classical.yaml,28800\nruleset=🤖 Google AI Tools,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Jules_Classical.yaml,28800\nruleset=🤖 Perplexity,[]GEOSITE,perplexity\nruleset=🤖 Grok,[]GEOSITE,xai\nruleset=🤖 Poe,[]GEOSITE,poe\nruleset=🤖 OpenRouter,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_OpenRouter_Classical.yaml,28800\nruleset=🤖 Cursor,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Cursor_Classical.yaml,28800\nruleset=🤗 Hugging Face,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_HuggingFace_Classical.yaml,28800\nruleset=🤖 Mirasim,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Mirasim_Classical.yaml,28800\nruleset=🤖 Google AI Tools,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Antigravity_Classical.yaml,28800\nruleset=🤖 Google AI Tools,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_GoogleLabs_Classical.yaml,28800\nruleset=🤖 Google AI Tools,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Stitch_Classical.yaml,28800\nruleset=🤖 Google AI,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_AndroidStudioAI_Classical.yaml,28800\nruleset=🤖 Google AI Tools,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_GeminiCloud_Classical.yaml,28800\nruleset=🤖 Google AI,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_VertexAI_Classical.yaml,28800\n\nruleset=🎵 Flow Music,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Flow_Music_Classical.yaml,28800\n\nruleset=🤖 OpenCode,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_OpenCode_Classical.yaml,28800\n\nruleset=🌊 Windsurf,clash-classic:https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/windsurf.yaml,10800\nruleset=🤗 Hugging Face,clash-classic:https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/huggingface.yaml,10800\n\nruleset=🤖 AI Other,clash-classic:https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/d07cac190c33e7914ba7adaf7e7c14298fba7024/rules/clash/all.yaml,10800\nruleset=🤖 AI Other,[]GEOSITE,google-deepmind\nruleset=🤖 AI Other,[]GEOSITE,category-ai-!cn\n\nruleset=🎯 全球直連,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/SSH_Direct_Classical.yaml,28800\nruleset=🚀 手動選擇,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/SSH_Proxy_Classical.yaml,28800\n\nruleset=🎯 全球直連,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Gaming_Direct_Classical.yaml,28800\n\nruleset=🎯 全球直連,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/HuggingFace_Download_Direct_Classical.yaml,28800\nruleset=🎯 全球直連,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Cursor_Download_Direct_Classical.yaml,28800\n\nruleset=🔐 高風險帳戶,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_Stripe_Classical.yaml,28800\nruleset=🔐 高風險帳戶,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_PayPal_Classical.yaml,28800\nruleset=🔐 高風險帳戶,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_Wise_Classical.yaml,28800\nruleset=🔐 高風險帳戶,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_Revolut_Classical.yaml,28800\nruleset=🔐 高風險帳戶,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_IBKR_Classical.yaml,28800\nruleset=🔐 高風險帳戶,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Finance_Alpaca_Classical.yaml,28800\n\nruleset=🎯 全球直連,clash-domain:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Direct_Domain.yaml,28800\nruleset=🎯 全球直連,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Direct_Classical_IP.yaml,28800\n\nruleset=🚀 手動選擇,clash-domain:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Proxy_Domain.yaml,28800\nruleset=🚀 手動選擇,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Proxy_Classical_IP.yaml,28800\n\nruleset=🎯 全球直連,[]GEOIP,HK,no-resolve\nruleset=🎯 全球直連,[]GEOIP,CN,no-resolve\n\nruleset=🐟 漏網之魚,[]FINAL\n\n\n;==========================================================\n; Level 0 — Foundation groups\n; Define these before anything references them\n;==========================================================\n\ncustom_proxy_group=🎯 全球直連`select`[]DIRECT\ncustom_proxy_group=⛔ 拒絕`select`[]REJECT\n\n\n;==========================================================\n; Level 1 — Regional node selectors\n;==========================================================\n\ncustom_proxy_group=🇹🇼 台灣節點`select`[]⛔ 拒絕`(?i)(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)\n\ncustom_proxy_group=🇰🇷 韓國節點`select`[]⛔ 拒絕`(?i)(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN)\n\ncustom_proxy_group=🌐 其他／未識別節點`select`[]⛔ 拒絕`(?i)^(?!.*(?:剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明|🇭🇰|香港|Hong Kong|Hong-Kong|\\bHKG\\b|\\bHK\\b|(?:🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)|(?:🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai)|(?:🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN)|(?:🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC)|(?:🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN))).*$\n\n\n;==========================================================\n; Level 1 — Stable manual region groups\n;==========================================================\n\ncustom_proxy_group=🇯🇵 JP Stable`select`[]⛔ 拒絕`(?i)🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai\n\ncustom_proxy_group=🇸🇬 SG Stable`select`[]⛔ 拒絕`(?i)🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN\n\ncustom_proxy_group=🇺🇸 US Stable`select`[]⛔ 拒絕`(?i)🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|\\bUSA\\b|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC\n\n\n;==========================================================\n; Level 2 — Shared routing selectors\n;==========================================================\n\ncustom_proxy_group=📌 固定節點`select`[]⛔ 拒絕`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點\n\ncustom_proxy_group=🚀 手動選擇`select`[]📌 固定節點`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕`(?i)^(?!.*(?:🇭🇰|香港|Hong Kong|Hong-Kong|\\bHKG\\b|\\bHK\\b|剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$\n\ncustom_proxy_group=💳 穩定會話`select`[]DIRECT`[]REJECT`(?i)^(?!.*(?:剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明)).*$\n\ncustom_proxy_group=🔐 高風險帳戶`select`[]REJECT`[]💳 穩定會話\n\n\n;==========================================================\n; Level 3 — AI service selectors\n; One service = one visible group\n;==========================================================\n\ncustom_proxy_group=🤖 ChatGPT`select`[]🇺🇸 US Stable`[]🇸🇬 SG Stable`[]🇯🇵 JP Stable`[]⛔ 拒絕\n\ncustom_proxy_group=🧑‍💻 Copilot`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 Google AI`select`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 Google AI Tools`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 Perplexity`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 Grok`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 Poe`select`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 OpenRouter`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 Cursor`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 Mirasim`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 OpenCode`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇹🇼 台灣節點`[]🇰🇷 韓國節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\n\n;==========================================================\n; Account-protected service\n;==========================================================\n\ncustom_proxy_group=🔐 Claude Account Guard`select`[]⛔ 拒絕`[]🇺🇸 US Stable`[]🇸🇬 SG Stable`[]🇯🇵 JP Stable\n\n\n;==========================================================\n; Stable-session / explicitly separated AI services\n;==========================================================\n\ncustom_proxy_group=🎵 Flow Music`select`[]🇯🇵 JP Stable`[]🇸🇬 SG Stable`[]🇺🇸 US Stable`[]⛔ 拒絕\n\ncustom_proxy_group=🌊 Windsurf`select`[]🇺🇸 US Stable`[]🇸🇬 SG Stable`[]🇯🇵 JP Stable`[]⛔ 拒絕\n\ncustom_proxy_group=🤗 Hugging Face`select`[]🇺🇸 US Stable`[]🇸🇬 SG Stable`[]🇯🇵 JP Stable`[]⛔ 拒絕\n\ncustom_proxy_group=🤖 AI Other`select`[]🎯 全球直連`[]🇺🇸 US Stable`[]🇸🇬 SG Stable`[]🇯🇵 JP Stable`[]⛔ 拒絕\n\n\n;==========================================================\n; Level 4 — Final catch-all selector\n;==========================================================\n\ncustom_proxy_group=🐟 漏網之魚`select`[]🎯 全球直連`[]🚀 手動選擇`[]📌 固定節點`[]🌐 其他／未識別節點`[]⛔ 拒絕\n\n\n;下方参数请勿修改\nenable_rule_generator=true\noverwrite_original_rules=true\n",
    "standard": ";Custom_OpenClash_Rules\n;全分组防 DNS 泄漏订阅转换模板\n;作者：https://github.com/Aethersailor\n;项目地址：https://github.com/Aethersailor/Custom_OpenClash_Rules\n;基于 ACL4SSR 模板魔改而来，感谢原作者！\n;<建议>搭配本项目配套设置，实现最佳化的 OpenClash 使用效果！\n;设置方案：https://github.com/Aethersailor/Custom_OpenClash_Rules/wiki/OpenClash-%E8%AE%BE%E7%BD%AE%E6%96%B9%E6%A1%88\n\n[custom]\nruleset=REJECT,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Privacy_Guard_Classical.yaml,28800\n;设置规则标志位\n;以下规则，按照从上往下的顺序遍历，优先命中上位规则，规则重复无影响\n;修改顺序会影响分流效果\n\n;本地地址和域名直连\nruleset=🎯 全球直连,[]GEOSITE,private\nruleset=🎯 全球直连,[]GEOIP,private,no-resolve\n;本项目收录的直连规则\nruleset=🎯 全球直连,clash-domain:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Domain.yaml,28800\nruleset=🎯 全球直连,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Classical_IP.yaml,28800\n;本项目收录的代理规则\nruleset=🚀 手动选择,clash-domain:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Domain.yaml,28800\nruleset=🚀 手动选择,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Classical_IP.yaml,28800\n;谷歌在国内可用的域名直连\nruleset=🎯 全球直连,[]GEOSITE,google-cn\n;国内游戏域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-games@cn\n;Steam 下载 CDN 直连\nruleset=🎯 全球直连,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Steam_CDN_Classical.yaml,28800\n;各大游戏平台下载域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-game-platforms-download\n;BT Tracker 相关域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-public-tracker\n;即时通讯包括了 Telegram/WhatsApp/Line 等海外主流即时通讯软件域名\nruleset=💬 即时通讯,[]GEOSITE,category-communication\n;社交媒体包括了 Twitter(X)/Facebook/Instagram 等海外主流社交媒体\nruleset=🌐 社交媒体,[]GEOSITE,category-social-media-!cn\nruleset=🤖 ChatGPT,[]GEOSITE,openai\nruleset=🤖 AI服务,[]GEOSITE,category-ai-!cn\nruleset=🚀 GitHub,[]GEOSITE,github\n;测速工具包括 SpeedTest 等主流测速工具域名\nruleset=🚀 测速工具,[]GEOSITE,category-speedtest\nruleset=🎮 Steam,[]GEOSITE,steam\nruleset=📹 YouTube,[]GEOSITE,youtube\nruleset=🎥 AppleTV+,[]GEOSITE,apple-tvplus\nruleset=🍎 苹果服务,[]GEOSITE,apple\nruleset=Ⓜ️ 微软服务,[]GEOSITE,microsoft\nruleset=📢 谷歌FCM,[]GEOSITE,googlefcm\nruleset=🇬 谷歌服务,[]GEOSITE,google\nruleset=🎶 TikTok,[]GEOSITE,tiktok\nruleset=🎥 Netflix,[]GEOSITE,netflix\nruleset=🎥 DisneyPlus,[]GEOSITE,disney\nruleset=🎥 HBO,[]GEOSITE,hbo\nruleset=🎥 PrimeVideo,[]GEOSITE,primevideo\n;Emby 包括主流 Emby 服务相关域名\nruleset=🎥 Emby,[]GEOSITE,category-emby\nruleset=🎻 Spotify,[]GEOSITE,spotify\nruleset=📺 Bahamut,[]GEOSITE,bahamut\nruleset=🎮 游戏平台,[]GEOSITE,category-games\nruleset=🌎 国外媒体,[]GEOSITE,category-entertainment\nruleset=🛒 国外电商,[]GEOSITE,category-ecommerce\nruleset=🚀 手动选择,[]GEOSITE,gfw\nruleset=💬 即时通讯,[]GEOIP,telegram,no-resolve\nruleset=🌐 社交媒体,[]GEOIP,twitter,no-resolve\nruleset=🌐 社交媒体,[]GEOIP,facebook,no-resolve\nruleset=🇬 谷歌服务,[]GEOIP,google,no-resolve\nruleset=🎥 Netflix,[]GEOIP,netflix,no-resolve\n;由于 OpenClash 使用的大陆白名单收录不全，此处留有 geosite:cn 作为国内域名兜底\nruleset=🎯 全球直连,[]GEOSITE,cn\n;由于 OpenClash 使用的大陆白名单收录不全，此处留有 geoip:cn 作为国内 IP 兜底\nruleset=🎯 全球直连,[]GEOIP,cn,no-resolve\n;以上兜底规则会根据实际情况随时取消\n;PT/BT 优化开启会使 80/443 以外端口的流量直连\nruleset=🔀 非标端口,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Port_Direct.yaml,28800\n;国内冷门域名会命中漏网之鱼，如影响使用，请设置漏网之鱼直连\n;漏网之鱼直连时，无法通过 DNS 泄露测试，但是并不存在泄露\nruleset=🐟 漏网之鱼,[]FINAL\n;设置规则标志位结束\n\n;设置节点分组标志位\ncustom_proxy_group=🚀 手动选择`select`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=♻️ 自动选择`select`.*\ncustom_proxy_group=💬 即时通讯`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🎯 全球直连\ncustom_proxy_group=🌐 社交媒体`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🎯 全球直连`.*\ncustom_proxy_group=🚀 GitHub`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🎯 全球直连\ncustom_proxy_group=🤖 ChatGPT`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🤖 AI服务`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎶 TikTok`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=📹 YouTube`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 Netflix`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 DisneyPlus`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 HBO`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 PrimeVideo`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 AppleTV+`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🎯 全球直连`.*\ncustom_proxy_group=🎥 Emby`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎻 Spotify`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=📺 Bahamut`select`[]🇼🇸 台湾节点`[]🚀 手动选择`[]🎯 全球直连`.*\ncustom_proxy_group=🌎 国外媒体`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🛒 国外电商`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=📢 谷歌FCM`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点\ncustom_proxy_group=🇬 谷歌服务`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🍎 苹果服务`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=Ⓜ️ 微软服务`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎮 游戏平台`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎮 Steam`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🚀 测速工具`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🐟 漏网之鱼`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🔀 非标端口`select`[]🐟 漏网之鱼`[]🎯 全球直连\ncustom_proxy_group=🇭🇰 香港节点`select`(🇭🇰|港|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|hk|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌)\ncustom_proxy_group=🇺🇸 美国节点`select`(🇺🇸|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|纽纽|亚特兰大|迈阿密|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)\ncustom_proxy_group=🇯🇵 日本节点`select`(🇯🇵|日本|川日|东京|大阪|泉日|埼玉|沪日|深日|(?<!尼|-)日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI)\ncustom_proxy_group=🇸🇬 新加坡节点`select`(🇸🇬|新加坡|坡|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN)\ncustom_proxy_group=🇼🇸 台湾节点`select`(🇹🇼|🇼🇸|台|新北|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC)\ncustom_proxy_group=🇰🇷 韩国节点`select`(🇰🇷|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|首尔|韩|韓|春川|Chuncheon|ICN)\ncustom_proxy_group=🎯 全球直连`select`[]DIRECT\n;设置分组标志位\n\n;下方参数请勿修改\nenable_rule_generator=true\noverwrite_original_rules=true\n\n",
    "lite": ";Custom_OpenClash_Rules\n;由社区维护的分流规则与防泄漏配置模板 \n;作者：https://github.com/Aethersailor\n;项目地址：https://github.com/Aethersailor/Custom_OpenClash_Rules\n;基于 ACL4SSR 模板魔改而来，感谢原作者！\n;<建议>搭配本项目配套设置，实现最佳化的 OpenClash 使用效果！\n;设置方案：https://github.com/Aethersailor/Custom_OpenClash_Rules/wiki/OpenClash-%E8%AE%BE%E7%BD%AE%E6%96%B9%E6%A1%88\n\n;轻量版分流规则\n;仅包含基本的分流功能以及基本的直连规则\n;适合不需要解锁和分流需求的用户\n\n[custom]\nruleset=REJECT,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Privacy_Guard_Classical.yaml,28800\n;设置规则标志位\n;以下规则，按照从上往下的顺序遍历，优先命中上位规则，规则重复无影响\n;修改顺序会影响分流效果\n\n;本地地址和域名直连\nruleset=🎯 全球直连,[]GEOSITE,private\nruleset=🎯 全球直连,[]GEOIP,private,no-resolve\n;本项目收录的直连规则\nruleset=🎯 全球直连,clash-domain:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Domain.yaml,28800\nruleset=🎯 全球直连,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Classical_IP.yaml,28800\n;本项目收录的代理规则\nruleset=🚀 手动选择,clash-domain:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Domain.yaml,28800\nruleset=🚀 手动选择,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Classical_IP.yaml,28800\n;谷歌在国内可用的域名直连\nruleset=🎯 全球直连,[]GEOSITE,google-cn\n;国内游戏域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-games@cn\n;Steam 下载 CDN 直连\nruleset=🎯 全球直连,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Steam_CDN_Classical.yaml,2880\n;各大游戏平台下载域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-game-platforms-download\n;BT Tracker 相关域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-public-tracker\nruleset=🚀 GitHub,[]GEOSITE,github\nruleset=🚀 测速工具,[]GEOSITE,category-speedtest\nruleset=🍎 苹果服务,[]GEOSITE,apple\nruleset=🎮 Steam,[]GEOSITE,steam\nruleset=Ⓜ️ 微软服务,[]GEOSITE,microsoft\nruleset=📢 谷歌FCM,[]GEOSITE,googlefcm\nruleset=🇬 谷歌服务,[]GEOSITE,google\nruleset=🚀 手动选择,[]GEOSITE,gfw\nruleset=🎮 游戏平台,[]GEOSITE,category-games\nruleset=🇬 谷歌服务,[]GEOIP,google,no-resolve\n;由于 OpenClash 使用的大陆白名单收录不全，此处留有 geosite:cn 作为国内域名兜底\nruleset=🎯 全球直连,[]GEOSITE,cn\n;由于 OpenClash 使用的大陆白名单收录不全，此处留有 geoip:cn 作为国内 IP 兜底\nruleset=🎯 全球直连,[]GEOIP,cn,no-resolve\n;以上兜底规则会根据实际情况随时取消\n;PT/BT 优化开启会使 80/443 以外端口的流量直连\nruleset=🔀 非标端口,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Port_Direct.yaml,28800\n;国内冷门域名会命中漏网之鱼，如影响使用，请设置漏网之鱼直连\n;漏网之鱼直连时，无法通过 DNS 泄露测试，但是并不存在泄露\nruleset=🐟 漏网之鱼,[]FINAL\n;设置规则标志位结束\n\n;设置节点分组标志位\ncustom_proxy_group=🚀 手动选择`select`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`.*\ncustom_proxy_group=♻️ 自动选择`select`.*\ncustom_proxy_group=🚀 GitHub`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=📢 谷歌FCM`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点\ncustom_proxy_group=🇬 谷歌服务`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🍎 苹果服务`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=Ⓜ️ 微软服务`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎮 游戏平台`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎮 Steam`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🚀 测速工具`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🐟 漏网之鱼`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🔀 非标端口`select`[]🐟 漏网之鱼`[]🎯 全球直连\ncustom_proxy_group=🇭🇰 香港节点`select`(🇭🇰|港|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|hk|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌)\ncustom_proxy_group=🇺🇸 美国节点`select`(🇺🇸|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|纽纽|亚特兰大|迈阿密|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)\ncustom_proxy_group=🇯🇵 日本节点`select`(🇯🇵|日本|川日|东京|大阪|泉日|埼玉|沪日|深日|(?<!尼|-)日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI)\ncustom_proxy_group=🇸🇬 新加坡节点`select`(🇸🇬|新加坡|坡|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN)\ncustom_proxy_group=🇼🇸 台湾节点`select`(🇹🇼|🇼🇸|台|新北|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC)\ncustom_proxy_group=🇰🇷 韩国节点`select`(🇰🇷|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|首尔|韩|韓|春川|Chuncheon|ICN)\ncustom_proxy_group=🎯 全球直连`select`[]DIRECT\n;设置分组标志位\n\n;下方参数请勿修改\nenable_rule_generator=true\noverwrite_original_rules=true\n\n",
    "gfw": ";Custom_OpenClash_Rules\n;全分组防 DNS 泄漏订阅转换模板\n;作者：https://github.com/Aethersailor\n;项目地址：https://github.com/Aethersailor/Custom_OpenClash_Rules\n;基于 ACL4SSR 模板魔改而来，感谢原作者！\n;<建议>搭配本项目配套设置，实现最佳化的 OpenClash 使用效果！\n;设置方案：https://github.com/Aethersailor/Custom_OpenClash_Rules/wiki/OpenClash-%E8%AE%BE%E7%BD%AE%E6%96%B9%E6%A1%88\n\n[custom]\nruleset=REJECT,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Privacy_Guard_Classical.yaml,28800\n;设置规则标志位\n;以下规则，按照从上往下的顺序遍历，优先命中上位规则，规则重复无影响\n;修改顺序会影响分流效果\nruleset=🚀 手动选择,[]GEOSITE,gfw\nruleset=🚀 手动选择,[]GEOIP,telegram,no-resolve\nruleset=🚀 手动选择,[]GEOIP,facebook,no-resolve\nruleset=🚀 手动选择,[]GEOIP,twitter,no-resolve\nruleset=🎯 全球直连,[]FINAL\n;设置规则标志位结束\n\n;设置节点分组标志位\ncustom_proxy_group=🚀 手动选择`select`[]♻️ 自动选择`.*\ncustom_proxy_group=♻️ 自动选择`select`.*\ncustom_proxy_group=🎯 全球直连`select`[]DIRECT\n;设置分组标志位\n\n;下方参数请勿修改\nenable_rule_generator=true\noverwrite_original_rules=true\n\n",
    "full": ";Custom_OpenClash_Rules\n;全分组防 DNS 泄漏订阅转换模板\n;作者：https://github.com/Aethersailor\n;项目地址：https://github.com/Aethersailor/Custom_OpenClash_Rules\n;基于 ACL4SSR 模板魔改而来，感谢原作者！\n;<建议>搭配本项目配套设置，实现最佳化的 OpenClash 使用效果！\n;设置方案：https://github.com/Aethersailor/Custom_OpenClash_Rules/wiki/OpenClash-%E8%AE%BE%E7%BD%AE%E6%96%B9%E6%A1%88\n\n;本模板为 Full 模板，可以自由添加规则和分组，无性能考量，较为臃肿\n\n[custom]\nruleset=REJECT,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Privacy_Guard_Classical.yaml,28800\n;设置规则标志位\n;以下规则，按照从上往下的顺序遍历，优先命中上位规则，规则重复无影响\n;修改顺序会影响分流效果\n\n;本地地址和域名直连\nruleset=🎯 全球直连,[]GEOSITE,private\nruleset=🎯 全球直连,[]GEOIP,private,no-resolve\n;本项目收录的直连规则\nruleset=🎯 全球直连,clash-domain:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Domain.yaml,28800\nruleset=🎯 全球直连,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Classical_IP.yaml,28800\n;本项目收录的代理规则\nruleset=🚀 手动选择,clash-domain:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Domain.yaml,28800\nruleset=🚀 手动选择,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Classical_IP.yaml,28800\n;谷歌在国内可用的域名直连\nruleset=🎯 全球直连,[]GEOSITE,google-cn\n;国内游戏域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-games@cn\n;Steam 下载 CDN 直连\nruleset=🎯 全球直连,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Steam_CDN_Classical.yaml,28800\n;各大游戏平台下载域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-game-platforms-download\n;BT Tracker 相关域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-public-tracker\n;即时通讯包括了 Telegram/WhatsApp/Line 等海外主流即时通讯软件域名\nruleset=💬 即时通讯,[]GEOSITE,category-communication\n;社交媒体包括了 Twitter(X)/Facebook/Instagram 等海外主流社交媒体\nruleset=🌐 社交媒体,[]GEOSITE,category-social-media-!cn\nruleset=📞 Talkatone,[]GEOSITE,talkatone\nruleset=🤖 ChatGPT,[]GEOSITE,openai\nruleset=💾 OneDrive,[]GEOSITE,onedrive\nruleset=🤖 Copilot,[]GEOSITE,bing\nruleset=🤖 AI服务,[]GEOSITE,category-ai-!cn\nruleset=🚀 GitHub,[]GEOSITE,github\n;测速工具包括 SpeedTest 等主流测速工具域名\nruleset=🚀 测速工具,[]GEOSITE,category-speedtest\nruleset=🎮 Steam,[]GEOSITE,steam\nruleset=📹 YouTube,[]GEOSITE,youtube\nruleset=🎥 AppleTV+,[]GEOSITE,apple-tvplus\nruleset=🍎 苹果服务,[]GEOSITE,apple\nruleset=Ⓜ️ 微软服务,[]GEOSITE,microsoft\nruleset=📢 谷歌FCM,[]GEOSITE,googlefcm\nruleset=🇬 谷歌服务,[]GEOSITE,google\nruleset=🎶 TikTok,[]GEOSITE,tiktok\nruleset=🎥 Netflix,[]GEOSITE,netflix\nruleset=🎥 DisneyPlus,[]GEOSITE,disney\nruleset=🎥 HBO,[]GEOSITE,hbo\nruleset=🎥 PrimeVideo,[]GEOSITE,primevideo\n;Emby 包括主流 Emby 服务相关域名\nruleset=🎥 Emby,[]GEOSITE,category-emby\nruleset=🎻 Spotify,[]GEOSITE,spotify\nruleset=📺 Bahamut,[]GEOSITE,bahamut\nruleset=🎮 游戏平台,[]GEOSITE,category-games\nruleset=🌎 国外媒体,[]GEOSITE,category-entertainment\nruleset=⏬ PT站点,[]GEOSITE,category-pt\nruleset=💳 PayPal,[]GEOSITE,paypal\nruleset=🛒 国外电商,[]GEOSITE,category-ecommerce\nruleset=🚀 手动选择,[]GEOSITE,gfw\nruleset=💬 即时通讯,[]GEOIP,telegram,no-resolve\nruleset=🌐 社交媒体,[]GEOIP,twitter,no-resolve\nruleset=🌐 社交媒体,[]GEOIP,facebook,no-resolve\nruleset=🇬 谷歌服务,[]GEOIP,google,no-resolve\nruleset=🎥 Netflix,[]GEOIP,netflix,no-resolve\n;由于 OpenClash 使用的大陆白名单收录不全，此处留有 geosite:cn 作为国内域名兜底\nruleset=🎯 全球直连,[]GEOSITE,cn\n;由于 OpenClash 使用的大陆白名单收录不全，此处留有 geoip:cn 作为国内 IP 兜底\nruleset=🎯 全球直连,[]GEOIP,cn,no-resolve\n;以上兜底规则会根据实际情况随时取消\n;PT/BT 优化开启会使 80/443 以外端口的流量直连\nruleset=🔀 非标端口,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Port_Direct.yaml,28800\n;国内冷门域名会命中漏网之鱼，如影响使用，请设置漏网之鱼直连\n;漏网之鱼直连时，无法通过 DNS 泄露测试，但是并不存在泄露\nruleset=🐟 漏网之鱼,[]FINAL\n;设置规则标志位结束\n\n;设置节点分组标志位\ncustom_proxy_group=🚀 手动选择`select`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=♻️ 自动选择`select`.*\ncustom_proxy_group=💬 即时通讯`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🌐 社交媒体`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=📞 Talkatone`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🚀 GitHub`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`[]🎯 全球直连`.*\ncustom_proxy_group=🤖 ChatGPT`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🤖 Copilot`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🤖 AI服务`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎶 TikTok`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=📹 YouTube`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎥 Netflix`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎥 DisneyPlus`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎥 HBO`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎥 PrimeVideo`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎥 AppleTV+`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`[]🎯 全球直连`.*\ncustom_proxy_group=🎥 Emby`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎻 Spotify`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=📺 Bahamut`select`[]🇼🇸 台湾节点`[]🚀 手动选择`[]🎯 全球直连\ncustom_proxy_group=🌎 国外媒体`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🛒 国外电商`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=📢 谷歌FCM`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🇬 谷歌服务`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🍎 苹果服务`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=Ⓜ️ 微软服务`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=💾 OneDrive`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=💳 PayPal`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎮 游戏平台`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🎮 Steam`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=⏬ PT站点`select`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`.*\ncustom_proxy_group=🚀 测速工具`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🐟 漏网之鱼`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🇨🇦 加拿大节点`[]🇬🇧 英国节点`[]🇫🇷 法国节点`[]🇩🇪 德国节点`[]🇳🇱 荷兰节点`[]🇹🇷 土耳其节点`[]🇷🇺 俄罗斯节点`[]🌐 其他地区`[]🏠 家宽节点`[]🐢 低倍率节点`.*\ncustom_proxy_group=🔀 非标端口`select`[]🐟 漏网之鱼`[]🎯 全球直连\ncustom_proxy_group=🇭🇰 香港节点`select`(🇭🇰|港|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|hk|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌)\ncustom_proxy_group=🇺🇸 美国节点`select`(🇺🇸|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|纽纽|亚特兰大|迈阿密|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)\ncustom_proxy_group=🇯🇵 日本节点`select`(🇯🇵|日本|川日|东京|大阪|泉日|埼玉|沪日|深日|(?<!尼|-)日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI)\ncustom_proxy_group=🇸🇬 新加坡节点`select`(🇸🇬|新加坡|坡|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN)\ncustom_proxy_group=🇼🇸 台湾节点`select`(🇹🇼|🇼🇸|台|新北|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC)\ncustom_proxy_group=🇰🇷 韩国节点`select`(🇰🇷|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|首尔|韩|韓|春川|Chuncheon|ICN)\ncustom_proxy_group=🇨🇦 加拿大节点`select`(🇨🇦|加拿大|\\bCA(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Canada|CANADA|CAN|渥太华|温哥华|卡尔加里|蒙特利尔|Montreal|YVR|YYZ|YUL)\ncustom_proxy_group=🇬🇧 英国节点`select`(🇬🇧|英国|Britain|United Kingdom|UNITED KINGDOM|England|伦敦|曼彻斯特|Manchester|\\bUK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|GBR|LHR|MAN)\ncustom_proxy_group=🇫🇷 法国节点`select`(🇫🇷|法国|\\bFR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|France|FRANCE|FRA|巴黎|马赛|Marseille|CDG|MRS)\ncustom_proxy_group=🇩🇪 德国节点`select`(🇩🇪|德国|Germany|GERMANY|\\bDE(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|DEU|柏林|法兰克福|慕尼黑|Munich|MUC)\ncustom_proxy_group=🇳🇱 荷兰节点`select`(🇳🇱|荷兰|Netherlands|NETHERLANDS|\\bNL(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|NLD|阿姆斯特丹|AMS)\ncustom_proxy_group=🇹🇷 土耳其节点`select`(🇹🇷|土耳其|Turkey|TURKEY|Türkiye|\\bTR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|TUR|IST|ANK)\ncustom_proxy_group=🇷🇺 俄罗斯节点`select`(🇷🇺|(?<!白)俄罗斯|(?<!白)俄|莫斯科|圣彼得堡|新西伯利亚|海参崴|符拉迪沃斯托克|哈巴罗夫斯克|伯力|\\bRU(?:[-_ ]?\\d+)?\\b|Russia)\ncustom_proxy_group=🌐 其他地区`select`(^(?!.*(港|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|hk|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|🇭🇰|九龙|Kowloon|新界|沙田|荃湾|葵涌|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|纽纽|亚特兰大|迈阿密|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC|🇺🇸|日本|川日|东京|大阪|泉日|埼玉|沪日|深日|(?<!尼|-)日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|🇯🇵|关西|Kansai|KANSAI|新加坡|坡|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN|🇸🇬|台|新北|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC|🇹🇼|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|首尔|韩|韓|春川|Chuncheon|ICN|🇰🇷|加拿大|\\bCA(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Canada|CANADA|CAN|渥太华|温哥华|卡尔加里|蒙特利尔|Montreal|YVR|YYZ|YUL|🇨🇦|英国|Britain|United Kingdom|UNITED KINGDOM|England|伦敦|曼彻斯特|Manchester|\\bUK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|GBR|LHR|MAN|🇬🇧|法国|\\bFR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|France|FRANCE|FRA|巴黎|马赛|Marseille|CDG|MRS|🇫🇷|德国|Germany|GERMANY|\\bDE(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|DEU|柏林|法兰克福|慕尼黑|Munich|MUC|🇩🇪|荷兰|Netherlands|NETHERLANDS|\\bNL(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|NLD|阿姆斯特丹|AMS|🇳🇱|土耳其|Turkey|TURKEY|Türkiye|\\bTR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|TUR|IST|ANK|🇹🇷|🇷🇺|(?<!白)俄罗斯|(?<!白)俄|莫斯科|圣彼得堡|新西伯利亚|海参崴|符拉迪沃斯托克|哈巴罗夫斯克|伯力|\\bRU(?:[-_ ]?\\d+)?\\b|Russia|家宽|家庭宽带|住宅|Residential|低倍率|低倍|(?<![\\d\\.])0?\\.\\d+(?![0-9])(?:x|倍)?|倍率[:： ]?0?\\.\\d+)).*)\ncustom_proxy_group=🏠 家宽节点`select`(家宽|家庭宽带|住宅|Residential)\ncustom_proxy_group=🐢 低倍率节点`select`(低倍率|低倍|(?<![\\d\\.])0?\\.\\d+(?![0-9])(?:x|倍)?|倍率[:： ]?0?\\.\\d+)\ncustom_proxy_group=🎯 全球直连`select`[]DIRECT\n;设置分组标志位\n\n;下方参数请勿修改\nenable_rule_generator=true\noverwrite_original_rules=true\n",
    "mainland": ";Custom_OpenClash_Rules\n;全分组防 DNS 泄漏订阅转换模板\n;作者：https://github.com/Aethersailor\n;项目地址：https://github.com/Aethersailor/Custom_OpenClash_Rules\n;基于 ACL4SSR 模板魔改而来，感谢原作者！\n;<建议>搭配本项目配套设置，实现最佳化的 OpenClash 使用效果！\n;设置方案：https://github.com/Aethersailor/Custom_OpenClash_Rules/wiki/OpenClash-%E8%AE%BE%E7%BD%AE%E6%96%B9%E6%A1%88\n\n[custom]\nruleset=REJECT,clash-classic:https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Privacy_Guard_Classical.yaml,28800\n;设置规则标志位\n;以下规则，按照从上往下的顺序遍历，优先命中上位规则，规则重复无影响\n;修改顺序会影响分流效果\n\n;本地地址和域名直连\nruleset=🎯 全球直连,[]GEOSITE,private\nruleset=🎯 全球直连,[]GEOIP,private,no-resolve\n;本项目收录的直连规则\nruleset=🎯 全球直连,clash-domain:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Domain.yaml,28800\nruleset=🎯 全球直连,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Direct_Classical_IP.yaml,28800\n;本项目收录的代理规则\nruleset=🚀 手动选择,clash-domain:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Domain.yaml,28800\nruleset=🚀 手动选择,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Proxy_Classical_IP.yaml,28800\n;谷歌在国内可用的域名直连\nruleset=🎯 全球直连,[]GEOSITE,google-cn\n;国内游戏域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-games@cn\n;Steam 下载 CDN 直连\nruleset=🎯 全球直连,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Steam_CDN_Classical.yaml,28800\n;各大游戏平台下载域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-game-platforms-download\n;BT Tracker 相关域名直连\nruleset=🎯 全球直连,[]GEOSITE,category-public-tracker\n;即时通讯包括了 Telegram/WhatsApp/Line 等海外主流即时通讯软件域名\nruleset=💬 即时通讯,[]GEOSITE,category-communication\n;社交媒体包括了 Twitter(X)/Facebook/Instagram 等海外主流社交媒体\nruleset=🌐 社交媒体,[]GEOSITE,category-social-media-!cn\nruleset=🤖 ChatGPT,[]GEOSITE,openai\nruleset=🤖 AI服务,[]GEOSITE,category-ai-!cn\nruleset=🚀 GitHub,[]GEOSITE,github\n;测速工具包括 SpeedTest 等主流测速工具域名\nruleset=🚀 测速工具,[]GEOSITE,category-speedtest\nruleset=🎮 Steam,[]GEOSITE,steam\nruleset=📹 YouTube,[]GEOSITE,youtube\nruleset=🎥 AppleTV+,[]GEOSITE,apple-tvplus\nruleset=🍎 苹果服务,[]GEOSITE,apple\nruleset=Ⓜ️ 微软服务,[]GEOSITE,microsoft\nruleset=📢 谷歌FCM,[]GEOSITE,googlefcm\nruleset=🇬 谷歌服务,[]GEOSITE,google\nruleset=🎶 TikTok,[]GEOSITE,tiktok\nruleset=🎥 Netflix,[]GEOSITE,netflix\nruleset=🎥 DisneyPlus,[]GEOSITE,disney\nruleset=🎥 HBO,[]GEOSITE,hbo\nruleset=🎥 PrimeVideo,[]GEOSITE,primevideo\n;Emby 包括主流 Emby 服务相关域名\nruleset=🎥 Emby,[]GEOSITE,category-emby\nruleset=🎻 Spotify,[]GEOSITE,spotify\nruleset=📺 Bahamut,[]GEOSITE,bahamut\nruleset=🎮 游戏平台,[]GEOSITE,category-games\nruleset=🌎 国外媒体,[]GEOSITE,category-entertainment\nruleset=🛒 国外电商,[]GEOSITE,category-ecommerce\nruleset=🚀 手动选择,[]GEOSITE,gfw\nruleset=💬 即时通讯,[]GEOIP,telegram,no-resolve\nruleset=🌐 社交媒体,[]GEOIP,twitter,no-resolve\nruleset=🌐 社交媒体,[]GEOIP,facebook,no-resolve\nruleset=🇬 谷歌服务,[]GEOIP,google,no-resolve\nruleset=🎥 Netflix,[]GEOIP,netflix,no-resolve\n;由于 OpenClash 使用的大陆白名单收录不全，此处留有 geosite:cn 作为国内域名兜底\nruleset=🎯 全球直连,[]GEOSITE,cn\n;由于 OpenClash 使用的大陆白名单收录不全，此处留有 geoip:cn 作为国内 IP 兜底\nruleset=🎯 全球直连,[]GEOIP,cn,no-resolve\n;以上兜底规则会根据实际情况随时取消\n;PT/BT 优化开启会使 80/443 以外端口的流量直连\nruleset=🔀 非标端口,clash-classic:https://testingcf.jsdelivr.net/gh/Aethersailor/Custom_OpenClash_Rules@main/rule/Custom_Port_Direct.yaml,28800\n;国内冷门域名会命中漏网之鱼，如影响使用，请设置漏网之鱼直连\n;漏网之鱼直连时，无法通过 DNS 泄露测试，但是并不存在泄露\nruleset=🐟 漏网之鱼,[]FINAL\n;设置规则标志位结束\n\n;设置节点分组标志位\ncustom_proxy_group=🚀 手动选择`select`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=♻️ 自动选择`select`.*\ncustom_proxy_group=💬 即时通讯`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🎯 全球直连\ncustom_proxy_group=🌐 社交媒体`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🎯 全球直连`.*\ncustom_proxy_group=🚀 GitHub`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🎯 全球直连\ncustom_proxy_group=🤖 ChatGPT`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🤖 AI服务`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎶 TikTok`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=📹 YouTube`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 Netflix`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 DisneyPlus`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 HBO`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 PrimeVideo`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎥 AppleTV+`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇸🇬 新加坡节点`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`[]🎯 全球直连`.*\ncustom_proxy_group=🎥 Emby`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎻 Spotify`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=📺 Bahamut`select`[]🇼🇸 台湾节点`[]🚀 手动选择`[]🎯 全球直连`.*\ncustom_proxy_group=🌎 国外媒体`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🛒 国外电商`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=📢 谷歌FCM`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点\ncustom_proxy_group=🇬 谷歌服务`select`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🍎 苹果服务`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=Ⓜ️ 微软服务`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎮 游戏平台`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🎮 Steam`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🚀 测速工具`select`[]🎯 全球直连`[]🚀 手动选择`[]♻️ 自动选择`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🐟 漏网之鱼`select`[]🚀 手动选择`[]♻️ 自动选择`[]🎯 全球直连`[]🇭🇰 香港节点`[]🇺🇸 美国节点`[]🇯🇵 日本节点`[]🇸🇬 新加坡节点`[]🇼🇸 台湾节点`[]🇰🇷 韩国节点`.*\ncustom_proxy_group=🔀 非标端口`select`[]🐟 漏网之鱼`[]🎯 全球直连\ncustom_proxy_group=🇭🇰 香港节点`select`(🇭🇰|港|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|hk|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌)\ncustom_proxy_group=🇺🇸 美国节点`select`(🇺🇸|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|纽纽|亚特兰大|迈阿密|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC)\ncustom_proxy_group=🇯🇵 日本节点`select`(🇯🇵|日本|川日|东京|大阪|泉日|埼玉|沪日|深日|(?<!尼|-)日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI)\ncustom_proxy_group=🇸🇬 新加坡节点`select`(🇸🇬|新加坡|坡|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN)\ncustom_proxy_group=🇼🇸 台湾节点`select`(🇹🇼|🇼🇸|台|新北|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC)\ncustom_proxy_group=🇰🇷 韩国节点`select`(🇰🇷|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|首尔|韩|韓|春川|Chuncheon|ICN)\ncustom_proxy_group=🎯 全球直连`select`[]DIRECT\n;设置分组标志位\n\n;下方参数请勿修改\nenable_rule_generator=true\noverwrite_original_rules=true\n\n"
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
      "customBodySha256": "6444f53caf051609c384cbb1330270d651440cb0225e2288c2b4ec103ee283d7"
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
      "customBodySha256": "6e009b5ac34e2d7653f4663ef1935bdc245354b2eda628f9924dd8b5632da206"
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
      "customBodySha256": "9dc87f50756d7f3cab9fbed769b894a1e5783b65a8e255a6d3de30dee2000734"
    },
    "disable-account-protected-service": {
      "spec": {
        "schemaVersion": 1,
        "baseProfile": "ai-balanced",
        "disabledNodeRegions": [],
        "onlyNodeRegions": [],
        "preferredNodeRegions": [],
        "disabledServices": [
          "claude"
        ]
      },
      "customBodySha256": "e3b4b9a9793a6452569554c6bdd8e154432075188c8a696ca7c458b9141efaa0"
    },
    "block-direct": {
      "spec": {
        "schemaVersion": 1,
        "baseProfile": "ai-balanced",
        "disabledNodeRegions": [],
        "onlyNodeRegions": [],
        "preferredNodeRegions": [],
        "allowDirect": false
      },
      "customBodySha256": "04a0abf5289c32426c8e4ab952d6c22c5efdf8f8c7c1028d2d0a996e1386d2d7"
    },
    "fail-closed": {
      "spec": {
        "schemaVersion": 1,
        "baseProfile": "ai-balanced",
        "disabledNodeRegions": [],
        "onlyNodeRegions": [],
        "preferredNodeRegions": [],
        "failClosed": true
      },
      "customBodySha256": "b18b4d4274453dbbd8d1b620f63379cc38490f7f58f80e36397125a49f0a9921"
    },
    "service-groups-hk-reordered": {
      "spec": {
        "schemaVersion": 1,
        "baseProfile": "ai-balanced",
        "disabledNodeRegions": [],
        "onlyNodeRegions": [],
        "preferredNodeRegions": [],
        "failClosed": true,
        "serviceGroups": [
          {
            "id": "copilot",
            "name": "🧑‍💻 Copilot",
            "serviceIds": [
              "copilot"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "chatgpt",
            "name": "ChatGPT Plus",
            "serviceIds": [
              "chatgpt"
            ],
            "routes": [
              "us",
              "sg",
              "jp",
              "hk",
              "reject"
            ]
          },
          {
            "id": "claude",
            "name": "🔐 Claude Account Guard",
            "serviceIds": [
              "claude"
            ],
            "routes": [
              "jp",
              "us"
            ]
          },
          {
            "id": "gemini",
            "name": "🤖 Google AI",
            "serviceIds": [
              "gemini",
              "android-studio-ai",
              "vertex-ai"
            ],
            "routes": [
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "notebooklm",
            "name": "🤖 Google AI Tools",
            "serviceIds": [
              "notebooklm",
              "jules",
              "antigravity",
              "google-labs",
              "stitch",
              "gemini-cloud"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "perplexity",
            "name": "🤖 Perplexity",
            "serviceIds": [
              "perplexity"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "grok",
            "name": "🤖 Grok",
            "serviceIds": [
              "grok"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "poe",
            "name": "🤖 Poe",
            "serviceIds": [
              "poe"
            ],
            "routes": [
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "openrouter",
            "name": "🤖 OpenRouter",
            "serviceIds": [
              "openrouter"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "cursor",
            "name": "🤖 Cursor",
            "serviceIds": [
              "cursor"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "huggingface",
            "name": "🤗 Hugging Face",
            "serviceIds": [
              "huggingface"
            ],
            "routes": [
              "us",
              "sg",
              "jp",
              "reject"
            ]
          },
          {
            "id": "mirasim",
            "name": "🤖 Mirasim",
            "serviceIds": [
              "mirasim"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "flow-music",
            "name": "🎵 Flow Music",
            "serviceIds": [
              "flow-music"
            ],
            "routes": [
              "jp",
              "sg",
              "us",
              "reject"
            ]
          },
          {
            "id": "opencode",
            "name": "🤖 OpenCode",
            "serviceIds": [
              "opencode"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          }
        ]
      },
      "customBodySha256": "97c03b1e651a73e24707d59659c0847030fa4768ce2918c57900bc7298dac6a2"
    },
    "service-groups-unassigned-chatgpt": {
      "spec": {
        "schemaVersion": 1,
        "baseProfile": "ai-balanced",
        "disabledNodeRegions": [],
        "onlyNodeRegions": [],
        "preferredNodeRegions": [],
        "preferredServices": [
          "gemini"
        ],
        "serviceGroups": [
          {
            "id": "copilot",
            "name": "🧑‍💻 Copilot",
            "serviceIds": [
              "copilot"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "claude",
            "name": "🔐 Claude Account Guard",
            "serviceIds": [
              "claude"
            ],
            "routes": [
              "jp",
              "us"
            ]
          },
          {
            "id": "gemini",
            "name": "🤖 Google AI",
            "serviceIds": [
              "gemini",
              "android-studio-ai",
              "vertex-ai"
            ],
            "routes": [
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "notebooklm",
            "name": "🤖 Google AI Tools",
            "serviceIds": [
              "notebooklm",
              "jules",
              "antigravity",
              "google-labs",
              "stitch",
              "gemini-cloud"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "perplexity",
            "name": "🤖 Perplexity",
            "serviceIds": [
              "perplexity"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "grok",
            "name": "🤖 Grok",
            "serviceIds": [
              "grok"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "poe",
            "name": "🤖 Poe",
            "serviceIds": [
              "poe"
            ],
            "routes": [
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "openrouter",
            "name": "🤖 OpenRouter",
            "serviceIds": [
              "openrouter"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "cursor",
            "name": "🤖 Cursor",
            "serviceIds": [
              "cursor"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "huggingface",
            "name": "🤗 Hugging Face",
            "serviceIds": [
              "huggingface"
            ],
            "routes": [
              "us",
              "sg",
              "jp",
              "reject"
            ]
          },
          {
            "id": "mirasim",
            "name": "🤖 Mirasim",
            "serviceIds": [
              "mirasim"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          },
          {
            "id": "flow-music",
            "name": "🎵 Flow Music",
            "serviceIds": [
              "flow-music"
            ],
            "routes": [
              "jp",
              "sg",
              "us",
              "reject"
            ]
          },
          {
            "id": "opencode",
            "name": "🤖 OpenCode",
            "serviceIds": [
              "opencode"
            ],
            "routes": [
              "direct",
              "us",
              "jp",
              "sg",
              "tw",
              "kr",
              "other",
              "reject"
            ]
          }
        ]
      },
      "customBodySha256": "99ef3cbff8a7dab8b156dce73a98401a65dcb5385fb8bae432b397104d9d1c2b"
    }
  }
};
