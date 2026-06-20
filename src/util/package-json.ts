import { z } from "zod";
import { resolveWithSchema } from "./resolve-with-schema.js";
import { readFileSync } from "node:fs";

const packageJsonSchema = z.object({
  version: z.string(),
});

export const packageJson = resolveWithSchema('Package.json', () => JSON.parse(readFileSync('package.json').toString()), packageJsonSchema);
