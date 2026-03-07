// src/renderer/pages/Settings/components/InventoryTab.tsx
import React from "react";
import type { InventorySettings } from "../../../api/utils/system_config";

interface Props {
  settings: InventorySettings;
  onUpdate: (field: keyof InventorySettings, value: any) => void;
}

const InventoryTab: React.FC<Props> = ({ settings, onUpdate }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
        Inventory Settings
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="auto_reorder_enabled"
            checked={settings.auto_reorder_enabled || false}
            onChange={(e) => onUpdate("auto_reorder_enabled", e.target.checked)}
            className="windows-checkbox"
          />
          <label
            htmlFor="auto_reorder_enabled"
            className="text-sm text-[var(--text-secondary)]"
          >
            Enable Auto Reorder
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="allow_negative_stock"
            checked={settings.allow_negative_stock || false}
            onChange={(e) => onUpdate("allow_negative_stock", e.target.checked)}
            className="windows-checkbox"
          />
          <label
            htmlFor="allow_negative_stock"
            className="text-sm text-[var(--text-secondary)]"
          >
            Allow Negative Stock
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            Reorder Level Default
          </label>
          <input
            type="number"
            value={settings.reorder_level_default ?? 10}
            onChange={(e) =>
              onUpdate("reorder_level_default", parseInt(e.target.value) || 0)
            }
            className="windows-input w-full"
            min="0"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            Reorder Quantity Default
          </label>
          <input
            type="number"
            value={settings.reorder_qty_default ?? 20}
            onChange={(e) =>
              onUpdate("reorder_qty_default", parseInt(e.target.value) || 0)
            }
            className="windows-input w-full"
            min="0"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            Stock Alert Threshold
          </label>
          <input
            type="number"
            value={settings.stock_alert_threshold ?? 5}
            onChange={(e) =>
              onUpdate("stock_alert_threshold", parseInt(e.target.value) || 0)
            }
            className="windows-input w-full"
            min="0"
          />
        </div>
      </div>
    </div>
  );
};

export default InventoryTab;
