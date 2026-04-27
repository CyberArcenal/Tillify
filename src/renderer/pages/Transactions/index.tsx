// src/renderer/pages/Transactions/index.tsx
import React, { useState } from "react";
import { PlusCircle, Download, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

// Hooks
import {
  useTransactions,
  type TransactionFilters,
} from "./hooks/useTransactions";
import { useTransactionDetails } from "./hooks/useTransactionDetails";

// Components
import { FilterBar } from "./components/FilterBar";
import { SummaryMetrics } from "./components/SummaryMetrics";
import { TransactionsTable } from "./components/TransactionsTable";
import { TransactionDetailsDrawer } from "./components/TransactionDetailsDrawer";
import { PromptDialog } from "../../components/Shared/PromptDialog";
import { dialogs } from "../../utils/dialogs";
import saleAPI, { type Sale } from "../../api/core/sale";
import Pagination from "../../components/Shared/Pagination1";
import { hideLoading, showLoading } from "../../utils/notification";

const TransactionsPage: React.FC = () => {
  const { 
    transactions,       // filtered (for table)
    allTransactions,   // unfiltered (for stats)
    filters, 
    setFilters, 
    loading, 
    error, 
    reload 
  } = useTransactions({
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    search: "",
    paymentMethod: "",
    status: "",
  });

  const { selectedTransaction, detailsOpen, openDetails, closeDetails } =
    useTransactionDetails();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pageSizeOptions = [10, 20, 50, 100];

  // Prompt state for refund reason
  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingRefundTransaction, setPendingRefundTransaction] =
    useState<Sale | null>(null);

  const handleFilterChange = (key: keyof TransactionFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handlePrint = async (transaction: Sale) => {
    try {
      showLoading("Printing receipt...");
      await window.backendAPI.printerPrint(transaction.id);
      await dialogs.success("Transaction printed successfully.", "Success");
    } catch (err) {
      hideLoading();
      await dialogs.error("Printer Unavailable.", "Printer Error");
    } finally {
      hideLoading();
    }
  };

  const handleRefund = (transaction: Sale) => {
    dialogs
      .confirm({
        title: "Process Refund",
        message: `Refund transaction #${transaction.id}?`,
      })
      .then((confirmed) => {
        if (confirmed) {
          setPendingRefundTransaction(transaction);
          setPromptOpen(true);
        }
      });
  };

  const handleRefundConfirm = async (reason: string) => {
    if (!pendingRefundTransaction) return;
    try {
      const items = pendingRefundTransaction.saleItems.map((s) => ({
        productId: s.product.id,
        quantity: s.quantity,
      }));

      const response = await saleAPI.refund(
        pendingRefundTransaction.id,
        items,
        reason,
      );

      console.log("Refund processed:", response);
      await reload(); // refresh list
      await dialogs.success("Refund processed successfully.", "Success");
    } catch (err) {
      console.error("Refund failed:", err);
      await dialogs.error("Refund failed. Please try again.", "Error");
    } finally {
      setPendingRefundTransaction(null);
    }
  };

  const handleNewSale = () => {
    window.location.href = "/pos/cashier";
  };

  const handleExport = async () => {
    try {
      const response = await saleAPI.exportCSV({
        startDate: filters.startDate,
        endDate: filters.endDate,
        paymentMethod: filters.paymentMethod || undefined,
        status: filters.status || undefined,
        search: filters.search || undefined,
      });
      if (response.status) {
        const blob = new Blob([response.data.data], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = response.data.filename;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        throw new Error(response.message);
      }
    } catch (err: any) {
      await dialogs.alert({ title: "Export Failed", message: err.message });
    }
  };

  // Pagination calculations – using filtered transactions (table data)
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const totalItems = transactions.length;

  const handlePageChange = (page: number) => setCurrentPage(page);
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  return (
    <div className="h-full flex flex-col bg-[var(--background-color)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Transactions
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleNewSale}
            className="hidden items-center gap-2 px-4 py-2 bg-[var(--accent-blue)] text-white rounded-lg hover:bg-[var(--accent-blue-hover)] transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            New Sale
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--card-hover-bg)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--border-color)] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Metrics – uses allTransactions (unfiltered) */}
      <SummaryMetrics transactions={allTransactions} />

      {/* Filters */}
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onReload={reload}
      />

      {/* Transactions Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-blue)]" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-[var(--accent-red)]" />
            <p className="text-[var(--text-primary)] font-medium">
              Error loading transactions
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">{error}</p>
            <button
              onClick={reload}
              className="mt-4 px-4 py-2 bg-[var(--accent-blue)] text-white rounded-lg"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-hidden">
            <TransactionsTable
              transactions={paginatedTransactions}
              onViewDetails={openDetails}
              onPrint={handlePrint}
              onRefund={handleRefund}
            />
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={pageSizeOptions}
            showPageSize={true}
          />
        </>
      )}

      {/* Transaction Details Drawer */}
      <TransactionDetailsDrawer
        transaction={selectedTransaction}
        isOpen={detailsOpen}
        onClose={closeDetails}
        onPrint={handlePrint}
        onRefund={handleRefund}
      />

      {/* Refund Reason Prompt */}
      <PromptDialog
        isOpen={promptOpen}
        onClose={() => {
          setPromptOpen(false);
          setPendingRefundTransaction(null);
        }}
        onConfirm={handleRefundConfirm}
        title="Refund Reason"
        message="Please provide a reason for this refund:"
        placeholder="Enter reason..."
      />
    </div>
  );
};

export default TransactionsPage;