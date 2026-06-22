import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { memoise } from "./memoise.js";

/** Load the versioned system prompt once per process. */
export const getSystemPrompt = memoise(() =>
  readFile(join(process.cwd(), "prompts/system.md"), "utf8"),
);
