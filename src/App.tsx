import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useCart } from './hooks/useCart';
import Header from './components/Header';
import SubNav from './components/SubNav';
import Menu from './components/Menu';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import FloatingSupportButton from './components/FloatingSupportButton';
import AdminDashboard from './components/AdminDashboard';
import MemberLogin from './components/MemberLogin';
import WelcomeModal from './components/WelcomeModal';
import MemberProfile from './components/MemberProfile';
import OrderStatusModal from './components/OrderStatusModal';
import { useMenu } from './hooks/useMenu';
import { useMemberAuth } from './hooks/useMemberAuth';
import { useOrders } from './hooks/useOrders';
import Footer from './components/Footer';

function MainApp() {
  const { currentMember, logout, loading: authLoading } = useMemberAuth();
  const cart = useCart(currentMember);
  const { menuItems } = useMenu();
  const { fetchOrderById } = useOrders();
  
  // Load saved state from localStorage on mount
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart' | 'checkout' | 'member-login'>(() => {
    const savedView = localStorage.getItem('amber_currentView') as 'menu' | 'cart' | 'checkout' | 'member-login' | null;
    return savedView || 'menu';
  });
  const [selectedCategory, setSelectedCategory] = React.useState<string>(() => {
    return localStorage.getItem('amber_selectedCategory') || 'all';
  });
  const [searchQuery, setSearchQuery] = React.useState<string>(() => {
    return localStorage.getItem('amber_searchQuery') || '';
  });
  const [showWelcomeModal, setShowWelcomeModal] = React.useState(false);
  const [showMemberProfile, setShowMemberProfile] = React.useState(false);
  const [justLoggedIn, setJustLoggedIn] = React.useState(false);
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);
  const [showOrderStatusModal, setShowOrderStatusModal] = React.useState(false);

  // Save state to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem('amber_currentView', currentView);
  }, [currentView]);

  React.useEffect(() => {
    localStorage.setItem('amber_selectedCategory', selectedCategory);
  }, [selectedCategory]);

  React.useEffect(() => {
    localStorage.setItem('amber_searchQuery', searchQuery);
  }, [searchQuery]);

  const handleViewChange = (view: 'menu' | 'cart' | 'checkout') => {
    // Save current scroll position before changing view
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    if (currentView === 'menu') {
      localStorage.setItem('amber_menuScrollPos', scrollPosition.toString());
    } else if (currentView === 'cart') {
      localStorage.setItem('amber_cartScrollPos', scrollPosition.toString());
    }
    setCurrentView(view);
  };

  // Restore scroll position when view changes
  React.useEffect(() => {
    const restoreScroll = () => {
      if (currentView === 'menu') {
        const savedScroll = localStorage.getItem('amber_menuScrollPos');
        if (savedScroll) {
          setTimeout(() => {
            window.scrollTo({ top: parseInt(savedScroll), behavior: 'auto' });
          }, 100);
        }
      } else if (currentView === 'cart') {
        const savedScroll = localStorage.getItem('amber_cartScrollPos');
        if (savedScroll) {
          setTimeout(() => {
            window.scrollTo({ top: parseInt(savedScroll), behavior: 'auto' });
          }, 100);
        }
      }
    };

    // Only restore scroll if not coming from item added (which should scroll to top)
    const skipRestore = localStorage.getItem('amber_skipScrollRestore');
    if (!skipRestore) {
      restoreScroll();
    } else {
      localStorage.removeItem('amber_skipScrollRestore');
    }
  }, [currentView]);

  // Save scroll position periodically while on a page
  React.useEffect(() => {
    const handleScroll = () => {
      if (currentView === 'menu') {
        const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        localStorage.setItem('amber_menuScrollPos', scrollPosition.toString());
      } else if (currentView === 'cart') {
        const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        localStorage.setItem('amber_cartScrollPos', scrollPosition.toString());
      }
    };

    // Throttle scroll events
    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });
    
    // Also save on page unload/refresh
    window.addEventListener('beforeunload', handleScroll);

    return () => {
      window.removeEventListener('scroll', throttledScroll);
      window.removeEventListener('beforeunload', handleScroll);
    };
  }, [currentView]);

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
    // Clear search when changing category
    setSearchQuery('');
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // If searching, set category to 'all' to show all results
    if (query.trim() !== '') {
      setSelectedCategory('all');
    }
  };

  // Handler for when item is added from package selection modal
  const handleItemAdded = React.useCallback(() => {
    // Mark to skip scroll restore since we want to scroll to top for new items
    localStorage.setItem('amber_skipScrollRestore', 'true');
    // Redirect to cart view after adding item from modal
    setCurrentView('cart');
  }, []);

  // Check if there are any popular items
  const hasPopularItems = React.useMemo(() => {
    return menuItems.some(item => Boolean(item.popular) === true);
  }, [menuItems]);

  // If user is on popular category but there are no popular items, redirect to 'all'
  React.useEffect(() => {
    if (selectedCategory === 'popular' && !hasPopularItems && menuItems.length > 0) {
      setSelectedCategory('all');
    }
  }, [hasPopularItems, selectedCategory, menuItems.length]);

  // Show welcome modal when member logs in
  React.useEffect(() => {
    if (currentMember && justLoggedIn) {
      setShowWelcomeModal(true);
      setJustLoggedIn(false);
    }
  }, [currentMember, justLoggedIn]);

  // Redirect from login view if member is already logged in
  React.useEffect(() => {
    // Wait for auth to finish loading before checking
    if (!authLoading && currentMember && currentView === 'member-login') {
      setCurrentView('menu');
      setJustLoggedIn(true);
    }
  }, [currentMember, currentView, authLoading]);

  // Check for pending order with "place_order" option when app loads
  React.useEffect(() => {
    const checkPendingOrder = async () => {
      // Wait for auth to finish loading
      if (authLoading) return;

      // Check localStorage for pending order ID
      const storedOrderId = localStorage.getItem('pendingPlaceOrderId');
      if (!storedOrderId) return;

      try {
        // Fetch the order to check its status
        const order = await fetchOrderById(storedOrderId);
        
        if (order && order.order_option === 'place_order') {
          // Only show modal if order is still pending or processing
          if (order.status === 'pending' || order.status === 'processing') {
            setPendingOrderId(storedOrderId);
            setShowOrderStatusModal(true);
          } else {
            // Order is completed (approved/rejected), clear localStorage
            localStorage.removeItem('pendingPlaceOrderId');
          }
        } else {
          // Order doesn't exist or is not place_order option, clear localStorage
          localStorage.removeItem('pendingPlaceOrderId');
        }
      } catch (error) {
        console.error('Error checking pending order:', error);
        // Clear localStorage on error
        localStorage.removeItem('pendingPlaceOrderId');
      }
    };

    checkPendingOrder();
  }, [authLoading, fetchOrderById]);


  const handleMemberClick = () => {
    if (currentMember) {
      // If already logged in, show member profile
      setShowMemberProfile(true);
    } else {
      setCurrentView('member-login');
    }
  };

  const handleGetStarted = () => {
    // Show profile after Get Started is clicked
    setShowMemberProfile(true);
  };

  const handleLogout = () => {
    logout();
    setShowMemberProfile(false);
    setShowWelcomeModal(false);
  };

  const handleLoginSuccess = () => {
    // Force view change immediately
    setCurrentView('menu');
    // Set justLoggedIn to trigger welcome modal
    setJustLoggedIn(true);
  };

  // Filter menu items based on selected category and search query
  const filteredMenuItems = React.useMemo(() => {
    let filtered = menuItems;

    // First filter by category
    if (selectedCategory === 'popular') {
      filtered = filtered.filter(item => Boolean(item.popular) === true);
    } else if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }

    // Then filter by search query if present
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [menuItems, selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen theme-page-bg">
      {currentView !== 'member-login' && (
        <div className="sticky-nav-bar sticky top-0 z-50 w-full">
          <Header
            cartItemsCount={cart.getTotalItems()}
            onCartClick={() => handleViewChange('cart')}
            onMenuClick={() => handleViewChange('menu')}
            onMemberClick={handleMemberClick}
            currentMember={currentMember}
          />
          {currentView === 'menu' && (
            <SubNav
              selectedCategory={selectedCategory}
              onCategoryClick={handleCategoryClick}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              hasPopularItems={hasPopularItems}
              currentMember={currentMember}
            />
          )}
        </div>
      )}
      
      {currentView === 'menu' && (
        <Menu 
          menuItems={filteredMenuItems}
          addToCart={cart.addToCart}
          cartItems={cart.cartItems}
          updateQuantity={cart.updateQuantity}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          currentMember={currentMember}
          onItemAdded={handleItemAdded}
        />
      )}
      
      {currentView === 'cart' && (
        <Cart 
          cartItems={cart.cartItems}
          getEffectiveUnitPrice={cart.getEffectiveUnitPrice}
          updateQuantity={cart.updateQuantity}
          removeFromCart={cart.removeFromCart}
          clearCart={cart.clearCart}
          getTotalPrice={cart.getTotalPrice}
          onContinueShopping={() => handleViewChange('menu')}
          onCheckout={() => handleViewChange('checkout')}
        />
      )}
      
      {currentView === 'checkout' && (
        <Checkout 
          cartItems={cart.cartItems}
          getEffectiveUnitPrice={cart.getEffectiveUnitPrice}
          totalPrice={cart.getTotalPrice()}
          onBack={() => handleViewChange('cart')}
          onNavigateToMenu={() => {
            cart.clearCart();
            handleViewChange('menu');
          }}
        />
      )}

      {currentView === 'member-login' && (
        <MemberLogin 
          onBack={() => handleViewChange('menu')}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
      
      {showWelcomeModal && currentMember && (
        <WelcomeModal 
          username={currentMember.username}
          onClose={() => setShowWelcomeModal(false)}
          onGetStarted={handleGetStarted}
        />
      )}
      {showMemberProfile && currentMember && (
        <MemberProfile
          onClose={() => setShowMemberProfile(false)}
          onLogout={handleLogout}
        />
      )}

      {/* Order Status Modal for pending "place_order" orders */}
      <OrderStatusModal
        orderId={pendingOrderId}
        isOpen={showOrderStatusModal}
        onClose={() => {
          setShowOrderStatusModal(false);
          // Don't clear localStorage here - let it clear when order is completed
        }}
        onSucceededClose={() => {
          // Order is approved/rejected, clear localStorage and close modal
          localStorage.removeItem('pendingPlaceOrderId');
          setShowOrderStatusModal(false);
          setPendingOrderId(null);
        }}
      />
      
      {currentView !== 'member-login' && (
        <>
          <FloatingSupportButton />
          <Footer />
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/member/login" element={<MainApp />} />
      </Routes>
    </Router>
  );
}

export default App;