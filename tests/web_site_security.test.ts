import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { safeUrl, isIPv4 } from '../web/site/assets/common.js';

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

test('safeUrl utility sanitizes control characters and enforces valid http/https URLs', () => {
  assert.equal(safeUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeUrl('http://example.org?q=1'), 'http://example.org/?q=1');
  assert.equal(safeUrl('https://example.com/path\r\n'), 'https://example.com/path');
  assert.equal(safeUrl('https://example.com\r\nHeader: injected'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,test'), null);
  assert.equal(safeUrl('https://'), null);
  assert.equal(safeUrl(123), null);
  assert.equal(safeUrl(null), null);
});

test('isIPv4 utility strictly validates IPv4 format and rejects leading zeros', () => {
  assert.equal(isIPv4('192.168.1.1'), true);
  assert.equal(isIPv4('0.0.0.0'), true);
  assert.equal(isIPv4('255.255.255.255'), true);
  assert.equal(isIPv4('010.0.0.1'), false);
  assert.equal(isIPv4('192.168.1.256'), false);
  assert.equal(isIPv4('abc.def.ghi.jkl'), false);
  assert.equal(isIPv4('192.168.1'), false);
  assert.equal(isIPv4(12345), false);
  assert.equal(isIPv4(null), false);
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
