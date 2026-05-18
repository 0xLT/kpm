import { registerAdapter } from "./base.js";

registerAdapter({
  name: "gemini",
  command: "gemini",
  args: () => ["--prompt", "-"],
  stdin: (ctx) => ctx.prompt
});
