import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const PORT = 41731;
const BASE_URL = `http://${HOST}:${PORT}/?view=math`;
const SAMPLE_ROOT = path.join(process.cwd(), 'src', 'samples');
const SAMPLE_FILES = [
  { id: 'math_microbenchmark', label: 'math_microbenchmark.rs' },
  { id: 'complex', label: 'complex.rs' },
  { id: 'pattern_samples', label: 'pattern_samples.rs' },
  { id: 'fibonacci_func', label: 'fibonacci_func.rs' },
  { id: 'relation', label: 'relation.rs' },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRules(sampleLabel) {
  const source = fs.readFileSync(path.join(SAMPLE_ROOT, sampleLabel), 'utf8');
  return [...source.matchAll(/add_rule(?:_with_hook)?\(\s*"([^"]+)"/g)].map((match) => ({
    name: match[1],
    line: source.slice(0, match.index).split('\n').length,
  }));
}

async function selectSample(page, sampleId) {
  await page.locator('select.sample-select').selectOption(sampleId);
  await page.waitForTimeout(1_200);
}

async function selectRuleLine(page, line) {
  await page.evaluate((lineNumber) => {
    const editor = window.monaco.editor.getEditors()[1];
    editor.setPosition({ lineNumber, column: 5 });
    editor.setSelection({
      startLineNumber: lineNumber,
      startColumn: 5,
      endLineNumber: lineNumber,
      endColumn: 5,
    });
    editor.focus();
  }, line);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(1_200);
}

async function waitForMathFormulaSettled(page) {
  await page.waitForFunction(() => {
    const view = document.querySelector('.math-view');
    if (!view) {
      return false;
    }
    const text = view.textContent || '';
    if (text.includes('Typst: pending')) {
      return false;
    }
    return view.querySelector('.math-formula-svg-inner svg') || text.includes('Typst: fallback text');
  }, undefined, { timeout: 15_000 });
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

test('math view keeps typst rendering for every sample rule', async () => {
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

    for (const sample of SAMPLE_FILES) {
      await selectSample(page, sample.id);
      for (const rule of readRules(sample.label)) {
        await selectRuleLine(page, rule.line);
        await waitForMathFormulaSettled(page);
        const mathViewText = await page.locator('.math-view').innerText();
        const svgCount = await page.locator('.math-formula-svg-inner svg').count();

        assert.match(mathViewText, new RegExp(`\\b${rule.name}\\b`), `${sample.label}:${rule.name} did not become the active rule`);
        assert.doesNotMatch(mathViewText, /Typst: fallback text/, `${sample.label}:${rule.name} fell back to text rendering`);
        assert.ok(svgCount > 0, `${sample.label}:${rule.name} did not produce a math formula svg`);
      }
    }
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
