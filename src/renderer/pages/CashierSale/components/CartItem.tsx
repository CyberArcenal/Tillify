import React, { useCallback, useMemo, useState } from "react";
import { Minus, Plus, Trash2, Tag, Percent, ImageOff } from "lucide-react";
import Decimal from "decimal.js";
import type { CartItem as CartItemType } from "../types";
import { calculateLineTotal } from "../utils";
import { formatCurrency } from "../../../utils/formatters";
import productAPI from "../../../api/core/product";

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (id: number, newQty: number) => void;
  onRemove: (id: number) => void;
  onUpdateDiscount: (id: number, discount: number) => void;
  onUpdateTax: (id: number, tax: number) => void;
  maxDiscount?: number;
}

const CartItem: React.FC<CartItemProps> = ({
  item,
  onUpdateQuantity,
  onRemove,
  onUpdateDiscount,
  onUpdateTax,
  maxDiscount = 100,
}) => {
  const [imageError, setImageError] = useState(false);
  const lineTotal = useMemo(() => calculateLineTotal(item), [item]);

  // Get product image URL (if available)
  const imageUrl = useMemo(() => {
    if (!item.image || imageError) return null;
    return productAPI.getImageUrl?.(item.image) || null;
  }, [item.image, imageError]);

  const hasBackgroundImage = imageUrl && !imageError;

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleQuantityDecrement = useCallback(() => {
    onUpdateQuantity(item.id, item.cartQuantity - 1);
  }, [onUpdateQuantity, item.id, item.cartQuantity]);

  const handleQuantityIncrement = useCallback(() => {
    onUpdateQuantity(item.id, item.cartQuantity + 1);
  }, [onUpdateQuantity, item.id, item.cartQuantity]);

  const handleRemove = useCallback(() => {
    onRemove(item.id);
  }, [onRemove, item.id]);

  const handleDiscountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value) || 0;
      onUpdateDiscount(item.id, Math.min(maxDiscount, Math.max(0, val)));
    },
    [onUpdateDiscount, item.id, maxDiscount]
  );

  const handleTaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value) || 0;
      onUpdateTax(item.id, Math.min(100, Math.max(0, val)));
    },
    [onUpdateTax, item.id]
  );

  return (
    <div className="relative bg-[var(--card-secondary-bg)] border border-[var(--border-color)] rounded-lg p-3 hover:border-[var(--accent-blue)] transition-colors overflow-hidden">
      {/* Very dark product image background */}
      {hasBackgroundImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          {/* Extra dark overlay to ensure text readability */}
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}

      {/* Fallback pattern when no image */}
      {!hasBackgroundImage && (
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 30%, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.95) 100%),
                              repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 8px)`,
            backgroundBlendMode: "overlay",
          }}
        />
      )}

      {/* Content (kept above background) */}
      <div className="relative z-10">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h4 className="font-medium text-[var(--text-primary)]">{item.name}</h4>
            <p className="text-xs text-[var(--text-tertiary)]">{item.sku}</p>
          </div>
          <button
            onClick={handleRemove}
            className="text-[var(--text-tertiary)] hover:text-[var(--accent-red)] p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center border border-[var(--border-color)] rounded-lg bg-black/20">
            <button
              onClick={handleQuantityDecrement}
              className="px-2 py-1 text-[var(--text-primary)] hover:bg-[var(--card-hover-bg)] rounded-l-lg"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-[var(--text-primary)] font-medium">
              {item.cartQuantity}
            </span>
            <button
              onClick={handleQuantityIncrement}
              className="px-2 py-1 text-[var(--text-primary)] hover:bg-[var(--card-hover-bg)] rounded-r-lg"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <span className="font-bold text-[var(--accent-green)]">
            {formatCurrency(lineTotal.toFixed(2))}
          </span>
        </div>

        <div className="mt-2 flex gap-2 text-xs">
          <div className="flex items-center gap-1">
            <Tag className="w-3 h-3 text-[var(--accent-amber)]" />
            <input
              type="number"
              min="0"
              max={maxDiscount}
              value={item.lineDiscount}
              onChange={handleDiscountChange}
              className="w-16 bg-[var(--input-bg)]/80 border border-[var(--input-border)] rounded px-1 py-0.5 text-[var(--text-primary)]"
            />
            <span className="text-[var(--text-tertiary)]">%</span>
          </div>
          <div className="flex items-center gap-1">
            <Percent className="w-3 h-3 text-[var(--accent-blue)]" />
            <input
              type="number"
              min="0"
              max="100"
              value={item.lineTax}
              onChange={handleTaxChange}
              className="w-16 bg-[var(--input-bg)]/80 border border-[var(--input-border)] rounded px-1 py-0.5 text-[var(--text-primary)]"
            />
            <span className="text-[var(--text-tertiary)]">%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CartItem);