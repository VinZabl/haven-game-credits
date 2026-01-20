import React, { useState, useEffect } from 'react';
import { X, LogOut, History, User, ArrowLeft } from 'lucide-react';
import { useMemberAuth } from '../hooks/useMemberAuth';
import { supabase } from '../lib/supabase';
import { Order } from '../types';

interface MemberProfileProps {
  onClose: () => void;
  onLogout: () => void;
}

const MemberProfile: React.FC<MemberProfileProps> = ({ onClose, onLogout }) => {
  const { currentMember, isReseller } = useMemberAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (currentMember) {
      fetchMemberOrders();
    }
  }, [currentMember]);

  const fetchMemberOrders = async () => {
    try {
      setLoadingOrders(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('member_id', currentMember?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data as Order[]);
    } catch (err) {
      console.error('Error fetching member orders:', err);
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleLogout = () => {
    onLogout();
    onClose();
  };

  const getOrderStatus = (order: Order) => {
    const orderOption = order.order_option || 'place_order';
    // For messenger orders with pending status, show "Done via Messenger"
    if (orderOption === 'order_via_messenger' && order.status === 'pending') {
      return 'Done via Messenger';
    }
    return order.status;
  };

  const getOrderStatusClass = (order: Order) => {
    const displayStatus = getOrderStatus(order);
    if (displayStatus === 'Done via Messenger' || displayStatus === 'approved') {
      return 'bg-green-500/20 text-green-300';
    } else if (displayStatus === 'rejected') {
      return 'bg-red-500/20 text-red-300';
    } else if (displayStatus === 'processing') {
      return 'bg-yellow-500/20 text-yellow-300';
    } else {
      return 'bg-gray-500/20 text-gray-300';
    }
  };

  if (!currentMember) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-cafe-text">Profile</h2>
            <p className="text-sm text-cafe-textMuted mt-1">
              {isReseller() ? 'Reseller' : 'Member'} Account
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200"
          >
            <X className="h-5 w-5 text-cafe-text" />
          </button>
        </div>

        {/* Content */}
        <div>
          {!showOrderHistory ? (
            <>
              {/* User Info */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-cafe-primary to-cafe-secondary rounded-full mb-4">
                  <User className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-cafe-text mb-2">
                  {currentMember.username}
                </h3>
                <p className="text-cafe-textMuted capitalize">
                  {isReseller() ? 'Reseller' : 'Member'}
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowOrderHistory(true)}
                  className="w-full flex items-center space-x-3 p-4 glass-strong border border-cafe-primary/30 rounded-lg hover:bg-cafe-primary/20 transition-colors text-left"
                >
                  <History className="h-5 w-5 text-cafe-primary" />
                  <div className="flex-1">
                    <p className="font-semibold text-cafe-text">Order History</p>
                    <p className="text-sm text-cafe-textMuted">{orders.length} order(s)</p>
                  </div>
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-3 p-4 glass-strong border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors text-left"
                >
                  <LogOut className="h-5 w-5 text-red-400" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-400">Logout</p>
                    <p className="text-sm text-cafe-textMuted">Sign out of your account</p>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Order History */}
              <div className="mb-6">
                <button
                  onClick={() => setShowOrderHistory(false)}
                  className="flex items-center space-x-2 text-cafe-textMuted hover:text-cafe-text transition-colors mb-4"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Profile</span>
                </button>
                <div>
                  <h3 className="text-2xl font-semibold text-cafe-text">Order History</h3>
                  <p className="text-sm text-cafe-textMuted mt-1">{orders.length} order(s)</p>
                </div>
              </div>

              {loadingOrders ? (
                <div className="text-center text-cafe-textMuted py-12">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center text-cafe-textMuted py-12">No orders found.</div>
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="glass-strong rounded-lg p-4 border border-cafe-primary/30 cursor-pointer hover:bg-cafe-primary/10 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm text-cafe-text">{order.invoice_number ? `#${order.invoice_number}` : `#${order.id.slice(0, 8)}`}</p>
                          <p className="text-xs text-cafe-textMuted mt-1">
                            {new Date(order.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <p className="text-sm font-semibold text-cafe-text whitespace-nowrap">
                            ₱{order.total_price.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Header with Close Button */}
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200"
              >
                <X className="h-5 w-5 text-cafe-text" />
              </button>
            </div>

            {/* Order Number, Date, and Status */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm text-cafe-text">{selectedOrder.invoice_number ? `#${selectedOrder.invoice_number}` : `#${selectedOrder.id.slice(0, 8)}`}</p>
                <p className="text-xs text-cafe-textMuted mt-1">{new Date(selectedOrder.created_at).toLocaleString()}</p>
              </div>
              <span
                className={`px-3 py-1.5 rounded text-xs font-semibold flex-shrink-0 ml-2 ${getOrderStatusClass(selectedOrder)}`}
              >
                {getOrderStatus(selectedOrder)}
              </span>
            </div>

            {/* Order Details */}
            <div className="mb-4">
              <h3 className="font-medium text-cafe-text mb-3">Order Details</h3>
              {Array.isArray(selectedOrder.order_items) && selectedOrder.order_items.length > 0 ? (
                <div className="space-y-4">
                  {selectedOrder.order_items.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-xl opacity-20 text-gray-400">🎮</div>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-cafe-text text-sm mb-1">{item.name}</h4>
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
                        <p className="text-xs text-cafe-textMuted">₱{item.totalPrice} × {item.quantity}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className="font-semibold text-cafe-text text-sm">₱{(item.totalPrice * item.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-cafe-textMuted text-sm">No items</p>
              )}
            </div>

            {/* Customer Inputs (Custom Fields) */}
            {selectedOrder.customer_info && Object.keys(selectedOrder.customer_info).length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium text-cafe-text mb-3">Customer Information</h3>
                {Array.isArray(selectedOrder.customer_info) ? (
                  // Multiple accounts mode
                  <div className="space-y-3">
                    {selectedOrder.customer_info.map((account, idx) => (
                      <div key={idx} className="pb-3 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                        <p className="font-semibold text-cafe-text text-sm mb-2">{account.game}</p>
                        <p className="text-xs text-cafe-textMuted mb-2">Package: {account.package}</p>
                        <div className="space-y-1">
                          {Object.entries(account.fields).map(([label, value]) => (
                            <p key={label} className="text-xs text-cafe-textMuted">
                              <span className="font-medium">{label}:</span> {value}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Single account mode
                  <div className="space-y-1">
                    {Object.entries(selectedOrder.customer_info).map(([label, value]) => (
                      <p key={label} className="text-xs text-cafe-textMuted">
                        <span className="font-medium">{label}:</span> {value}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Total */}
            <div className="pt-4 border-t border-cafe-primary/30">
              <div className="flex items-center justify-between">
                <span className="font-medium text-cafe-text">Total:</span>
                <span className="font-semibold text-cafe-text text-lg">₱{selectedOrder.total_price.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberProfile;
