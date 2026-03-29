import type { PatternIr } from '@eggplant-vscode/ir';
import initExtractor, {
  extract_pattern_json as extractPatternJson,
} from './vendor/extractor-wasm/eggplant-pattern-extractor';

let extractorInitPromise: Promise<unknown> | null = null;

async function ensureExtractorInitialized(): Promise<void> {
  if (!extractorInitPromise) {
    extractorInitPromise = initExtractor();
  }
  await extractorInitPromise;
}

export async function extractPatternIr(source: string, byteOffset: number): Promise<PatternIr> {
  await ensureExtractorInitialized();
  const clampedOffset = Math.max(0, Math.min(byteOffset, new TextEncoder().encode(source).length));
  const json = extractPatternJson(source, clampedOffset, '2024');
  return JSON.parse(json) as PatternIr;
}
