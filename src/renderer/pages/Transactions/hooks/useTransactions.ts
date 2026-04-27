// src/renderer/pages/Transactions/hooks/useTransactions.ts
import { useState, useEffect, useCallback } from "react";
import saleAPI, { type Sale } from "../../../api/core/sale";
import { dialogs } from "../../../utils/dialogs";

export type PaymentMethod = "cash" | "card" | "wallet";
export type SaleStatus = "initiated" | "paid" | "refunded" | "voided";

export interface TransactionFilters {
  startDate: string;
  endDate: string;
  search: string;
  paymentMethod: PaymentMethod | "";
  status: SaleStatus | "";
}

export function useTransactions(initialFilters: TransactionFilters) {
  // All transactions fetched from API (only filtered by date range)
  const [allTransactions, setAllTransactions] = useState<Sale[]>([]);
  // Filtered version for the table (applies search, paymentMethod, status)
  const [filteredTransactions, setFilteredTransactions] = useState<Sale[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch data when date range changes (or on manual reload)
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await saleAPI.getAll({
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        // Do NOT send search, paymentMethod, status – we filter locally
        sortBy: "timestamp",
        sortOrder: "DESC",
      });
      if (response.status) {
        setAllTransactions(response.data);
      } else {
        throw new Error(response.message);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load transactions");
      await dialogs.alert({ title: "Error", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate]);

  // Apply local filters (search, paymentMethod, status) whenever allTransactions or filters change
  useEffect(() => {
    let filtered = [...allTransactions];

    // Search by transaction ID, customer name, or product SKU/name
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter((tx) => {
        // match by ID
        if (tx.id.toString().includes(searchLower)) return true;
        // match by customer name
        if (tx.customer?.name?.toLowerCase().includes(searchLower)) return true;
        // match by any product SKU or name in sale items
        return tx.saleItems.some(
          (item) =>
            item.product.sku.toLowerCase().includes(searchLower) ||
            item.product.name.toLowerCase().includes(searchLower)
        );
      });
    }

    // Payment method filter
    if (filters.paymentMethod) {
      filtered = filtered.filter(
        (tx) => tx.paymentMethod === filters.paymentMethod
      );
    }

    // Status filter
    if (filters.status) {
      filtered = filtered.filter((tx) => tx.status === filters.status);
    }

    setFilteredTransactions(filtered);
  }, [allTransactions, filters.search, filters.paymentMethod, filters.status]);

  // Reload when date range changes
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  return {
    transactions: filteredTransactions,   // for the table
    allTransactions,                      // for stats (unfiltered)
    filters,
    setFilters,
    loading,
    error,
    reload: loadTransactions,
  };
}