import { useState, useCallback, useEffect } from 'react';
import { CartItem, MenuItem, Variation, AddOn, Member } from '../types';

/** Resolve variation price for current member (reseller_price / member_price / base price). */
function getVariationPriceForMember(variation: Variation, currentMember: Member | null): number {
  if (!currentMember) return variation.price;
  if (currentMember.user_type === 'reseller' && variation.reseller_price != null) return variation.reseller_price;
  if (currentMember.user_type === 'end_user' && variation.member_price != null) return variation.member_price;
  return variation.price;
}

export const useCart = (currentMember: Member | null) => {
  // Load cart items from localStorage on mount
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const savedCartItems = localStorage.getItem('amber_cartItems');
      if (savedCartItems) {
        return JSON.parse(savedCartItems);
      }
    } catch (error) {
      console.error('Error loading cart items from localStorage:', error);
    }
    return [];
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Save cart items to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('amber_cartItems', JSON.stringify(cartItems));
    } catch (error) {
      console.error('Error saving cart items to localStorage:', error);
    }
  }, [cartItems]);

  const calculateItemPrice = useCallback((item: MenuItem, variation?: Variation, addOns?: AddOn[]) => {
    let price = item.basePrice;
    if (variation) {
      price += getVariationPriceForMember(variation, currentMember);
    }
    if (addOns) {
      addOns.forEach(addOn => {
        price += (addOn.quantity ?? 1) * addOn.price;
      });
    }
    return price;
  }, [currentMember]);

  /** Effective unit price for a cart item (member/reseller aware, or override from custom discount). */
  const getEffectiveUnitPrice = useCallback((cartItem: CartItem): number => {
    if (cartItem.effectiveUnitPriceOverride != null) return cartItem.effectiveUnitPriceOverride;
    return calculateItemPrice(cartItem, cartItem.selectedVariation, cartItem.selectedAddOns);
  }, [calculateItemPrice]);

  const addToCart = useCallback((item: MenuItem, quantity: number = 1, variation?: Variation, addOns?: AddOn[], effectiveUnitPrice?: number) => {
    const totalPrice = effectiveUnitPrice != null ? effectiveUnitPrice : calculateItemPrice(item, variation, addOns);
    
    // Normalize add-ons: group by ID and sum quantities
    // Handle both flat arrays (from MenuItemCard) and already-grouped arrays
    const normalizeAddOns = (addOns?: AddOn[]): (AddOn & { quantity: number })[] => {
      if (!addOns || addOns.length === 0) return [];
      
      const grouped = addOns.reduce((acc, addOn) => {
        const existing = acc.find(g => g.id === addOn.id);
        if (existing) {
          existing.quantity = (existing.quantity || 1) + 1;
        } else {
          acc.push({ ...addOn, quantity: addOn.quantity || 1 });
        }
        return acc;
      }, [] as (AddOn & { quantity: number })[]);
      
      return grouped.sort((a, b) => a.id.localeCompare(b.id));
    };
    
    const groupedAddOns = normalizeAddOns(addOns);
    
    // Helper function to create a comparison key for an item
    const createItemKey = (menuItemId: string, selectedVariation?: Variation, selectedAddOns?: AddOn[]) => {
      const variationKey = selectedVariation?.id || 'none';
      const addOnsKey = normalizeAddOns(selectedAddOns)
        .map(a => `${a.id}:${a.quantity}`)
        .sort()
        .join(',') || 'none';
      return `${menuItemId}|${variationKey}|${addOnsKey}`;
    };
    
    setCartItems(prev => {
      const newItemKey = createItemKey(item.id, variation, addOns);
      
      const existingItem = prev.find(cartItem => {
        // Extract original menu item id from cart item id (format: "menuItemId:::CART:::timestamp-random")
        // Use ::: as separator since it won't appear in UUIDs
        const parts = cartItem.id.split(':::CART:::');
        const originalMenuItemId = parts.length > 1 ? parts[0] : cartItem.id.split('-')[0];
        const cartItemKey = createItemKey(originalMenuItemId, cartItem.selectedVariation, cartItem.selectedAddOns);
        return cartItemKey === newItemKey;
      });
      
      if (existingItem) {
        // Item already exists, increment quantity
        return prev.map(cartItem =>
          cartItem === existingItem
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem
        );
      } else {
        // New item, add to cart with unique id that preserves original menu item id
        // Add new items to the beginning (top) of the cart
        const uniqueId = `${item.id}:::CART:::${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const cartItem: CartItem = {
          ...item,
          id: uniqueId,
          quantity,
          selectedVariation: variation,
          selectedAddOns: groupedAddOns,
          totalPrice,
          ...(effectiveUnitPrice != null && { effectiveUnitPriceOverride: effectiveUnitPrice })
        };
        return [cartItem, ...prev];
      }
    });
  }, [calculateItemPrice]);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    
    setCartItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const getTotalPrice = useCallback(() => {
    return cartItems.reduce((total, item) => total + getEffectiveUnitPrice(item) * item.quantity, 0);
  }, [cartItems, getEffectiveUnitPrice]);

  const getTotalItems = useCallback(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  return {
    cartItems,
    isCartOpen,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getTotalPrice,
    getTotalItems,
    getEffectiveUnitPrice,
    openCart,
    closeCart
  };
};