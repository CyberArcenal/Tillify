// src/utils/migrationManager.js

const fs = require("fs").promises;
const path = require("path");
const { app } = require("electron");
const notificationService = require("../../services/NotificationService");


class MigrationManager {
  /**
   * @param {import("typeorm").DataSource} dataSource
   */
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Kunin ang database file path mula sa configuration
   * @returns {string | null}
   */
  _getDatabasePath() {
    const { getDatabaseConfig } = require("../../main/db/database");
    const config = getDatabaseConfig();
    // config.database ang absolute path (sa production) o relative (sa dev)
    // Siguraduhing absolute ang path para sa copyFile
    let dbPath = config.database;
    if (!path.isAbsolute(dbPath)) {
      // Sa dev, relative sa current working directory
      dbPath = path.resolve(process.cwd(), dbPath);
    }
    return dbPath;
  }

  /**
   * Gumawa ng backup ng kasalukuyang database
   * @returns {Promise<{ success: boolean; path?: string; error?: string }>}
   */
  async backupDatabase() {
    const dbPath = this._getDatabasePath();
    if (!dbPath) {
      return { success: false, error: "Could not determine database path" };
    }

    try {
      // Titiyakin na mayroong 'backups' folder sa user data directory
      const userDataPath = app.getPath("userData");
      const backupDir = path.join(userDataPath, "backups");
      await fs.mkdir(backupDir, { recursive: true });

      // Bumuo ng filename: YYYY-MM-DD_HH-mm-ss.db
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const backupFilename = `db-backup-${timestamp}.db`;
      const backupPath = path.join(backupDir, backupFilename);

      // Kopyahin ang database file
      await fs.copyFile(dbPath, backupPath);

      console.log(`✅ Database backup created: ${backupPath}`);
      return { success: true, path: backupPath };
    } catch (error) {
      // @ts-ignore
      const errMsg = error.message;
      console.error("❌ Backup failed:", errMsg);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Simple migration status
   */
  async getMigrationStatus() {
    try {
      // Check if migrations table exists
      const tableExists = await this.dataSource.query("SELECT 1 FROM migrations LIMIT 1")
        .then(() => true)
        .catch(() => false);

      if (!tableExists) {
        return { needsMigration: true, pending: 0, executed: 0 };
      }

      const pending = await this.dataSource.showMigrations();
      const executedCount = await this.dataSource.query("SELECT COUNT(*) as count FROM migrations")
        .then(rows => rows[0].count)
        .catch(() => 0);

      return {
        // @ts-ignore
        needsMigration: pending.length > 0,
        // @ts-ignore
        pending: pending.length,
        executed: executedCount,
      };
    } catch (err) {
      console.warn("Migration status check failed:", err);
      return { needsMigration: true, pending: 0, executed: 0 };
    }
  }

  /**
   * **SIMPLE MIGRATION ONLY** — may backup bago tumakbo
   */
  async runMigrations() {
    // 1. Backup bago mag-migrate
    console.log("📦 Creating database backup before migration...");
    const backupResult = await this.backupDatabase();

    // 2. Magpadala ng in-app notification tungkol sa backup result
    try {
      if (backupResult.success) {
        await notificationService.create({
          userId: 1, // fixed system user
          title: "Database Backup Successful",
          message: `Backup created at ${backupResult.path}`,
          type: "success",
          metadata: { backupPath: backupResult.path }
        }, "system");
      } else {
        await notificationService.create({
          userId: 1,
          title: "Database Backup Failed",
          message: backupResult.error || "Unknown error",
          type: "error",
          metadata: { error: backupResult.error }
        }, "system");
      }
    } catch (notifErr) {
      console.error("Failed to send backup notification:", notifErr);
    }

    // 3. Patakbuhin ang migrations (kahit mag-fail ang backup)
    try {
      console.log("🚀 Running migrations...");
      const result = await this.dataSource.runMigrations({
        transaction: "all", // lahat sa isang transaction para safe
      });

      console.log(`✅ Migration complete! Applied ${result.length} migration(s)`);
      return {
        success: true,
        applied: result.length,
        message: "Database updated successfully"
      };
    } catch (error) {
      // @ts-ignore
      console.error("❌ Migration failed:", error.message);

      // === LIGHT REPAIR: "table already exists" case ===
      // @ts-ignore
      if (error.message.includes("already exists")) {
        console.log("🔧 Detected 'already exists' error. Marking migration as done...");

        try {
          // Kunin yung latest pending migration
          const pending = await this.dataSource.showMigrations();
          // @ts-ignore
          if (pending.length > 0) {
            // @ts-ignore
            const lastPending = pending[pending.length - 1];

            // Manually insert sa migrations table para hindi na ulit
            await this.dataSource.query(`
              INSERT INTO migrations (timestamp, name)
              VALUES (${Date.now()}, '${lastPending.name}')
            `);

            console.log(`✅ Marked "${lastPending.name}" as executed.`);
          }

          return {
            success: true,
            repaired: true,
            message: "Schema already exists. Migration marked as complete."
          };
        } catch (repairErr) {
          console.error("Repair failed:", repairErr);
        }
      }

      return {
        success: false,
        // @ts-ignore
        error: error.message,
        message: "Migration failed. Check console/logs."
      };
    }
  }
}

module.exports = MigrationManager;