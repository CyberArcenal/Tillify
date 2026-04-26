
const { AuditLog } = require('../entities/AuditLog');

// const { auditTrailEnabled } = require('./system');



class AuditLogger {
  constructor() {
    this.repository = null;
  }

  async initialize() {
    const { AppDataSource } = require('../main/db/datasource');
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    this.repository = AppDataSource.getRepository(AuditLog);
    console.log('AuditLogger initialized');
  }

  /**
   * Log an audit event
   * @param {Object} params - Audit log parameters
   * @param {string} params.action - Action type (CREATE, UPDATE, DELETE, VIEW, etc.)
   * @param {string} params.entity - Entity name (Room, Booking, Guest)
   * @param {number|string} params.entityId - ID of the affected entity
   * @param {Object} params.oldData - Previous data (optional)
   * @param {Object} params.newData - New data (optional)
   * @param {string} params.user - User who performed the action (optional)
   * @param {string} params.ipAddress - IP address (optional)
   * @param {string} params.userAgent - User agent/browser info (optional)
   * @param {string} params.description - Custom description (optional)
   */
  async log({
    action,
    entity,
    entityId,
    // @ts-ignore
    oldData = null,
    // @ts-ignore
    newData = null,
    user = 'system',
    // @ts-ignore
    ipAddress = null,
    // @ts-ignore
    userAgent = null,
    // @ts-ignore
    description = null
  }) {
    try {
      if (!this.repository) {
        await this.initialize();
      }

      // if(!await auditTrailEnabled())return;

      // @ts-ignore
      const auditLog = this.repository.create({
        action,
        entity,
        entityId: entityId ? Number(entityId) : null,
        previousData: oldData ? JSON.stringify(oldData) : null,
        newData: newData ? JSON.stringify(newData) : null,
        user,
        ipAddress,
        userAgent,
        description,
        timestamp: new Date()
      });

      // @ts-ignore
      await this.repository?.save(auditLog);
      
      // console.log(`[AUDIT] ${action} on ${entity}${entityId ? ` #${entityId}` : ''} by ${user}`);
      
      return auditLog;
    } catch (error) {
      // Don't break the app if audit logging fails
      // @ts-ignore
      console.error('Audit logging failed:', error.message);
      return null;
    }
  }

  /**
   * Log creation of an entity
   */
  // @ts-ignore
  async logCreate(entity, entityId, newData, user = 'system') {
    // @ts-ignore
    return this.log({
      action: 'CREATE',
      entity,
      entityId,
      newData,
      user
    });
  }

  /**
   * Log update of an entity
   */
  // @ts-ignore
  async logUpdate(entity, entityId, oldData, newData, user = 'system') {
    // @ts-ignore
    return this.log({
      action: 'UPDATE',
      entity,
      entityId,
      oldData,
      newData,
      user
    });
  }

  /**
   * Log deletion of an entity
   */
  // @ts-ignore
  async logDelete(entity, entityId, oldData, user = 'system') {
    // @ts-ignore
    return this.log({
      action: 'DELETE',
      entity,
      entityId,
      oldData,
      user
    });
  }

  /**
   * Log view/access of an entity
   */
  // @ts-ignore
  async logView(entity, entityId = null, user = 'system') {
    return this.log({
      action: 'VIEW',
      entity,
      // @ts-ignore
      entityId,
      user
    });
  }

  /**
   * Log export action
   */
  // @ts-ignore
  async logExport(entity, format, filters = null, user = 'system') {
    // @ts-ignore
    return this.log({
      action: 'EXPORT',
      entity,
      newData: { format, filters },
      user
    });
  }

  /**
   * Get audit logs with filters
   */
  async getLogs({
    entity = null,
    entityId = null,
    action = null,
    user = null,
    startDate = null,
    endDate = null,
    page = 1,
    limit = 50
  }) {
    try {
      if (!this.repository) {
        await this.initialize();
      }

      // @ts-ignore
      const queryBuilder = this.repository.createQueryBuilder('log');

      // Apply filters
      if (entity) {
        queryBuilder.andWhere('log.entity = :entity', { entity });
      }
      if (entityId) {
        queryBuilder.andWhere('log.entityId = :entityId', { entityId: Number(entityId) });
      }
      if (action) {
        queryBuilder.andWhere('log.action = :action', { action });
      }
      if (user) {
        queryBuilder.andWhere('log.user LIKE :user', { user: `%${user}%` });
      }
      if (startDate) {
        queryBuilder.andWhere('log.timestamp >= :startDate', { startDate });
      }
      if (endDate) {
        queryBuilder.andWhere('log.timestamp <= :endDate', { endDate });
      }

      // Pagination
      const offset = (page - 1) * limit;
      queryBuilder
        .orderBy('log.timestamp', 'DESC')
        .skip(offset)
        .take(limit);

      const [logs, total] = await queryBuilder.getManyAndCount();

      return {
        logs: logs.map(log => ({
          ...log,
          // @ts-ignore
          previousData: log.previousData ? JSON.parse(log.previousData) : null,
          // @ts-ignore
          newData: log.newData ? JSON.parse(log.newData) : null
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      throw error;
    }
  }

  /**
   * Clear old audit logs (housekeeping)
   */
  async clearOldLogs(daysToKeep = 365) {
    try {
      if (!this.repository) {
        await this.initialize();
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // @ts-ignore
      const result = await this.repository
        .createQueryBuilder()
        .delete()
        .where('timestamp < :cutoffDate', { cutoffDate })
        .execute();

      console.log(`Cleared ${result.affected} audit logs older than ${daysToKeep} days`);
      return result.affected;
    } catch (error) {
      console.error('Failed to clear old audit logs:', error);
      throw error;
    }
  }
}

// Create singleton instance
const auditLogger = new AuditLogger();

module.exports = auditLogger;