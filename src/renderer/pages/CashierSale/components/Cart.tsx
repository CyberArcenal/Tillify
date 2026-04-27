import React, {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
} from "react";
import { ShoppingCart, Trash2 } from "lucide-react";
import Decimal from "decimal.js";
import type {
  CartItem as CartItemType,
  Customer,
  PaymentMethod,
} from "../types";
import CartItem from "./CartItem";
import LoyaltyRedemption from "./LoyaltyRedemption";
import PaymentMethodSelector from "./PaymentMethodSelector";
import TotalsDisplay from "./TotalsDisplay";
import CheckoutButton from "./CheckoutButton";
import {
  calculateSubtotal,
  calculateCartTotal,
  calculateMaxRedeemable,
} from "../utils";
import CustomerSelect from "../../../components/Selects/Customer";
import {
  useDiscountEnabled,
  useLoyaltyPointsEnabled,
  useMaxDiscountPercent,
} from "../../../utils/posUtils";
import { useDebounce } from "../hooks/useDebounce";
import { dialogs } from "../../../utils/dialogs";

interface CartProps {
  cart: CartItemType[];
  globalDiscount: number;
  globalTax: number;
  notes: string;
  onUpdateQuantity: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
  onUpdateDiscount: (id: number, discount: number) => void;
  onUpdateTax: (id: number, tax: number) => void;
  onGlobalDiscountChange: (value: number) => void;
  onGlobalTaxChange: (value: number) => void;
  onNotesChange: (value: string) => void;
  selectedCustomer: Customer | null;
  onCustomerSelect: (customer: Customer | null) => void;
  loyaltyPointsAvailable: number;
  loyaltyPointsToRedeem: number;
  useLoyalty: boolean;
  onUseLoyaltyChange: (checked: boolean) => void;
  onLoyaltyPointsChange: (points: number) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  isProcessing: boolean;
  onCheckout: () => void;
  onClearCart: () => void;
}

const Cart: React.FC<CartProps> = ({
  cart,
  globalDiscount,
  globalTax,
  notes,
  onUpdateQuantity,
  onRemove,
  onUpdateDiscount,
  onUpdateTax,
  onGlobalDiscountChange,
  onGlobalTaxChange,
  onNotesChange,
  selectedCustomer,
  onCustomerSelect,
  loyaltyPointsAvailable,
  loyaltyPointsToRedeem,
  useLoyalty,
  onUseLoyaltyChange,
  onLoyaltyPointsChange,
  paymentMethod,
  onPaymentMethodChange,
  isProcessing,
  onCheckout,
  onClearCart,
}) => {
  const cartContainerRef = useRef<HTMLDivElement | null>(null);
  const discountEnabled = useDiscountEnabled();
  const isPointEnabled = useLoyaltyPointsEnabled();
  const maxDiscount = useMaxDiscountPercent();

  // ========== Debounced inputs ==========
  const [localDiscount, setLocalDiscount] = useState(globalDiscount);
  const [localTax, setLocalTax] = useState(globalTax);
  const debouncedDiscount = useDebounce(localDiscount, 300);
  const debouncedTax = useDebounce(localTax, 300);

  useEffect(() => {
    onGlobalDiscountChange(debouncedDiscount);
  }, [debouncedDiscount, onGlobalDiscountChange]);

  useEffect(() => {
    onGlobalTaxChange(debouncedTax);
  }, [debouncedTax, onGlobalTaxChange]);

  // ========== Memoized calculations ==========
  const subtotal = useMemo(() => calculateSubtotal(cart), [cart]);
  const loyaltyDeduction = useMemo(
    () => (useLoyalty ? new Decimal(loyaltyPointsToRedeem) : new Decimal(0)),
    [useLoyalty, loyaltyPointsToRedeem]
  );
  const total = useMemo(
    () => calculateCartTotal(cart, globalDiscount, globalTax, loyaltyDeduction),
    [cart, globalDiscount, globalTax, loyaltyDeduction]
  );
  const maxRedeemable = useMemo(
    () =>
      calculateMaxRedeemable(
        loyaltyPointsAvailable,
        cart,
        globalDiscount,
        globalTax
      ),
    [loyaltyPointsAvailable, cart, globalDiscount, globalTax]
  );

  const handleClearCart = async () => {
    const confirmed = await dialogs.confirm({
      title: "Clear Cart",
      message: "Are you sure you want to remove all items from the cart?",
    });
    if (confirmed) {
      onClearCart();
    }
  };

  // Auto-scroll to bottom when cart changes
  useEffect(() => {
    if (cartContainerRef.current) {
      cartContainerRef.current.scrollTo({
        top: cartContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [cart]);

  // Stable callbacks for memoized children
  const handleCustomerSelect = useCallback(
    (id: number | null, customer: Customer | null) => {
      onCustomerSelect(customer ? customer : null);
    },
    [onCustomerSelect]
  );

  return (
    <div className="flex flex-col h-full bg-[var(--cart-bg)] border-l border-[var(--border-color)]">
      <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          Current Sale
        </h2>
        <button
          onClick={handleClearCart}
          disabled={cart.length === 0}
          className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--card-hover-bg)] hover:text-[var(--accent-red)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Clear cart"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div
        ref={cartContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {cart.length === 0 ? (
          <div className="text-center text-[var(--text-tertiary)] py-8">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Cart is empty</p>
            <p className="text-sm">Click products to add</p>
          </div>
        ) : (
          cart.map((item) => (
            <CartItem
              key={item.id}
              item={item}
              onUpdateQuantity={onUpdateQuantity}
              onRemove={onRemove}
              onUpdateDiscount={onUpdateDiscount}
              onUpdateTax={onUpdateTax}
              maxDiscount={maxDiscount}
            />
          ))
        )}
      </div>

      <div className="p-4 border-t border-[var(--border-color)] space-y-3">
        <CustomerSelect
          value={selectedCustomer?.id || null}
          onChange={(customerId, customer) => {
            handleCustomerSelect(
              customerId,
              customer === undefined ? null : customer
            );
          }}
          showLoyalty
          placeholder="Select customer..."
        />

        {selectedCustomer && isPointEnabled && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-tertiary)]">Loyalty points:</span>
            <span className="font-medium text-[var(--accent-purple)]">
              {loyaltyPointsAvailable}
            </span>
          </div>
        )}
        {isPointEnabled && (
          <LoyaltyRedemption
            selectedCustomer={!!selectedCustomer}
            loyaltyPointsAvailable={loyaltyPointsAvailable}
            useLoyalty={useLoyalty}
            loyaltyPointsToRedeem={loyaltyPointsToRedeem}
            maxRedeemable={maxRedeemable}
            onUseLoyaltyChange={onUseLoyaltyChange}
            onPointsChange={onLoyaltyPointsChange}
          />
        )}

        <PaymentMethodSelector
          paymentMethod={paymentMethod}
          onChange={onPaymentMethodChange}
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">
              Discount % {discountEnabled ? "" : "(Disabled)"}
            </label>
            <input
              type="number"
              min="0"
              max={maxDiscount}
              disabled={!discountEnabled}
              value={localDiscount}
              onChange={(e) =>
                setLocalDiscount(
                  Math.min(maxDiscount, parseFloat(e.target.value) || 0)
                )
              }
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Optional notes"
              className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
            />
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-color)] bg-[var(--cart-header)]">
        <TotalsDisplay
          subtotal={subtotal}
          globalDiscount={globalDiscount}
          globalTax={globalTax}
          useLoyalty={useLoyalty}
          loyaltyPointsToRedeem={loyaltyPointsToRedeem}
          total={total}
        />

        <CheckoutButton
          isProcessing={isProcessing}
          disabled={cart.length === 0}
          total={total}
          onClick={onCheckout}
        />
      </div>
    </div>
  );
};

export default React.memo(Cart);
