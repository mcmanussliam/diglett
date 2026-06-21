// TODO: After hackathon consider migrating to a remote postgres instance for multi-server support.

import type { Installation, InstallationQuery, InstallationStore } from "@slack/bolt";
import Database from "better-sqlite3";
import { env } from "../../util/env.js";
import { err, ok, type Result } from "../../util/result.js";
import { log } from "../logging/logger.js";

function installationKey(query: InstallationQuery<boolean>): string {
  if (query.isEnterpriseInstall && query.enterpriseId) {
    return `enterprise:${query.enterpriseId}`;
  }

  return `team:${query.teamId}`;
}

export class SqliteInstallationStore implements InstallationStore {
  private readonly db: Database.Database;

  private readonly logger = log.child({ name: "installation-store" });

  private readonly upsert: Database.Statement;

  private readonly fetchStmt: Database.Statement<[string], { installation: string }>;

  private readonly deleteStmt: Database.Statement;

  constructor() {
    this.db = new Database(env.DB_PATH);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS installations (
        id TEXT PRIMARY KEY,
        installation TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    this.upsert = this.db.prepare(
      "INSERT INTO installations (id, installation) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET installation = excluded.installation",
    );

    this.fetchStmt = this.db.prepare<[string], { installation: string }>(
      "SELECT installation FROM installations WHERE id = ?",
    );

    this.deleteStmt = this.db.prepare("DELETE FROM installations WHERE id = ?");

    this.logger.info({ path: env.DB_PATH }, "sqlite installation store ready");
  }

  async storeInstallation(installation: Installation): Promise<void> {
    const key =
      installation.isEnterpriseInstall && installation.enterprise?.id
        ? `enterprise:${installation.enterprise.id}`
        : `team:${installation.team?.id}`;

    this.upsert.run(key, JSON.stringify(installation));
    this.logger.debug({ key }, "installation stored");
  }

  async fetchInstallation(query: InstallationQuery<boolean>): Promise<Installation> {
    const key = installationKey(query);
    const row = this.fetchStmt.get(key);

    if (!row) {
      throw new Error(`No installation found for ${key}`);
    }

    this.logger.debug({ key }, "installation fetched");
    return JSON.parse(row.installation) as Installation;
  }

  async deleteInstallation(query: InstallationQuery<boolean>): Promise<void> {
    const key = installationKey(query);
    this.deleteStmt.run(key);
    this.logger.debug({ key }, "installation deleted");
  }

  fetchUserToken(teamId: string): Result<string | undefined> {
    try {
      const row = this.fetchStmt.get(`team:${teamId}`);
      if (!row) {
        return err(new Error(`No installation found for team:${teamId}`));
      }
      const installation = JSON.parse(row.installation) as Installation;
      return ok(installation.user.token);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
