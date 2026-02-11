import React from 'react';
import { MenuItem, CartItem, Member } from '../types';
import { useCategories } from '../hooks/useCategories';
import { useSiteSettings } from '../hooks/useSiteSettings';
import MenuItemCard from './MenuItemCard';
import Hero from './Hero';

// Preload images for better performance
const preloadImages = (items: MenuItem[]) => {
  items.forEach(item => {
    if (item.image) {
      const img = new Image();
      img.src = item.image;
    }
  });
};

interface MenuProps {
  menuItems: MenuItem[];
  addToCart: (item: MenuItem, quantity?: number, variation?: any, addOns?: any[], effectiveUnitPrice?: number) => void;
  cartItems: CartItem[];
  updateQuantity: (id: string, quantity: number) => void;
  selectedCategory: string;
  searchQuery?: string;
  onItemAdded?: () => void; // Callback when item is added from modal
  currentMember?: Member | null; // Current logged-in member
}

const Menu: React.FC<MenuProps> = ({ menuItems, addToCart, cartItems, updateQuantity, selectedCategory, searchQuery = '', onItemAdded, currentMember }) => {
  const { categories } = useCategories();
  const { siteSettings } = useSiteSettings();
  const [activeCategory, setActiveCategory] = React.useState(selectedCategory === 'popular' ? 'popular' : 'hot-coffee');
  const menuItemsSafe = Array.isArray(menuItems) ? menuItems : [];

  // Preload images when menu items change
  React.useEffect(() => {
    if (menuItemsSafe.length > 0) {
      // Preload images for visible category first
      let visibleItems: MenuItem[];
      if (selectedCategory === 'popular') {
        visibleItems = menuItemsSafe.filter(item => Boolean(item.popular) === true);
      } else if (selectedCategory === 'all') {
        visibleItems = menuItemsSafe;
      } else {
        visibleItems = menuItemsSafe.filter(item => item.category === activeCategory);
      }
      preloadImages(visibleItems);
      
      // Then preload other images after a short delay
      setTimeout(() => {
        const otherItems = menuItemsSafe.filter(item => {
          if (selectedCategory === 'popular') {
            return item.popular !== true;
          } else if (selectedCategory === 'all') {
            return false; // Already loaded all
          } else {
            return item.category !== activeCategory;
          }
        });
        preloadImages(otherItems);
      }, 1000);
    }
  }, [menuItemsSafe, activeCategory, selectedCategory]);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(categoryId);
    if (element) {
      const combinedBarHeight = 100; // Header + search + category nav (one sticky bar)
      const offset = combinedBarHeight + 16; // Extra padding
      const elementPosition = element.offsetTop - offset;
      
      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
      });
    }
  };

  React.useEffect(() => {
    // If selectedCategory is 'popular', set activeCategory to 'popular'
    if (selectedCategory === 'popular') {
      setActiveCategory('popular');
      return;
    }
    
    const list = Array.isArray(categories) ? categories : [];
    if (list.length > 0) {
      // Set default to dim-sum if it exists, otherwise first category
      const defaultCategory = list.find(cat => cat.id === 'dim-sum') || list[0];
      if (defaultCategory && !list.find(cat => cat.id === activeCategory) && selectedCategory !== 'popular') {
        setActiveCategory(defaultCategory.id);
      }
    }
  }, [categories, activeCategory, selectedCategory]);

  React.useEffect(() => {
    // Only handle scroll if not showing popular category
    if (selectedCategory === 'popular') {
      return;
    }

    const list = Array.isArray(categories) ? categories : [];
    const handleScroll = () => {
      const sections = list.map(cat => document.getElementById(cat.id)).filter(Boolean);
      const scrollPosition = window.scrollY + 200;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition && list[i]) {
          setActiveCategory(list[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categories, selectedCategory]);

  // Get hero images for slideshow (only show on "All" category) – must run before any early return (hooks order)
  const heroImages = React.useMemo(() => {
    if (!siteSettings || selectedCategory !== 'all') return [];
    return [
      siteSettings.hero_image_1,
      siteSettings.hero_image_2,
      siteSettings.hero_image_3,
      siteSettings.hero_image_4,
      siteSettings.hero_image_5,
    ].filter((img): img is string => typeof img === 'string' && img.trim() !== '');
  }, [siteSettings, selectedCategory]);

  // Helper function to render menu items. layout: 'horizontal' for Popular (icon left, text right), 'vertical' for others (icon top, text below).
  const renderMenuItems = (items: MenuItem[], itemLayout: 'horizontal' | 'vertical' = 'vertical') => {
    const list = Array.isArray(items) ? items : [];
    return list.map((item) => {
      // Find cart items that match this menu item (by extracting menu item id from cart item id)
      const matchingCartItems = cartItems.filter(cartItem => {
        const parts = cartItem.id.split(':::CART:::');
        const originalMenuItemId = parts.length > 1 ? parts[0] : cartItem.id.split('-')[0];
        return originalMenuItemId === item.id && 
               !cartItem.selectedVariation && 
               (!cartItem.selectedAddOns || cartItem.selectedAddOns.length === 0);
      });
      const quantity = matchingCartItems.reduce((sum, cartItem) => sum + cartItem.quantity, 0);
      const primaryCartItem = matchingCartItems[0];
      
      return (
        <MenuItemCard
          key={`${item.id}-${currentMember?.id || 'guest'}-${currentMember?.user_type || 'none'}`}
          item={item}
          onAddToCart={addToCart}
          quantity={quantity}
          onUpdateQuantity={(id, qty) => {
            if (primaryCartItem) {
              updateQuantity(primaryCartItem.id, qty);
            } else if (qty > 0) {
              addToCart(item, qty);
            }
          }}
          onItemAdded={onItemAdded}
          layout={itemLayout}
        />
      );
    });
  };

  // If there's a search query, show search results
  if (searchQuery.trim() !== '') {
    if (menuItemsSafe.length === 0) {
      return (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-5 pb-4 md:pb-6">
          <section className="mb-6 md:mb-8">
            <div className="flex items-center mb-3 md:mb-4">
            <h3 className="text-lg md:text-xl font-semibold text-cafe-text">Search Results</h3>
            </div>
            <p className="text-xs text-cafe-textMuted">No games found matching "{searchQuery}"</p>
          </section>
        </main>
      );
    }

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-5 pb-4 md:pb-6">
        <section className="mb-16">
          <div className="flex items-center mb-8">
            <h3 className="text-lg md:text-xl font-semibold text-cafe-text">
              Search Results for "{searchQuery}"
            </h3>
            <span className="ml-3 text-xs text-cafe-textMuted">({menuItemsSafe.length} {menuItemsSafe.length === 1 ? 'game' : 'games'})</span>
          </div>
          
          <div className="grid grid-cols-4 gap-2 sm:gap-3 md:gap-3">
            {renderMenuItems(menuItemsSafe, 'vertical')}
          </div>
        </section>
      </main>
    );
  }

  // Popular: same format as rest of game items (vertical: icon top, text below; 4 cols mobile, 6 desktop)
  if (selectedCategory === 'popular') {
    if (menuItemsSafe.length === 0) {
      return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-5 pb-4 md:pb-6">
          <section id="popular" className="mb-6 md:mb-8">
            <div className="flex items-center mb-3 md:mb-4">
              <h3 className="text-lg md:text-xl font-semibold text-cafe-text">Popular</h3>
            </div>
            <p className="text-xs text-cafe-textMuted">No popular items available at the moment.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-5 pb-4 md:pb-6">
        {/* Welcome back card - Mobile only */}
        {currentMember && (
          <div className="mb-4 md:hidden flex justify-center">
            <div className="glass-card rounded-lg px-3 py-2 inline-block">
              <div className="flex items-center justify-center">
                <p className="text-xs text-cafe-text">
                  <span className="text-cafe-textMuted">Welcome back,</span> <span className="font-semibold ml-1">{currentMember.username}</span>
                </p>
              </div>
            </div>
          </div>
        )}
        <section id="popular" className="mb-6 md:mb-8">
          <div className="flex items-center mb-2 md:mb-3">
            <h3 className="text-lg md:text-xl font-semibold text-cafe-text">Popular</h3>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3 md:gap-3">
            {renderMenuItems(menuItemsSafe, 'vertical')}
          </div>
        </section>
      </main>
    );
  }

  // Otherwise, display items grouped by category (vertical layout: icon top, text below)
  // If viewing "All", also show Popular section at the top (only when not searching)
  const popularItems = menuItemsSafe.filter(item => Boolean(item?.popular) === true);
  const showPopularSection = selectedCategory === 'all' && popularItems.length > 0 && searchQuery.trim() === '';

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-5 pb-4 md:pb-6">
        {/* Welcome message for logged-in members */}
        {/* Welcome back card - Mobile only */}
        {currentMember && (
          <div className="mb-4 md:hidden flex justify-center">
            <div className="glass-card rounded-lg px-3 py-2 inline-block">
              <div className="flex items-center justify-center">
                <p className="text-xs text-cafe-text">
                  <span className="text-cafe-textMuted">Welcome back,</span> <span className="font-semibold ml-1">{currentMember.username}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Hero Slideshow - Only show on "All" category */}
        {selectedCategory === 'all' && heroImages.length > 0 && (
          <Hero images={heroImages} />
        )}
        
        {/* Show Popular section when viewing "All" – mobile 3 cols, desktop 4 cols */}
        {showPopularSection && (
          <section id="popular" className="mb-8 md:mb-12">
            <div className="flex items-center mb-2 md:mb-3">
              <h3 className="text-lg md:text-xl font-semibold text-cafe-text">Popular</h3>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              {renderMenuItems(popularItems, 'horizontal')}
            </div>
          </section>
        )}

        {/* Regular category sections – mobile 4 cols, desktop 6 per row */}
        {(Array.isArray(categories) ? categories : []).map((category) => {
          const categoryItems = menuItemsSafe.filter(item => item.category === category.id);
          
          if (categoryItems.length === 0) return null;
          
          return (
            <section key={category.id} id={category.id} className="mb-8 md:mb-12">
              <div className="flex items-center mb-2 md:mb-3">
                <h3 className="text-lg md:text-xl font-semibold text-cafe-text font-sans">{category.name}</h3>
              </div>
              
              <div className="grid grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3 md:gap-3">
                {renderMenuItems(categoryItems, 'vertical')}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
};

export default Menu;