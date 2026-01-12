import React from 'react';
import { MenuItem, CartItem } from '../types';
import { useCategories } from '../hooks/useCategories';
import MenuItemCard from './MenuItemCard';

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
  addToCart: (item: MenuItem, quantity?: number, variation?: any, addOns?: any[]) => void;
  cartItems: CartItem[];
  updateQuantity: (id: string, quantity: number) => void;
  selectedCategory: string;
  searchQuery?: string;
  onItemAdded?: () => void; // Callback when item is added from modal
}

const Menu: React.FC<MenuProps> = ({ menuItems, addToCart, cartItems, updateQuantity, selectedCategory, searchQuery = '', onItemAdded }) => {
  const { categories } = useCategories();
  const [activeCategory, setActiveCategory] = React.useState(selectedCategory === 'popular' ? 'popular' : 'hot-coffee');

  // Preload images when menu items change
  React.useEffect(() => {
    if (menuItems.length > 0) {
      // Preload images for visible category first
      let visibleItems: MenuItem[];
      if (selectedCategory === 'popular') {
        visibleItems = menuItems.filter(item => Boolean(item.popular) === true);
      } else if (selectedCategory === 'all') {
        visibleItems = menuItems;
      } else {
        visibleItems = menuItems.filter(item => item.category === activeCategory);
      }
      preloadImages(visibleItems);
      
      // Then preload other images after a short delay
      setTimeout(() => {
        const otherItems = menuItems.filter(item => {
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
  }, [menuItems, activeCategory, selectedCategory]);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(categoryId);
    if (element) {
      const headerHeight = 64; // Header height
      const subNavHeight = 60; // SubNav height
      const offset = headerHeight + subNavHeight + 20; // Extra padding
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
    
    if (categories.length > 0) {
      // Set default to dim-sum if it exists, otherwise first category
      const defaultCategory = categories.find(cat => cat.id === 'dim-sum') || categories[0];
      if (!categories.find(cat => cat.id === activeCategory) && selectedCategory !== 'popular') {
        setActiveCategory(defaultCategory.id);
      }
    }
  }, [categories, activeCategory, selectedCategory]);

  React.useEffect(() => {
    // Only handle scroll if not showing popular category
    if (selectedCategory === 'popular') {
      return;
    }

    const handleScroll = () => {
      const sections = categories.map(cat => document.getElementById(cat.id)).filter(Boolean);
      const scrollPosition = window.scrollY + 200;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveCategory(categories[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categories, selectedCategory]);


  // Helper function to render menu items
  const renderMenuItems = (items: MenuItem[]) => {
    return items.map((item) => {
      // Find cart items that match this menu item (by extracting menu item id from cart item id)
      // For simple items without variations/add-ons, sum all matching cart items
      const matchingCartItems = cartItems.filter(cartItem => {
        // Extract original menu item id (format: "menuItemId:::CART:::timestamp-random" or old format)
        const parts = cartItem.id.split(':::CART:::');
        const originalMenuItemId = parts.length > 1 ? parts[0] : cartItem.id.split('-')[0];
        return originalMenuItemId === item.id && 
               !cartItem.selectedVariation && 
               (!cartItem.selectedAddOns || cartItem.selectedAddOns.length === 0);
      });
      
      // Sum quantities of all matching simple items (for items without variations/add-ons)
      const quantity = matchingCartItems.reduce((sum, cartItem) => sum + cartItem.quantity, 0);
      
      // Get the first matching cart item for updateQuantity (if any)
      const primaryCartItem = matchingCartItems[0];
      
      return (
        <MenuItemCard
          key={item.id}
          item={item}
          onAddToCart={addToCart}
          quantity={quantity}
          onUpdateQuantity={(id, qty) => {
            // If we have a cart item, update it by its cart id
            if (primaryCartItem) {
              updateQuantity(primaryCartItem.id, qty);
            } else {
              // Otherwise, treat as adding a new item
              if (qty > 0) {
                addToCart(item, qty);
              }
            }
          }}
          onItemAdded={onItemAdded}
        />
      );
    });
  };

  // If there's a search query, show search results
  if (searchQuery.trim() !== '') {
    if (menuItems.length === 0) {
      return (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          <section className="mb-6 md:mb-8">
            <div className="flex items-center mb-3 md:mb-4">
              <h3 className="text-3xl font-medium text-cafe-text">Search Results</h3>
            </div>
            <p className="text-gray-500">No games found matching "{searchQuery}"</p>
          </section>
        </main>
      );
    }

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <section className="mb-16">
          <div className="flex items-center mb-8">
            <h3 className="text-3xl font-medium text-cafe-text">
              Search Results for "{searchQuery}"
            </h3>
            <span className="ml-4 text-sm text-gray-500">({menuItems.length} {menuItems.length === 1 ? 'game' : 'games'})</span>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            {renderMenuItems(menuItems)}
          </div>
        </section>
      </main>
    );
  }

  // If showing popular items, display them in a single section
  // Note: menuItems prop is already filtered by App.tsx when selectedCategory === 'popular'
  if (selectedCategory === 'popular') {
    // menuItems is already filtered to only popular items from App.tsx
    if (menuItems.length === 0) {
      return (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          <section id="popular" className="mb-6 md:mb-8">
            <div className="flex items-center mb-3 md:mb-4">
              <h3 className="text-3xl font-medium text-cafe-text">Popular</h3>
            </div>
            <p className="text-gray-500">No popular items available at the moment.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
        <section id="popular" className="mb-6 md:mb-8">
          <div className="flex items-center mb-3 md:mb-4">
            <h3 className="text-3xl font-medium text-cafe-text">Popular</h3>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            {renderMenuItems(menuItems)}
          </div>
        </section>
      </main>
    );
  }

  // Otherwise, display items grouped by category
  // If viewing "All", also show Popular section at the top (only when not searching)
  const popularItems = menuItems.filter(item => Boolean(item.popular) === true);
  const showPopularSection = selectedCategory === 'all' && popularItems.length > 0 && searchQuery.trim() === '';

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-6 pb-4 md:pb-6">
        {/* Show Popular section when viewing "All" */}
        {showPopularSection && (
          <section id="popular" className="mb-8 md:mb-12">
            <div className="flex items-center mb-3 md:mb-4">
              <h3 className="text-3xl font-medium text-cafe-text">Popular</h3>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              {renderMenuItems(popularItems)}
            </div>
          </section>
        )}

        {/* Regular category sections */}
        {categories.map((category) => {
          const categoryItems = menuItems.filter(item => item.category === category.id);
          
          if (categoryItems.length === 0) return null;
          
          return (
            <section key={category.id} id={category.id} className="mb-8 md:mb-12">
              <div className="flex items-center mb-3 md:mb-4">
                <h3 className="text-3xl font-medium text-cafe-text">{category.name}</h3>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                {renderMenuItems(categoryItems)}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
};

export default Menu;