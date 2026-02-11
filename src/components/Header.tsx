import React from 'react';
import { ShoppingCart, Coins } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { Member } from '../types';

interface HeaderProps {
  cartItemsCount: number;
  onCartClick: () => void;
  onMenuClick: () => void;
  onMemberClick?: () => void;
  currentMember?: Member | null;
}

const Header: React.FC<HeaderProps> = ({ cartItemsCount, onCartClick, onMenuClick, onMemberClick, currentMember }) => {
  const { siteSettings } = useSiteSettings();
  const logoUrl = (siteSettings?.site_logo && siteSettings.site_logo.trim() !== '') ? siteSettings.site_logo : '/logo.png';

  return (
    <header className="w-full" style={{
      background: 'rgba(10, 10, 10, 0.55)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 md:py-2">
        <div className="flex items-center justify-between min-h-10 md:min-h-12">
          <button 
            onClick={onMenuClick}
            className="text-white hover:opacity-80 transition-colors duration-200 flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-initial justify-start"
          >
            <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full overflow-hidden border border-cafe-primary/20 bg-cafe-darkCard/80 flex items-center justify-center">
              <img 
                src={logoUrl}
                alt={`${siteSettings?.site_name || 'Heven Game Credit'} Logo`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  if (e.currentTarget.src !== '/logo.png') {
                    e.currentTarget.src = '/logo.png';
                  }
                }}
              />
            </div>
            <span className="text-xs sm:text-sm md:text-base font-bold text-white truncate">
              {siteSettings?.site_name || 'Heven Game Credit'}
            </span>
          </button>

          <div className="flex items-center space-x-2">
            {/* Welcome back text - Desktop only */}
            {currentMember && (
              <div className="hidden md:flex items-center gap-2 mr-2">
                <p className="text-sm text-cafe-text">
                  <span className="text-cafe-textMuted">Welcome back,</span> <span className="font-semibold ml-2">{currentMember.username}</span>
                </p>
              </div>
            )}
            {onMemberClick && (
              <button 
                onClick={onMemberClick}
                className="p-2 text-cafe-text hover:text-cafe-primary hover:bg-cafe-primary/20 rounded-full transition-all duration-200"
              >
                {currentMember?.user_type === 'reseller' ? (
                  <Coins className="h-6 w-6 text-yellow-500" />
                ) : (
                  <Coins className="h-6 w-6" />
                )}
              </button>
            )}
            <button 
              onClick={onCartClick}
              className="relative p-2 text-white hover:opacity-80 hover:bg-white/10 rounded-full transition-all duration-200"
            >
              <ShoppingCart className="h-6 w-6" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-gradient-to-r from-cafe-primary to-cafe-secondary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-bounce-gentle glow-blue">
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;