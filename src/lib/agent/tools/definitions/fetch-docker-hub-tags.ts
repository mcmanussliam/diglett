import { fetchDockerHubTags } from "../../../integrations/docker-hub.js";
import { defineTool } from "../define-tool.js";

export const fetchDockerHubTagsTool = defineTool({
  name: "fetch_docker_hub_tags",
  description:
    "Fetch recent tags for a Docker Hub image. Use this when logs or code reference Docker image pulls without a pinned digest.",
  inputSchema: {
    type: "object",
    properties: {
      image: {
        type: "string",
        description:
          "Image name. For official images use 'library/alpine', for others use 'namespace/image'",
      },
    },
    required: ["image"],
  },
  execute: async (input) => {
    const image = typeof input.image === "string" ? input.image : "";
    if (!image) {
      return "Missing required tool input: image";
    }

    const result = await fetchDockerHubTags(image);
    return result.ok ? result.value : `Failed to fetch Docker tags: ${result.error.message}`;
  },
});
