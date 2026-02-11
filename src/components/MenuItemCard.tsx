import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { MenuItem, Variation } from '../types';
import { useMemberAuth } from '../hooks/useMemberAuth';
import { useMemberDiscounts } from '../hooks/useMemberDiscounts';

interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem, quantity?: number, variation?: Variation, addOns?: import('../types').AddOn[], effectiveUnitPrice?: number) => void;
  quantity: number;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onItemAdded?: () => void; // Callback when item is added to cart
  /** 'horizontal' = icon left, text right (Popular); 'vertical' = icon top, text below (other categories) */
  layout?: 'horizontal' | 'vertical';
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({ 
  item, 
  onAddToCart, 
  quantity, 
  onUpdateQuantity,
  onItemAdded,
  layout = 'vertical'
}) => {
  const [showCustomization, setShowCustomization] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>(
    item.variations?.[0]
  );
  const nameRef = useRef<HTMLHeadingElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const { currentMember, isReseller } = useMemberAuth();
  const { getDiscountForItem } = useMemberDiscounts();
  const [memberDiscounts, setMemberDiscounts] = useState<Record<string, number>>({});
  const [priceUpdateKey, setPriceUpdateKey] = useState(0); // Force re-render when member changes

  // Force price update when member changes (login/logout)
  useEffect(() => {
    setPriceUpdateKey(prev => prev + 1);
  }, [currentMember?.id, currentMember?.user_type]);

  // Fetch member discounts for all variations when component mounts or member changes
  useEffect(() => {
    const fetchDiscounts = async () => {
      if (isReseller() && currentMember && item.variations) {
        const discounts: Record<string, number> = {};
        for (const variation of item.variations) {
          const discount = await getDiscountForItem(currentMember.id, item.id, variation.id);
          if (discount) {
            discounts[variation.id] = discount.selling_price;
          }
        }
        setMemberDiscounts(discounts);
      } else {
        setMemberDiscounts({});
      }
    };
    fetchDiscounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReseller(), currentMember?.id, item.id, priceUpdateKey]);

  // Calculate discounted price for a variation/currency package
  const getDiscountedPrice = async (basePrice: number, variationId?: string): Promise<number> => {
    // If user is reseller and has member discount for this variation, use it
    if (isReseller() && currentMember && variationId && memberDiscounts[variationId]) {
      return memberDiscounts[variationId];
    }
    
    // Otherwise, use regular discount logic
    if (item.isOnDiscount && item.discountPercentage !== undefined) {
      const discountAmount = basePrice * item.discountPercentage;
      return basePrice - discountAmount;
    }
    return basePrice;
  };

  // Get the variation object by ID
  const getVariationById = (variationId?: string): Variation | undefined => {
    if (!variationId || !item.variations) return undefined;
    return item.variations.find(v => v.id === variationId);
  };

  // Synchronous version for immediate display (uses cached discounts)
  const getDiscountedPriceSync = (basePrice: number, variationId?: string): number => {
    const variation = getVariationById(variationId);
    
    // Priority 1: If user is reseller and variation has reseller_price, use it
    if (isReseller() && currentMember && variation?.reseller_price !== undefined) {
      return variation.reseller_price;
    }
    
    // Priority 2: If user is a member (end_user, not reseller) and variation has member_price, use it
    if (currentMember && !isReseller() && currentMember.user_type === 'end_user' && variation?.member_price !== undefined) {
      return variation.member_price;
    }
    
    // Priority 3: If user is reseller and has member discount for this variation, use it
    if (isReseller() && currentMember && variationId && memberDiscounts[variationId]) {
      return memberDiscounts[variationId];
    }
    
    // Priority 4: Otherwise, use regular discount logic
    if (item.isOnDiscount && item.discountPercentage !== undefined) {
      const discountAmount = basePrice * item.discountPercentage;
      return basePrice - discountAmount;
    }
    
    // Priority 5: Default to base price
    return basePrice;
  };

  const handleCardClick = () => {
    if (!item.available) return;
    setShowCustomization(true);
  };

  const handleItemSelect = (variation?: Variation) => {
    const v = variation || selectedVariation;
    const effectiveVariationPrice = v ? getDiscountedPriceSync(v.price, v.id) : 0;
    const effectiveUnitPrice = item.basePrice + effectiveVariationPrice;
    onAddToCart(item, 1, v, undefined, effectiveUnitPrice);
    setShowCustomization(false);
    setSelectedVariation(item.variations?.[0]);
    // Call the callback to redirect to cart after adding item
    if (onItemAdded) {
      onItemAdded();
    }
  };

  // Check if text overflows and needs scrolling
  useEffect(() => {
    const checkOverflow = () => {
      if (!nameRef.current) return;
      
      const element = nameRef.current;
      const isOverflowing = element.scrollWidth > element.clientWidth;
      setShouldScroll(isOverflowing);
    };

    // Use setTimeout to ensure DOM is fully rendered
    const timeoutId = setTimeout(() => {
      checkOverflow();
    }, 100);

    window.addEventListener('resize', checkOverflow);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [item.name]);

  const discountBadge = item.isOnDiscount && item.discountPercentage != null ? (
    <span className="absolute top-0 right-0 bg-cafe-primary text-white text-[9px] font-bold px-1 py-0.5 rounded-bl-md">
      {Math.round(item.discountPercentage * 100)}% OFF
    </span>
  ) : null;

  const imageBlock = (imgClass: string, wrapClass: string) => (
    <div className={`relative overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg transition-transform duration-300 group-hover:scale-105 ${wrapClass}`}>
      {item.image ? (
        <img
          src={item.image}
          alt={item.name}
          className={imgClass}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div className={`absolute inset-0 flex items-center justify-center ${item.image ? 'hidden' : ''}`}>
        <div className="text-2xl opacity-20 text-gray-400">🎮</div>
      </div>
      {discountBadge}
    </div>
  );

  const textBlock = (align: 'left' | 'center', noScroll = false) => {
    const useScroll = !noScroll && shouldScroll;
    return (
      <div className={`flex flex-col justify-center min-w-0 p-1 sm:p-1.5 ${noScroll ? 'flex-1 md:p-3' : ''} ${align === 'center' ? 'text-center' : 'text-left'}`}>
        <h4
          ref={noScroll ? undefined : nameRef}
          className={`text-white font-semibold leading-tight break-words ${
            noScroll ? 'text-[9px] sm:text-[10px] md:text-base line-clamp-2' : 'text-[10px] sm:text-xs line-clamp-2'
          } ${useScroll ? 'animate-scroll-text' : ''}`}
          style={useScroll ? { display: 'inline-block' } : {}}
        >
          {useScroll ? (
            <>
              <span>{item.name}</span>
              <span className="mx-4">•</span>
              <span>{item.name}</span>
            </>
          ) : (
            item.name
          )}
        </h4>
        {item.subtitle ? (
          <p className={`text-[8px] sm:text-[9px] text-cafe-textMuted mt-0.5 leading-tight line-clamp-2 break-words ${noScroll ? 'md:text-sm' : ''}`}>
            {item.subtitle}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div 
        onClick={handleCardClick}
        className={`relative flex transition-all duration-300 group rounded-lg overflow-hidden ${layout === 'horizontal' ? 'flex-row' : 'flex-col'} ${!item.available ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{
          border: '1px solid rgba(107, 114, 128, 0.4)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
        onMouseEnter={(e) => {
          if (item.available) {
            e.currentTarget.style.borderColor = 'rgba(107, 114, 128, 0.7)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(107, 114, 128, 0.25), 0 8px 32px 0 rgba(0, 0, 0, 0.37)';
          }
        }}
        onMouseLeave={(e) => {
          if (item.available) {
            e.currentTarget.style.borderColor = 'rgba(107, 114, 128, 0.4)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
          }
        }}
      >
        {/* Closed overlay for unavailable items */}
        {!item.available && (
          <div className={`absolute inset-0 bg-black/60 flex items-center justify-center z-10 ${layout === 'horizontal' ? 'rounded-lg' : 'rounded-t-lg'}`}>
            <span className="text-white font-bold text-sm sm:text-base opacity-90 font-sans">Closed</span>
          </div>
        )}

        {layout === 'horizontal' ? (
          <>
            {imageBlock('w-full h-full object-cover', 'w-12 h-12 sm:w-14 sm:h-14 md:w-24 md:h-24 flex-shrink-0 rounded-l-lg')}
            {textBlock('left', true)}
          </>
        ) : (
          <>
            {imageBlock('w-full h-full object-cover', 'w-full aspect-[4/3] rounded-t-lg')}
            {textBlock('center', false)}
          </>
        )}
      </div>

      {/* Item Selection Modal - Diginix branding */}
      {showCustomization && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCustomization(false)}>
          <div className="flex flex-col rounded-xl max-w-xl w-full max-h-[85vh] shadow-xl overflow-hidden border border-cafe-primary/30 bg-cafe-darkBg" onClick={(e) => e.stopPropagation()}>
            <div 
              className="flex-shrink-0 p-4 md:p-5 flex items-start justify-between rounded-t-xl relative overflow-hidden" 
              style={{ 
                backgroundImage: item.image ? `url(${item.image})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                zIndex: 20,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                minHeight: '96px'
              }}
            >
              {/* Dark overlay for text readability - covers entire header including edges */}
              <div 
                className="absolute inset-0 bg-black/70 rounded-t-xl"
                style={{
                  zIndex: 1,
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0
                }}
              />
              
              {/* Trish Devion red accent */}
              <div 
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-cafe-primary/50 rounded-b-xl"
                style={{
                  zIndex: 2
                }}
              />
              
              {/* Content with relative positioning to be above overlay */}
              <div className="relative z-10 flex items-start justify-between w-full gap-4">
                <div className="flex-1 min-w-0 font-sans">
                  <h3 className="text-lg font-bold text-white drop-shadow-lg">{item.name}</h3>
                {item.subtitle && (
                    <p className="text-sm text-cafe-primary/95 mt-1 drop-shadow-md">{item.subtitle}</p>
                )}
                {item.description && (
                    <p className="text-sm text-white/90 mt-2 drop-shadow-md whitespace-pre-line break-words">{item.description}</p>
                )}
              </div>
              <button
                onClick={() => setShowCustomization(false)}
                  className="p-2 hover:bg-cafe-primary/20 rounded-full transition-colors duration-200 relative z-10 flex-shrink-0 text-white hover:text-cafe-primary"
              >
                  <X className="h-4 w-4 drop-shadow-lg" />
              </button>
              </div>
            </div>

            <div 
              className="flex-1 overflow-y-auto min-h-0 relative bg-cafe-darkBg"
              style={{ 
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain'
              }}
            >
              {/* Fade-out gradient overlay at top - Diginix dark theme */}
              <div
                className="sticky top-0 left-0 right-0 z-10 pointer-events-none"
                style={{
                  height: '32px',
                  background: 'linear-gradient(to bottom, #0A0A0A 0%, rgba(10, 10, 10, 0.98) 20%, rgba(10, 10, 10, 0.7) 50%, rgba(10, 10, 10, 0.2) 80%, transparent 100%)',
                  marginBottom: '-32px'
                }}
              />
              
              <div className="p-4 md:p-5 pt-3">
                {/* Show currency packages grouped by category */}
                {item.variations && item.variations.length > 0 ? (
                  (() => {
                    // Group variations by category and track category sort order
                    const groupedByCategory: Record<string, { variations: Variation[], categorySort: number }> = {};
                    item.variations.forEach((variation) => {
                      const category = variation.category || 'Uncategorized';
                      const categorySort = variation.sort !== null && variation.sort !== undefined ? variation.sort : 999;
                      
                      if (!groupedByCategory[category]) {
                        groupedByCategory[category] = { variations: [], categorySort: 999 };
                      }
                      groupedByCategory[category].variations.push(variation);
                      // Use the minimum sort value as the category sort order
                      if (categorySort < groupedByCategory[category].categorySort) {
                        groupedByCategory[category].categorySort = categorySort;
                      }
                    });

                    // Sort categories by category sort order (sort field), then alphabetically
                    const sortedCategories = Object.keys(groupedByCategory).sort((a, b) => {
                      const sortA = groupedByCategory[a].categorySort;
                      const sortB = groupedByCategory[b].categorySort;
                      if (sortA !== sortB) {
                        return sortA - sortB;
                      }
                      return a.localeCompare(b);
                    });

                    // Sort variations within each category by sort_order, then by price
                    sortedCategories.forEach((category) => {
                      groupedByCategory[category].variations.sort((a, b) => {
                        const sortOrderA = a.sort_order || 0;
                        const sortOrderB = b.sort_order || 0;
                        if (sortOrderA !== sortOrderB) {
                          return sortOrderA - sortOrderB;
                        }
                        return a.price - b.price;
                      });
                    });

                    return (
                      <div className="space-y-6 font-sans">
                        {sortedCategories.map((category, categoryIndex) => (
                          <div key={category}>
                            {/* Category Header - Diginix cyan accent */}
                            <h4 className="text-base font-bold text-white mb-2 font-sans border-b border-cafe-primary/50 pb-1">{category}</h4>
                            
                            {/* Packages Grid */}
                            <div className="grid grid-cols-2 gap-2">
                              {groupedByCategory[category].variations.map((variation) => {
                                const originalPrice = variation.price;
                                // Recalculate price on every render to ensure it updates immediately on login/logout
                                const discountedPrice = getDiscountedPriceSync(originalPrice, variation.id);
                                const hasMemberDiscount = isReseller() && currentMember && memberDiscounts[variation.id];
                                const isDiscounted = hasMemberDiscount || (item.isOnDiscount && item.discountPercentage !== undefined);
                                
                                return (
                                  <button
                                    key={variation.id}
                                    onClick={() => handleItemSelect(variation)}
                                    className="bg-cafe-darkCard border border-cafe-primary/30 rounded-lg p-2.5 text-left group shadow-md relative overflow-hidden transition-all duration-200 hover:border-cafe-primary hover:bg-cafe-primary/10 hover:shadow-[0_0_16px_rgba(107,114,128,0.2)]"
                                    style={{
                                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <div className="font-semibold text-cafe-text text-xs mb-0.5">
                                        {variation.name}
                                      </div>
                                      {variation.description && (
                                        <div className="text-xs text-cafe-textMuted mb-2 line-clamp-2">
                                          {variation.description}
                                        </div>
                                      )}
                                      <div className="mt-auto">
                                        <div className="text-sm font-bold text-cafe-primary">
                                          ₱{discountedPrice.toFixed(2)}
                                        </div>
                                        {isDiscounted && (
                                          <div className="flex items-center gap-2 mt-1">
                                            <div className="text-xs text-cafe-textMuted line-through">
                                              ₱{originalPrice.toFixed(2)}
                                            </div>
                                            {hasMemberDiscount ? (
                                              <div className="text-xs text-cafe-secondary font-semibold">
                                                Member Price
                                              </div>
                                            ) : (
                                              <div className="text-xs text-cafe-primary font-semibold">
                                                -{(item.discountPercentage * 100).toFixed(0)}%
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Divider between categories - Diginix accent */}
                            {categoryIndex < sortedCategories.length - 1 && (
                              <div className="border-t border-cafe-primary/20 my-4"></div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-8 text-cafe-textMuted">
                    No currency packages available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MenuItemCard;