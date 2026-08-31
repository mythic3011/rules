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

test('web/site report.html sanitizes dynamic URL schemes before setting href', () => {
  const content = fs.readFileSync(path.join(SITE_DIR, 'report.html'), 'utf8');

  assert.match(
    content,
    /safeUrl\s*\(/,
    'report.html should use a URL scheme sanitizer for dynamic upstream links.'
  );

  assert.match(
    content,
    /\/\^https\?:\\\/\\\//i,
    'report.html URL sanitizer should require http:// or https:// schemes.'
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
