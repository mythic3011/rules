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

test('safeUrl strips control characters and strictly validates http/https URLs', () => {
  assert.equal(safeUrl('https://example.com/test'), 'https://example.com/test');
  assert.equal(safeUrl('http://example.com:8080/path'), 'http://example.com:8080/path');
  assert.equal(safeUrl('https://example.com\u0007/test'), 'https://example.com/test');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,test'), null);
  assert.equal(safeUrl('https://'), null);
  assert.equal(safeUrl(null as unknown as string), null);
});

test('isIPv4 strictly rejects octets with leading zeros and invalid values', () => {
  assert.equal(isIPv4('192.168.1.1'), true);
  assert.equal(isIPv4('0.0.0.0'), true);
  assert.equal(isIPv4('255.255.255.255'), true);
  assert.equal(isIPv4('10.0.0.010'), false);
  assert.equal(isIPv4('10.0.0.01'), false);
  assert.equal(isIPv4('10.0.0.00'), false);
  assert.equal(isIPv4('256.0.0.1'), false);
  assert.equal(isIPv4('1.2.3'), false);
  assert.equal(isIPv4('invalid'), false);
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
