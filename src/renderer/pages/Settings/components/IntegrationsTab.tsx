import React, { useState } from "react";
import type {
  IntegrationsSettings,
  WebhookSetting,
} from "../../../api/utils/system_config";

interface Props {
  settings: IntegrationsSettings;
  onUpdate: (field: keyof IntegrationsSettings, value: any) => void;
}

// Common payment gateway providers
const PAYMENT_PROVIDERS = [
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "square", label: "Square" },
  { value: "authorize_net", label: "Authorize.Net" },
  { value: "braintree", label: "Braintree" },
  { value: "adyen", label: "Adyen" },
  { value: "other", label: "Other (specify below)" },
];

const IntegrationsTab: React.FC<Props> = ({ settings, onUpdate }) => {
  // Ensure webhooks is always an array
  const [webhooks, setWebhooks] = useState<WebhookSetting[]>(() => {
    return Array.isArray(settings.webhooks) ? settings.webhooks : [];
  });

  const handleWebhookChange = (
    index: number,
    field: keyof WebhookSetting,
    value: any,
  ) => {
    const updated = [...webhooks];
    updated[index] = { ...updated[index], [field]: value };
    setWebhooks(updated);
    onUpdate("webhooks", updated);
  };

  const addWebhook = () => {
    const newWebhook: WebhookSetting = {
      url: "",
      events: [],
      enabled: true,
      secret: "",
    };
    const updated = [...webhooks, newWebhook];
    setWebhooks(updated);
    onUpdate("webhooks", updated);
  };

  const removeWebhook = (index: number) => {
    const updated = webhooks.filter((_, i) => i !== index);
    setWebhooks(updated);
    onUpdate("webhooks", updated);
  };

  // Determine if the selected provider is "other" or a custom value not in the list
  const isOtherProvider =
    settings.payment_gateway_provider &&
    !PAYMENT_PROVIDERS.some(
      (p) => p.value === settings.payment_gateway_provider,
    ) &&
    settings.payment_gateway_provider !== "other";

  // The value to show in the select dropdown
  const selectValue = isOtherProvider
    ? "other"
    : settings.payment_gateway_provider || "";

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
        Integrations Settings
      </h3>

      {/* Accounting Integration */}
      {/* <div className="bg-[var(--card-secondary-bg)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-md font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-[var(--primary-color)] rounded-full"></span>
          Accounting Integration
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              id="accounting_integration_enabled"
              checked={settings.accounting_integration_enabled || false}
              onChange={(e) =>
                onUpdate("accounting_integration_enabled", e.target.checked)
              }
              className="windows-checkbox"
            />
            <label
              htmlFor="accounting_integration_enabled"
              className="text-sm text-[var(--text-secondary)]"
            >
              Enable Accounting Integration
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Accounting API URL
            </label>
            <input
              type="url"
              value={settings.accounting_api_url || ""}
              onChange={(e) => onUpdate("accounting_api_url", e.target.value)}
              className="windows-input w-full"
              placeholder="https://api.accounting.com/v1"
              disabled={!settings.accounting_integration_enabled}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Accounting API Key
            </label>
            <input
              type="password"
              value={settings.accounting_api_key || ""}
              onChange={(e) => onUpdate("accounting_api_key", e.target.value)}
              className="windows-input w-full"
              placeholder="••••••••••••••••"
              disabled={!settings.accounting_integration_enabled}
            />
          </div>
        </div>
      </div> */}

      {/* Payment Gateway */}
      <div className="bg-[var(--card-secondary-bg)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-md font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-[var(--primary-color)] rounded-full"></span>
          Payment Gateway
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              id="payment_gateway_enabled"
              checked={settings.payment_gateway_enabled || false}
              onChange={(e) =>
                onUpdate("payment_gateway_enabled", e.target.checked)
              }
              className="windows-checkbox"
            />
            <label
              htmlFor="payment_gateway_enabled"
              className="text-sm text-[var(--text-secondary)]"
            >
              Enable Payment Gateway
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Provider
            </label>
            <select
              value={selectValue}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "other") {
                  // Keep current value (could be empty or existing custom)
                  // If currently empty, set to empty string
                  onUpdate(
                    "payment_gateway_provider",
                    settings.payment_gateway_provider || "",
                  );
                } else {
                  onUpdate("payment_gateway_provider", val);
                }
              }}
              className="windows-input w-full"
              disabled={!settings.payment_gateway_enabled}
            >
              <option value="" disabled>
                Select a provider
              </option>
              {PAYMENT_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {/* If provider is "other" or custom, show a text input for custom provider name */}
          {(selectValue === "other" || isOtherProvider) && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Custom Provider Name
              </label>
              <input
                type="text"
                value={settings.payment_gateway_provider || ""}
                onChange={(e) =>
                  onUpdate("payment_gateway_provider", e.target.value)
                }
                className="windows-input w-full"
                placeholder="e.g., MyCustomGateway"
                disabled={!settings.payment_gateway_enabled}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              API Key
            </label>
            <input
              type="password"
              value={settings.payment_gateway_api_key || ""}
              onChange={(e) =>
                onUpdate("payment_gateway_api_key", e.target.value)
              }
              className="windows-input w-full"
              placeholder="••••••••••••••••"
              disabled={!settings.payment_gateway_enabled}
            />
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-[var(--card-secondary-bg)] border border-[var(--border-color)] rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-md font-medium text-[var(--text-primary)] flex items-center gap-2">
            <span className="w-1 h-4 bg-[var(--primary-color)] rounded-full"></span>
            Webhooks
          </h4>
          <button
            onClick={addWebhook}
            className="windows-button windows-button-primary text-sm px-3 py-1"
          >
            + Add Webhook
          </button>
        </div>

        <div className="space-y-4">
          {webhooks.length > 0 ? (
            webhooks.map((webhook, index) => (
              <div
                key={index}
                className="border border-[var(--border-color)] rounded-lg p-4 bg-[var(--card-bg)]"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 flex justify-between items-start">
                    <h5 className="text-sm font-medium text-[var(--text-primary)]">
                      Webhook #{index + 1}
                    </h5>
                    <button
                      onClick={() => removeWebhook(index)}
                      className="text-[var(--danger-color)] hover:text-[var(--danger-hover)] text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                      URL
                    </label>
                    <input
                      type="url"
                      value={webhook.url}
                      onChange={(e) =>
                        handleWebhookChange(index, "url", e.target.value)
                      }
                      className="windows-input w-full"
                      placeholder="https://example.com/webhook"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                      Events (comma separated)
                    </label>
                    <input
                      type="text"
                      value={webhook.events.join(", ")}
                      onChange={(e) =>
                        handleWebhookChange(
                          index,
                          "events",
                          e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        )
                      }
                      className="windows-input w-full"
                      placeholder="sale.created, inventory.updated"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`webhook_enabled_${index}`}
                      checked={webhook.enabled}
                      onChange={(e) =>
                        handleWebhookChange(index, "enabled", e.target.checked)
                      }
                      className="windows-checkbox"
                    />
                    <label
                      htmlFor={`webhook_enabled_${index}`}
                      className="text-sm text-[var(--text-secondary)]"
                    >
                      Enabled
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                      Secret (optional)
                    </label>
                    <input
                      type="text"
                      value={webhook.secret || ""}
                      onChange={(e) =>
                        handleWebhookChange(index, "secret", e.target.value)
                      }
                      className="windows-input w-full"
                    />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--text-secondary)] italic">
              No webhooks configured.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrationsTab;
