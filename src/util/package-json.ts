import { readFileSync } from "node:fs";
import { z } from "zod";
import { resolveWithSchema } from "./resolve-with-schema.js";

const packageJsonSchema = z.object({
  version: z.string(),
});

/** Values resolved from the `package.json` */
export const packageJson = resolveWithSchema(
  "Package.json",
  () => JSON.parse(readFileSync("package.json").toString()),
  packageJsonSchema,
);
