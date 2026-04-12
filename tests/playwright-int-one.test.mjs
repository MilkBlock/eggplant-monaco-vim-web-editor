import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const PORT = 41731;
const BASE_URL = `http://${HOST}:${PORT}/?view=math`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the preview server is up.
    }
    await wait(250);
  }
  throw new Error(`preview server did not become ready within ${timeoutMs}ms`);
}

test('math view int_one stays semantic in browser preview', async () => {
  const preview = spawn(
    'npm',
    ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  );

  let stdout = '';
  let stderr = '';
  preview.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  preview.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  let browser;
  try {
    await waitForServer(BASE_URL);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(3_000);

    const intOne = page.getByText('MyTxMath::add_rule("int_one"', { exact: false }).first();
    await intOne.scrollIntoViewIfNeeded();
    await intOne.click();
    await page.waitForTimeout(2_000);

    const mathViewText = await page.locator('.math-view').innerText();

    assert.match(mathViewText, /\bint_one\b/);
    assert.match(mathViewText, /\bone\.n\b/);
    assert.match(mathViewText, /=\s*=\s*1/);
    assert.doesNotMatch(mathViewText, /handle_n/);
    assert.doesNotMatch(mathViewText, /&1_i64/);
  } finally {
    await browser?.close();
    preview.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => preview.once('exit', resolve)),
      wait(5_000),
    ]);
    if (preview.exitCode === null) {
      preview.kill('SIGKILL');
    }
    if (preview.exitCode && preview.exitCode !== 0 && preview.exitCode !== 143) {
      throw new Error(`preview server failed with code ${preview.exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }
  }
});
