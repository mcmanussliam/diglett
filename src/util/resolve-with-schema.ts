import type { ZodType } from "zod";
import z from "zod";

/**
 * Resolve the given function and parse the output through the provided schema
 *
 * @param id for identifying failing area in error
 * @param resolve function for resolving the value to be validated
 * @param schema for validating the functions result
 *
 * @throws on failing to parse
 *
 * @example
 * export const packageJson = resolveWithSchema(
 *   "Package.json",
 *   () => JSON.parse(readFileSync("package.json").toString()),
 *   packageJsonSchema,
 * );
 */
export function resolveWithSchema<In extends object, Out extends ZodType>(
  id: string,
  resolve: () => In,
  schema: Out,
): z.infer<Out> {
  const resolved = resolve();

  const parsed = schema.safeParse(resolved);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    throw new Error(`Invalid ${id}:\n${JSON.stringify(tree, undefined, 2)}`);
  }

  return parsed.data;
}
