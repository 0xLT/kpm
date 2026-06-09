export type AdapterContext = { vault: string; prompt: string };

export type LlmAdapter = {
  name: string;
  command: string;
  args: (ctx: AdapterContext) => string[];
  stdin?: (ctx: AdapterContext) => string;
};

const REGISTRY = new Map<string, LlmAdapter>();

export function registerAdapter(adapter: LlmAdapter): void {
  REGISTRY.set(adapter.name, adapter);
}

export function getAdapter(name: string): LlmAdapter {
  const adapter = REGISTRY.get(name);
  if (!adapter) {
    throw new Error(`unknown LLM adapter: ${name}`);
  }
  return adapter;
}
