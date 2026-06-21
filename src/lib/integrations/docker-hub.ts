import { err, ok, type Result } from "../../util/result.js";
import { log } from "../logging/logger.js";

const logger = log.child({ name: "docker-hub" });

interface DockerTag {
  name: string;
  last_updated: string;
}

interface DockerTagsResponse {
  results?: DockerTag[];
}

export async function fetchDockerHubTags(image: string): Promise<Result<string>> {
  const [namespace, name] = image.includes("/") ? image.split("/", 2) : ["library", image];
  const url = `https://hub.docker.com/v2/repositories/${namespace}/${name}/tags?page_size=15&ordering=last_updated`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return err(new Error(`Docker Hub returned ${response.status} for ${image}`));
    }

    const data = (await response.json()) as DockerTagsResponse;
    const tags = data.results ?? [];

    const summary = tags.map((t) => `${t.name} (updated ${t.last_updated})`).join("\n");
    logger.debug({ image, count: tags.length }, "docker hub tags fetched");
    return ok(summary || "No tags found");
  } catch (e) {
    logger.warn({ err: e, image }, "failed to fetch docker hub tags");
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
