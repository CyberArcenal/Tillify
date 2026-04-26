// src/scheduler/auditTrailCleanupScheduler.js


const { AppDataSource } = require("../main/db/datasource");
const { logger } = require("../utils/logger");
const { auditLogEnabled, logRetentionDays } = require("../utils/system");

class AuditTrailCleanupScheduler {
  constructor() {
    this.checkInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds (once a day)
    this.isEnabled = true;
    this.intervalId = null;
  }

  async start() {
    try {
      // Check if audit log is enabled globally
      this.isEnabled = await auditLogEnabled();

      if (!this.isEnabled) {
        logger.info(
          "⏸️  Audit Trail Cleanup Scheduler is disabled (audit log disabled)",
        );
        return this;
      }

      logger.info("🚀 Starting Audit Trail Cleanup Scheduler...");

      // Initial run
      await this.cleanupOldAuditTrails();

      // Set up periodic cleanup (once a day)
      this.intervalId = setInterval(async () => {
        await this.cleanupOldAuditTrails();
      }, this.checkInterval);

      // @ts-ignore
      logger.info("✅ Audit Trail Cleanup Scheduler Started", {
        checkInterval: `${this.checkInterval / (1000 * 60 * 60)} hours`,
      });

      return this;
    } catch (error) {
      // @ts-ignore
      logger.error("❌ Failed to start Audit Trail Cleanup Scheduler:", error);
      throw error;
    }
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("🛑 Audit Trail Cleanup Scheduler Stopped");
    }
  }

  async cleanupOldAuditTrails() {
    try {
      // Check if still enabled
      this.isEnabled = await auditLogEnabled();
      if (!this.isEnabled) {
        logger.debug("[AUDIT CLEANUP] Audit log is disabled, skipping cleanup");
        return;
      }

      // Get retention days from settings
      const retentionDays = await logRetentionDays();

      // Calculate cutoff date (current date minus retention days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      logger.info(
        `[AUDIT CLEANUP] Cleaning up audit trails older than ${retentionDays} days (before ${cutoffDate.toISOString()})`,
      );

      const auditTrailRepo = AppDataSource.getRepository("AuditTrail");

      // Count records to be deleted (for logging)
      const count = await auditTrailRepo
        .createQueryBuilder("audit_trail")
        .where("audit_trail.timestamp < :cutoffDate", {
          cutoffDate: cutoffDate.toISOString(),
        })
        .getCount();

      if (count === 0) {
        logger.debug("[AUDIT CLEANUP] No old audit trail records to delete");
        return;
      }

      // Delete old records
      const result = await auditTrailRepo
        .createQueryBuilder("audit_trail")
        .where("audit_trail.timestamp < :cutoffDate", {
          cutoffDate: cutoffDate.toISOString(),
        })
        .delete()
        .execute();

      logger.info(
        `✅ Deleted ${result.affected || 0} audit trail records older than ${retentionDays} days`,
      );

      // Log the cleanup action itself to audit trail
      await this.logCleanupAction(retentionDays, result.affected || 0);
    } catch (error) {
      // @ts-ignore
      logger.error("❌ Error during audit trail cleanup:", error);
    }
  }

  /**
   * @param {number} retentionDays
   * @param {number} deletedCount
   */
  async logCleanupAction(retentionDays, deletedCount) {
    try {
      const auditTrailRepo = AppDataSource.getRepository("AuditTrail");

      // Get system user or default user ID
      const userRepo = AppDataSource.getRepository("User");
      const systemUser = await userRepo.findOne({
        where: {
          is_deleted: false,
          username: "system", // or find admin user
        },
      });

      const auditEntry = auditTrailRepo.create({
        action: "AUDIT_CLEANUP",
        entity: "AuditTrail",
        entity_id: 0, // Not applicable
        details: JSON.stringify({
          retention_days: retentionDays,
          deleted_count: deletedCount,
          cutoff_date: new Date(
            Date.now() - retentionDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
        user_id: systemUser ? systemUser.id : 1, // Default to first admin user
        timestamp: new Date(),
      });

      await auditTrailRepo.save(auditEntry);
    } catch (error) {
      // @ts-ignore
      logger.warn("Could not log audit cleanup action:", error);
    }
  }

  /**
   * Force immediate cleanup (manual trigger)
   */
  async forceCleanup() {
    logger.info("🔄 Force audit trail cleanup triggered");
    await this.cleanupOldAuditTrails();
  }

  /**
   * Get current scheduler status
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isRunning: !!this.intervalId,
      checkInterval: this.checkInterval,
      lastRun: new Date(),
      nextRun: this.intervalId
        ? new Date(Date.now() + this.checkInterval)
        : null,
    };
  }

  /**
   * Update configuration dynamically
   */
  async updateConfig() {
    this.isEnabled = await auditLogEnabled();
    logger.info("🔄 Updated audit cleanup configuration from system settings");
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats() {
    try {
      const auditTrailRepo = AppDataSource.getRepository("AuditTrail");
      const retentionDays = await logRetentionDays();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Count records that would be deleted
      const oldRecordsCount = await auditTrailRepo
        .createQueryBuilder("audit_trail")
        .where("audit_trail.timestamp < :cutoffDate", {
          cutoffDate: cutoffDate.toISOString(),
        })
        .getCount();

      // Total count
      const totalCount = await auditTrailRepo.count();

      // Oldest record
      const oldestRecord = await auditTrailRepo
        .createQueryBuilder("audit_trail")
        .select("MIN(audit_trail.timestamp)", "oldest")
        .getRawOne();

      return {
        total_records: totalCount,
        old_records_to_delete: oldRecordsCount,
        retention_days: retentionDays,
        cutoff_date: cutoffDate.toISOString(),
        oldest_record_date: oldestRecord.oldest,
        cleanup_enabled: this.isEnabled,
      };
    } catch (error) {
      // @ts-ignore
      logger.error("Error getting cleanup stats:", error);
      return null;
    }
  }
}

module.exports = AuditTrailCleanupScheduler;
