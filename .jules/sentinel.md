## 2025-05-18 - Strict IPv4 Octet Validation and Robust URL Scheme Sanitization

**Vulnerability:** IPv4 input validation allowed leading zeros in octets (e.g., `010.0.0.1`), leading to parser ambiguity between octal and decimal representations across system networking libraries. Additionally, `safeUrl` did not strip ASCII control characters prior to URL matching.

**Learning:** Regex `/\d+/` allows octets with leading zeros which JS `Number()` parses as decimal while external tools/parsers may interpret as octal, enabling IP spoofing or ACL/CIDR bypasses. Furthermore, URL validation should strip control characters and utilize the native `URL` constructor rather than rely solely on prefix matching.

**Prevention:** Use `/^(0|[1-9]\d*)$/` for IPv4 octet validation to explicitly reject leading zeros, and sanitize control characters `[\u0000-\u001F\u007F-\u009F]` before URL parsing with `new URL()`.
