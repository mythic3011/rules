## 2026-10-07 - IPv4 Octal Ambiguity and URL Sanitization in Web Assets
**Vulnerability:** Weak IPv4 regex in `common.js` accepted leading zeros in octets (e.g. `010.0.0.1`), causing parsing ambiguities across tools. `safeUrl` lacked control character filtering and standard URL parser validation.
**Learning:** Dotted-quad IPv4 inputs and HTTP URLs require strict validation against octal ambiguity and control character injection prior to UI rendering or network filtering.
**Prevention:** Reject octets with leading zeros (`part === '0' || !part.startsWith('0')`) and use standard `URL` parser with ASCII control character regex.
