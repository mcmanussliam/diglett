import { z } from "zod/v3";
import { fetchDockerHubTags } from "../../../integrations/docker-hub.js";
import { defineTool } from "../define-tool.js";

export const fetchDockerHubTagsTool = defineTool({
  name: "fetch_docker_hub_tags",
  description:
    "Fetch recent tags for a Docker Hub image. Use this when logs or code reference Docker image pulls without a pinned digest.",
  inputSchema: z.object({
    image: z
      .string()
      .min(1)
      .describe(
        "Image name. For official images use 'library/alpine', for others use 'namespace/image'",
      ),
  }),
  execute: async (input) => {
    const result = await fetchDockerHubTags(input.image);
    return result.ok ? result.value : `Failed to fetch Docker tags: ${result.error.message}`;
  },
});
