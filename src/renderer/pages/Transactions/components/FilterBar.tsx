import React, { useState } from "react";
import { Search, Calendar, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import type { TransactionFilters, PaymentMethod, SaleStatus } from "../hooks/useTransactions";

interface FilterBarProps {
  filters: TransactionFilters;
  onFilterChange: (key: keyof TransactionFilters, value: any) => void;
  onReload: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  onReload,
}) => {
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "custom">("today");

  const handleDateRangeChange = (range: "today" | "week" | "month" | "custom") => {
    setDateRange(range);
    const now = new Date();
    let start = "";
    let end = format(now, "yyyy-MM-dd");
    if (range === "today") {
      start = format(now, "yyyy-MM-dd");
    } else if (range === "week") {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      start = format(weekStart, "yyyy-MM-dd");
    } else if (range === "month") {
      const monthStart = new Date(now);
      monthStart.setMonth(now.getMonth() - 1);
      start = format(monthStart, "yyyy-MM-dd");
    }
    onFilterChange("startDate", start);
    onFilterChange("endDate", end);
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--text-tertiary)]" />
          <select
            value={dateRange}
            onChange={(e) => handleDateRangeChange(e.target.value as any)}
            className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {/* Custom date inputs */}
        {dateRange === "custom" && (
          <>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onFilterChange("startDate", e.target.value)}
              className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
            />
            <span className="text-[var(--text-tertiary)]">–</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onFilterChange("endDate", e.target.value)}
              className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </>
        )}

        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search by ID, customer, SKU..."
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg pl-10 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
          />
        </div>

        {/* Payment Method Filter */}
        <select
          value={filters.paymentMethod}
          onChange={(e) => onFilterChange("paymentMethod", e.target.value as PaymentMethod)}
          className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">All Payments</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="wallet">Wallet</option>
        </select>

        {/* Status Filter */}
        <select
          value={filters.status}
          onChange={(e) => onFilterChange("status", e.target.value as SaleStatus)}
          className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">All Status</option>
          {/* <option value="initiated">Initiated</option> */}
          <option value="paid">Paid</option>
          <option value="refunded">Refunded</option>
          <option value="voided">Voided</option>
        </select>

        {/* Reload button */}
        <button
          onClick={onReload}
          className="p-2 bg-[var(--card-hover-bg)] rounded-lg hover:bg-[var(--border-color)] transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-[var(--text-secondary)]" />
        </button>
      </div>
    </div>
  );
};