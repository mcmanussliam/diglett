import z, { ZodType } from "zod";

/** Resolve the given function and parse the output through the provided schema */
export function resolveWithSchema<In extends object, Out extends ZodType>(id: string, resolve: () => In, schema: Out): z.infer<Out> {
  const resolved = resolve();
  const parsed = schema.safeParse(resolved);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    throw new Error(`Invalid ${id}:\n${JSON.stringify(tree, undefined, 2)}`);
  }

  return parsed.data;
}