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
import { useMenu } from './hooks/useMenu';
import { useMemberAuth } from './hooks/useMemberAuth';
import Footer from './components/Footer';

function MainApp() {
  const cart = useCart();
  const { menuItems } = useMenu();
  const { currentMember, logout, loading: authLoading } = useMemberAuth();
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart' | 'checkout' | 'member-login'>('menu');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [showWelcomeModal, setShowWelcomeModal] = React.useState(false);
  const [showMemberProfile, setShowMemberProfile] = React.useState(false);
  const [justLoggedIn, setJustLoggedIn] = React.useState(false);

  const handleViewChange = (view: 'menu' | 'cart' | 'checkout') => {
    setCurrentView(view);
  };

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
    <div className="min-h-screen bg-cafe-darkBg bg-logo-overlay">
      {currentView !== 'member-login' && (
        <Header 
          cartItemsCount={cart.getTotalItems()}
          onCartClick={() => handleViewChange('cart')}
          onMenuClick={() => handleViewChange('menu')}
          onMemberClick={handleMemberClick}
          currentMember={currentMember}
        />
      )}
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