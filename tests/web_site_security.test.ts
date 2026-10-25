import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SITE_DIR = path.resolve('web/site');

test('web/site HTML files do not use dangerous innerHTML string interpolation', () => {
  const htmlFiles = fs.readdirSync(SITE_DIR).filter(file => file.endsWith('.html'));

  for (const file of htmlFiles) {
    const fullPath = path.join(SITE_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Assert innerHTML is not used for dynamic string template or concatenation assignment
    assert.doesNotMatch(
      content,
      /\.innerHTML\s*=/,
      `File ${file} contains innerHTML assignment which can introduce XSS risks.`
    );
  }
});

test('isIPv4 strictly rejects octets with leading zeros and invalid lengths', async () => {
  const { isIPv4 } = await import('../web/site/assets/common.js');

  assert.equal(isIPv4('1.1.1.1'), true);
  assert.equal(isIPv4('192.168.0.1'), true);
  assert.equal(isIPv4('0.0.0.0'), true);

  // Rejections
  assert.equal(isIPv4('01.2.3.4'), false, 'Leading zeros in octet must be rejected');
  assert.equal(isIPv4('192.168.01.1'), false, 'Leading zeros in octet must be rejected');
  assert.equal(isIPv4('256.1.1.1'), false);
  assert.equal(isIPv4('1.1.1.1.1'), false);
  assert.equal(isIPv4('1.1.1.1'.repeat(5)), false, 'Overly long string must be rejected');
  assert.equal(isIPv4(null as unknown as string), false);
});

test('safeUrl rejects control chars, enforces max length, and returns the canonical href', async () => {
  const { safeUrl } = await import('../web/site/assets/common.js');

  // Accepted URLs come back as the parser's canonical href
  assert.equal(safeUrl('https://example.com'), 'https://example.com/');
  assert.equal(safeUrl('http://example.com/path?a=1'), 'http://example.com/path?a=1');
  assert.equal(safeUrl('  https://example.com/x  '), 'https://example.com/x');

  // Normalization: scheme/host casing and IDN -> punycode
  assert.equal(safeUrl('HTTPS://EXAMPLE.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('https://bücher.example/'), 'https://xn--bcher-kva.example/');

  // Control characters are rejected, never stripped (fail closed)
  assert.equal(safeUrl('https://example.com\u0000/test'), null);
  assert.equal(safeUrl('https://example.com/\npath'), null);
  assert.equal(safeUrl('https://example.com/\r\npath'), null);
  assert.equal(safeUrl('https://example.com/\tpath'), null);
  assert.equal(safeUrl('https://example.com/\u007Fpath'), null);
  assert.equal(safeUrl('https://example.com/\u0085path'), null);

  // Rejections
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeUrl('file:///etc/passwd'), null);
  assert.equal(safeUrl('ftp://example.com'), null);
  assert.equal(safeUrl('http:\\\\example.com'), null);
  assert.equal(safeUrl('https://' + 'a'.repeat(2050)), null, 'Overly long URL must be rejected');
  assert.equal(safeUrl('not-a-url'), null);
  assert.equal(safeUrl(123 as unknown as string), null);
  assert.equal(safeUrl(null as unknown as string), null);
});

test('rule asset URLs stay within the site dns/ or rule/ directories', async () => {
  const { resolveRuleAssetUrl } = await import('../web/site/assets/common.js');
  const pageUrl = 'https://example.test/project/ip-lookup.html';

  assert.equal(
    resolveRuleAssetUrl('dns/adblock.hosts.txt', pageUrl),
    'https://example.test/project/dns/adblock.hosts.txt'
  );
  assert.equal(
    resolveRuleAssetUrl('rule/Custom_Direct_Classical_IP.yaml', pageUrl),
    'https://example.test/project/rule/Custom_Direct_Classical_IP.yaml'
  );

  for (const assetPath of [
    '../secrets.txt',
    'dns/../rule/secret.yaml',
    'dns/%2e%2e/secret.txt',
    'dns/%252e%252e/secret.txt',
    '/dns/absolute.txt',
    '\\\\evil.test\\asset.txt',
    'https://evil.test/asset.txt',
    '//evil.test/asset.txt',
    'dns/file.txt?next=//evil.test',
    'dns/file.txt#fragment',
    'reports/file.json',
    'dns//file.txt',
    'dns/./file.txt',
    'dns/file name.txt',
    'dns/file.txt\u0000',
    'dns/file.txt\n',
  ]) {
    assert.equal(resolveRuleAssetUrl(assetPath, pageUrl), null, `Rejected ${JSON.stringify(assetPath)}`);
  }

  assert.equal(resolveRuleAssetUrl('dns/file.txt', 'javascript:alert(1)'), null);
});

test('report summary URLs validate category slugs before resolving a local report path', async () => {
  const { resolveReportSummaryUrl } = await import('../web/site/assets/common.js');
  const pageUrl = 'https://example.test/project/report.html?category=adblock';

  assert.equal(
    resolveReportSummaryUrl('adblock', pageUrl),
    'https://example.test/project/reports/adblock.summary.json'
  );
  assert.equal(
    resolveReportSummaryUrl('tracking-v2_1', pageUrl),
    'https://example.test/project/reports/tracking-v2_1.summary.json'
  );

  for (const category of [
    '../secrets',
    '..%2fsecrets',
    'adblock/../../secrets',
    'https://evil.test/adblock',
    'adblock?next=//evil.test',
    'adblock#fragment',
    ' adblock',
    'adblock\n',
    '',
    'x'.repeat(64),
  ]) {
    assert.equal(resolveReportSummaryUrl(category, pageUrl), null, `Rejected ${JSON.stringify(category)}`);
  }

  assert.equal(resolveReportSummaryUrl('adblock', 'file:///project/report.html'), null);
});

test('web/site report page sanitizes dynamic URL schemes before setting href', () => {
  const htmlContent = fs.readFileSync(path.join(SITE_DIR, 'report.html'), 'utf8');
  let jsContent = '';
  const assetsDir = path.join(SITE_DIR, 'assets');
  if (fs.existsSync(assetsDir)) {
    jsContent = fs
      .readdirSync(assetsDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8'))
      .join('\n');
  }
  const content = htmlContent + '\n' + jsContent;

  assert.match(
    content,
    /safeUrl\s*\(/,
    'report page should use a URL scheme sanitizer for dynamic upstream links.'
  );

  assert.match(
    content,
    /\/\^https\?:\\\/\\\//i,
    'report page URL sanitizer should require http:// or https:// schemes.'
  );
});

test('web/site report page sets rel="noopener noreferrer" and target="_blank" on dynamic links', () => {
  const jsContent = fs.readFileSync(path.join(SITE_DIR, 'assets', 'report.js'), 'utf8');

  assert.match(
    jsContent,
    /link\.rel\s*=\s*['"]noopener noreferrer['"]/,
    'report page should set rel="noopener noreferrer" on dynamic upstream links.'
  );

  assert.match(
    jsContent,
    /link\.target\s*=\s*['"]_blank['"]/,
    'report page should set target="_blank" on dynamic upstream links.'
  );
});

test('web/site HTML files include Pico CSS framework', () => {
  const htmlFiles = fs.readdirSync(SITE_DIR).filter(file => file.endsWith('.html'));

  for (const file of htmlFiles) {
    const fullPath = path.join(SITE_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    assert.match(
      content,
      /pico(?:\.min)?\.css/,
      `File ${file} should reference the Pico CSS framework stylesheet.`
    );
  }
});
