import { err, ok, type Result } from "../../util/result.js";
import { log } from "../logging/logger.js";

interface DockerTag {
  name: string;
  last_updated: string;
}

interface DockerTagsResponse {
  results?: DockerTag[];
}

function init() {
  const logger = log.child({ name: 'docker' });
  const baseUrl = 'https://hub.docker.com';

  async function tags(image: string): Promise<Result<string>> {
    const [namespace, name] = image.includes("/") ? image.split("/", 2) : ["library", image];
    const url = `${baseUrl}/v2/repositories/${namespace}/${name}/tags?page_size=15&ordering=last_updated`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return err(new Error(`Docker Hub returned ${response.status} for ${image}`));
      }

      const data = await response.json() as DockerTagsResponse;
      const tags = data.results ?? [];

      const summary = tags.map((t) => `${t.name} (updated ${t.last_updated})`).join("\n");
      logger.debug({ image, count: tags.length }, "Docker hub tags fetched");
      return ok(summary || "No tags found");

    } catch (e) {
      logger.warn({ err: e, image }, "Failed to fetch docker hub tags");
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  return {tags};
}

export const docker = init();

