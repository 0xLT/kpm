import { registerAdapter } from "./base.js";

registerAdapter({
  name: "codex",
  command: "codex",
  args: () => ["exec", "-"],
  stdin: (ctx) => ctx.prompt
});
