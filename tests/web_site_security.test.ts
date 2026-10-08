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

test('common.js safeUrl validates http/https URLs and rejects control characters', async () => {
  // @ts-expect-error common.js does not have type definitions
  const { safeUrl } = await import('../web/site/assets/common.js');

  assert.equal(safeUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeUrl('http://example.org'), 'http://example.org/');
  assert.equal(safeUrl('  https://example.com  '), 'https://example.com/');

  // Reject non-http/https schemes
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('ftp://example.com'), null);
  assert.equal(safeUrl('file:///etc/passwd'), null);

  // Reject control characters
  assert.equal(safeUrl('https://example.com\r\nHeader: value'), null);
  assert.equal(safeUrl('https://example.com\u0000bad'), null);

  // Reject non-string or malformed inputs
  assert.equal(safeUrl(123), null);
  assert.equal(safeUrl('https://'), null);
});

test('common.js isIPv4 validates dotted quad and rejects leading zeros', async () => {
  // @ts-expect-error common.js does not have type definitions
  const { isIPv4 } = await import('../web/site/assets/common.js');

  // Valid IPv4 addresses
  assert.equal(isIPv4('192.168.1.1'), true);
  assert.equal(isIPv4('0.0.0.0'), true);
  assert.equal(isIPv4('255.255.255.255'), true);

  // Reject leading zeros in octets (octal ambiguity)
  assert.equal(isIPv4('010.0.0.1'), false);
  assert.equal(isIPv4('192.168.01.1'), false);
  assert.equal(isIPv4('00.0.0.0'), false);

  // Reject out of range or malformed IPs
  assert.equal(isIPv4('256.0.0.1'), false);
  assert.equal(isIPv4('1.2.3'), false);
  assert.equal(isIPv4('1.2.3.4.5'), false);
  assert.equal(isIPv4('abc.def.ghi.jkl'), false);
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
