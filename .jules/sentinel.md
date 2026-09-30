# Sentinel Security Journal

## 2025-05-18 - Strict WHATWG URL Parsing and Control Character Stripping for Dynamic Links
**Vulnerability:** Regex-only protocol validation allowed malformed URLs and potential control character injection in dynamic hyperlinks.
**Learning:** Basic regex checks like `/^https?:\/\//i` do not ensure that the URL is parseable by standard URL standard implementations or free of ASCII control characters (`\u0000-\u001F\u007F-\u009F`).
**Prevention:** Always strip control characters and pass input through standard `new URL(...)` parsing, validating `parsed.protocol === 'http:' || parsed.protocol === 'https:'`.
