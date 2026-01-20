import React, { useState } from 'react';
import { Trash2, Plus, Minus, ArrowLeft, Check, X } from 'lucide-react';
import { CartItem } from '../types';

interface CartProps {
  cartItems: CartItem[];
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  onContinueShopping: () => void;
  onCheckout: () => void;
}

const Cart: React.FC<CartProps> = ({
  cartItems,
  updateQuantity,
  removeFromCart,
  clearCart,
  getTotalPrice,
  onContinueShopping,
  onCheckout
}) => {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    if (selectionMode) {
      setSelectedItems(new Set());
    }
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    if (selectedItems.size === cartItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(cartItems.map(item => item.id)));
    }
  };

  const deleteSelected = () => {
    selectedItems.forEach(itemId => {
      removeFromCart(itemId);
    });
    setSelectedItems(new Set());
    setSelectionMode(false);
  };
  if (cartItems.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center py-16">
          <div className="mb-4 text-6xl" style={{ 
            imageRendering: 'pixelated',
            filter: 'contrast(1.2)',
            transform: 'scale(1.5)',
            display: 'inline-block'
          }}>
            🦖
          </div>
          <h2 className="text-2xl font-medium text-cafe-text mb-2">Your cart is empty</h2>
          <p className="text-cafe-textMuted mb-6">Add some currency packages to get started!</p>
          <button
            onClick={onContinueShopping}
            className="text-white px-6 py-3 rounded-full hover:opacity-90 transition-all duration-200"
            style={{ backgroundColor: '#1E7ACB' }}
          >
            Browse Games
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-4xl mx-auto px-4 py-8" style={{ maxHeight: 'calc(100vh - 120px)', height: 'calc(100vh - 120px)', minHeight: 0 }}>
      <div className="flex items-center justify-center mb-6 flex-shrink-0 relative">
        <button
          onClick={onContinueShopping}
          aria-label="Back"
          className="flex items-center text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200 absolute left-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-3xl font-semibold text-cafe-text whitespace-nowrap">Cart</h1>
        <button
          onClick={toggleSelectionMode}
          className="p-2 text-cafe-primary hover:text-cafe-secondary hover:bg-cafe-primary/20 rounded-full transition-all duration-200 absolute right-0"
          aria-label={selectionMode ? "Cancel selection" : "Delete items"}
        >
          {selectionMode ? (
            <X className="h-5 w-5" />
          ) : (
            <Trash2 className="h-5 w-5" />
          )}
        </button>
      </div>

      {selectionMode && (
        <div className="flex items-center justify-between mb-4 px-2">
          <button
            onClick={selectAll}
            className="text-sm text-cafe-primary hover:text-cafe-secondary transition-colors duration-200"
          >
            {selectedItems.size === cartItems.length ? 'Deselect All' : 'Select All'}
          </button>
          {selectedItems.size > 0 && (
            <button
              onClick={deleteSelected}
              className="text-sm text-red-400 hover:text-red-300 transition-colors duration-200 flex items-center gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Delete ({selectedItems.size})
            </button>
          )}
        </div>
      )}

      <div 
        className="flex-1 overflow-y-auto mb-6 min-h-0"
        style={{ 
          WebkitOverflowScrolling: 'touch', 
          overscrollBehavior: 'contain'
        }}
      >
        <div className="space-y-0">
          {cartItems.map((item, index) => (
            <div 
              key={item.id} 
              className={`px-4 py-4 ${index !== cartItems.length - 1 ? 'border-b border-cafe-primary/30' : ''} ${
                selectionMode ? 'cursor-pointer hover:bg-cafe-primary/5' : ''
              }`}
              onClick={selectionMode ? () => toggleItemSelection(item.id) : undefined}
            >
              <div className="flex flex-col">
                {selectionMode && (
                  <div className="flex items-center mb-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleItemSelection(item.id)}
                      className={`flex items-center justify-center w-5 h-5 rounded border-2 transition-all duration-200 ${
                        selectedItems.has(item.id)
                          ? 'bg-cafe-primary border-cafe-primary'
                          : 'border-cafe-primary/50 bg-transparent'
                      }`}
                    >
                      {selectedItems.has(item.id) && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </button>
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-medium text-cafe-text">{item.name}</h3>
                    <p className="text-sm font-semibold text-cafe-text">₱{item.totalPrice} each</p>
                  </div>
                  {item.selectedVariation && (
                    <p className="text-xs text-cafe-textMuted mb-1">Package: {item.selectedVariation.name}</p>
                  )}
                  {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                    <p className="text-xs text-cafe-textMuted mb-1">
                      Add-ons: {item.selectedAddOns.map(addOn => 
                        addOn.quantity && addOn.quantity > 1 
                          ? `${addOn.name} x${addOn.quantity}`
                          : addOn.name
                      ).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between flex-wrap gap-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center space-x-2 glass rounded-full p-0.5 border border-cafe-primary/30">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="p-1 hover:bg-cafe-primary/20 rounded-full transition-colors duration-200"
                  >
                    <Minus className="h-3 w-3 text-cafe-primary" />
                  </button>
                  <span className="font-semibold text-cafe-text min-w-[24px] text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="p-1 hover:bg-cafe-primary/20 rounded-full transition-colors duration-200"
                  >
                    <Plus className="h-3 w-3 text-cafe-primary" />
                  </button>
                </div>

                <div className="flex items-center ml-auto">
                  <p className="text-sm font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 flex-shrink-0" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between text-sm font-semibold text-cafe-text mb-4">
          <span>Total:</span>
          <span className="text-white">₱{(getTotalPrice() || 0).toFixed(2)}</span>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onContinueShopping}
            className="flex-1 text-white py-2 rounded-xl hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02] font-medium text-sm border border-white/30"
            style={{ backgroundColor: 'transparent' }}
          >
            Add More
          </button>
          <button
            onClick={onCheckout}
            className="flex-1 text-white py-2 rounded-xl hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02] font-medium text-sm"
            style={{ backgroundColor: '#1E7ACB' }}
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;