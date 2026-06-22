import { z } from "zod/v3";
import { github } from "../../../../integrations/github.js";
import { defineTool } from "../../define-tool.js";

export const fetchRepoFileTool = defineTool({
  name: "fetch_repo_file",
  description:
    "Fetch the contents of a file from the repository being diagnosed. Use this to read CI workflow files, shell scripts, Dockerfiles, and any other code referenced in the logs.",
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe(
        "File path relative to repository root, e.g. '.github/workflows/deploy.yml' or 'scripts/retag.sh'",
      ),
  }),
  execute: async (input, context) => {
    const result = await github.fetchRepoFile(context.run, input.path);
    return result.ok && result.value ? result.value : `File not found: ${input.path}`;
  },
});
