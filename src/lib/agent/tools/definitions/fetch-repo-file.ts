import { github } from "../../../integrations/github.js";
import { defineTool } from "../define-tool.js";

export const fetchRepoFileTool = defineTool({
  name: "fetch_repo_file",
  description:
    "Fetch the contents of a file from the repository being diagnosed. Use this to read CI workflow files, shell scripts, Dockerfiles, and any other code referenced in the logs.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "File path relative to repository root, e.g. '.github/workflows/deploy.yml' or 'scripts/retag.sh'",
      },
    },
    required: ["path"],
  },
  execute: async (input, context) => {
    const path = typeof input.path === "string" ? input.path : "";
    if (!path) {
      return "Missing required tool input: path";
    }

    const result = await github.fetchRepoFile(context.run, path);
    return result.ok && result.value ? result.value : `File not found: ${path}`;
  },
});
