import { registerAdapter } from "./base.js";

registerAdapter({
  name: "claude",
  command: "claude",
  args: () => ["--print"],
  stdin: (ctx) => ctx.prompt
});
