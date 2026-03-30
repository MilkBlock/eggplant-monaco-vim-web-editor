let transpilerPromise: Promise<typeof import('./vendor/transpiler-wasm/eggplant_transpiler_wasm_wrapper')> | null = null;

async function loadTranspiler() {
  if (!transpilerPromise) {
    transpilerPromise = import('./vendor/transpiler-wasm/eggplant_transpiler_wasm_wrapper').then(async (module) => {
      await module.default();
      return module;
    });
  }
  return transpilerPromise;
}

export async function transpileEggSource(source: string): Promise<string> {
  const { transpile_egg_to_eggplant } = await loadTranspiler();
  return transpile_egg_to_eggplant(source);
}
