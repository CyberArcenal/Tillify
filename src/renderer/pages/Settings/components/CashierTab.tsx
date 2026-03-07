// src/renderer/pages/Settings/components/CashierTab.tsx
import React from "react";
import type { CashierSettings } from "../../../api/utils/system_config";

interface Props {
  settings: CashierSettings;
  onUpdate: (field: keyof CashierSettings, value: any) => void;
}

const CashierTab: React.FC<Props> = ({ settings, onUpdate }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
        Cashier / POS Settings
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enable_cash_drawer"
            checked={settings.enable_cash_drawer || false}
            onChange={(e) => onUpdate("enable_cash_drawer", e.target.checked)}
            className="windows-checkbox"
          />
          <label
            htmlFor="enable_cash_drawer"
            className="text-sm text-[var(--text-secondary)]"
          >
            Enable Cash Drawer
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            Drawer Open Code
          </label>
          <input
            type="text"
            value={settings.drawer_open_code || ""}
            onChange={(e) => onUpdate("drawer_open_code", e.target.value)}
            className="windows-input w-full"
            placeholder="e.g. #123"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enable_receipt_printing"
            checked={settings.enable_receipt_printing || false}
            onChange={(e) =>
              onUpdate("enable_receipt_printing", e.target.checked)
            }
            className="windows-checkbox"
          />
          <label
            htmlFor="enable_receipt_printing"
            className="text-sm text-[var(--text-secondary)]"
          >
            Enable Receipt Printing
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            Receipt Printer Type
          </label>
          <select
            value={settings.receipt_printer_type || "thermal"}
            onChange={(e) => onUpdate("receipt_printer_type", e.target.value)}
            className="windows-input w-full"
          >
            <option value="thermal">Thermal</option>
            <option value="dot-matrix">Dot Matrix</option>
            <option value="laser">Laser</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enable_barcode_scanning"
            checked={settings.enable_barcode_scanning || false}
            onChange={(e) =>
              onUpdate("enable_barcode_scanning", e.target.checked)
            }
            className="windows-checkbox"
          />
          <label
            htmlFor="enable_barcode_scanning"
            className="text-sm text-[var(--text-secondary)]"
          >
            Enable Barcode Scanning
          </label>
        </div>
      </div>
    </div>
  );
};

export default CashierTab;
