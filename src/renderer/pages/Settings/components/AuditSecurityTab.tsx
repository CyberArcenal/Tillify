import React from "react";
import type { AuditSecuritySettings } from "../../../api/utils/system_config";

interface Props {
  settings: AuditSecuritySettings;
  onUpdate: (field: keyof AuditSecuritySettings, value: any) => void;
}

const AuditSecurityTab: React.FC<Props> = ({ settings, onUpdate }) => {
  const handleLogEventsChange = (value: string) => {
    const events = value
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    onUpdate("log_events", events);
  };

  // Safely convert log_events to a display string
  const getLogEventsDisplay = (): string => {
    const logEvents = settings.log_events;
    if (Array.isArray(logEvents)) {
      return logEvents.join(", ");
    }
    if (typeof logEvents === "string") {
      // Try to parse as JSON, fallback to raw string
      try {
        const parsed = JSON.parse(logEvents);
        if (Array.isArray(parsed)) {
          return parsed.join(", ");
        }
      } catch {
        // Not JSON, return as is (may be comma-separated)
        return logEvents;
      }
    }
    // Default placeholder
    return "login, logout, create, update, delete";
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
        Audit & Security Settings
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="audit_log_enabled"
            checked={settings.audit_log_enabled || false}
            onChange={(e) => onUpdate("audit_log_enabled", e.target.checked)}
            className="windows-checkbox"
          />
          <label
            htmlFor="audit_log_enabled"
            className="text-sm text-[var(--text-secondary)]"
          >
            Enable Audit Log
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            Log Retention (days)
          </label>
          <input
            type="number"
            value={settings.log_retention_days ?? 30}
            onChange={(e) =>
              onUpdate("log_retention_days", parseInt(e.target.value) || 0)
            }
            className="windows-input w-full"
            min="0"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            Log Events (comma separated)
          </label>
          <input
            type="text"
            value={getLogEventsDisplay()}
            onChange={(e) => handleLogEventsChange(e.target.value)}
            className="windows-input w-full"
            placeholder="login, logout, create, update, delete"
          />
        </div>
      </div>
    </div>
  );
};

export default AuditSecurityTab;
