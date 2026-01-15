import React, { useEffect, useState, useRef } from 'react';
import { X, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { useOrders } from '../hooks/useOrders';

interface OrderStatusModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSucceededClose?: () => void; // Callback when closing a succeeded order
}

const OrderStatusModal: React.FC<OrderStatusModalProps> = ({ orderId, isOpen, onClose, onSucceededClose }) => {
  const { fetchOrderById } = useOrders();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const isInitialLoad = useRef(true);
  const shouldContinuePolling = useRef(true);

  useEffect(() => {
    if (isOpen && orderId) {
      isInitialLoad.current = true;
      shouldContinuePolling.current = true;
      loadOrder(true);
      // Poll for order updates every 3 seconds, but stop if order is in final state
      const interval = setInterval(() => {
        // Only continue polling if we should (order is still pending or processing)
        if (shouldContinuePolling.current) {
          loadOrder(false);
        }
      }, 3000);
      return () => clearInterval(interval);
    } else {
      // Only reset when modal closes AND order is not approved
      // Keep order data if it was approved so user can see it when reopening
      if (order?.status !== 'approved') {
        setOrder(null);
        setLoading(true);
        isInitialLoad.current = true;
        shouldContinuePolling.current = true;
      }
    }
  }, [isOpen, orderId, order]);

  const loadOrder = async (isInitial: boolean) => {
    if (!orderId) return;
    
    if (isInitial) {
      setLoading(true);
    }
    
    const orderData = await fetchOrderById(orderId);
    
    if (orderData) {
      // Stop polling if order reaches final state (approved or rejected)
      if (orderData.status === 'approved' || orderData.status === 'rejected') {
        shouldContinuePolling.current = false;
      }
      
      // Always update the order data to ensure it stays visible
      // This ensures order information remains visible even when status changes to approved
      setOrder(prevOrder => {
        if (!prevOrder || isInitial) {
          return orderData;
        }
        // Always update to latest order data, especially when status changes to approved
        // This ensures the order information is always current and visible
        if (prevOrder.status !== orderData.status || prevOrder.updated_at !== orderData.updated_at) {
          return orderData;
        }
        // If status is approved, always keep the approved order data visible
        if (orderData.status === 'approved') {
          return orderData;
        }
        // Keep previous order if nothing changed (to prevent unnecessary re-renders)
        return prevOrder;
      });
    } else {
      // If order data is not found, only clear on initial load
      // Otherwise keep the existing order data visible (especially for approved orders)
      if (isInitial) {
        setOrder(null);
      }
      // Don't clear existing order if fetch fails and we already have order data
    }
    
    if (isInitial) {
      setLoading(false);
      isInitialLoad.current = false;
    }
  };

  if (!isOpen) return null;

  const getStatusDisplay = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return { text: 'Processing', icon: Loader2, color: 'text-cafe-primary' };
      case 'processing':
        return { text: 'Processing', icon: Loader2, color: 'text-cafe-primary' };
      case 'approved':
        return { text: 'Succeeded', icon: CheckCircle, color: 'text-green-400' };
      case 'rejected':
        return { text: 'Rejected', icon: XCircle, color: 'text-red-400' };
      default:
        return { text: 'Processing', icon: Loader2, color: 'text-cafe-primary' };
    }
  };

  const statusDisplay = order ? getStatusDisplay(order.status) : null;
  const StatusIcon = statusDisplay?.icon || Loader2;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          {order && (order.status === 'pending' || order.status === 'processing') && (
            <p className="text-xs text-yellow-200 mb-4 font-light">
              Please do not exit this website while your order is being processed
            </p>
          )}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-cafe-text">Order Status</h2>
              {order && (
                <p className="text-sm text-cafe-textMuted mt-1">
                  Order #{order.id.slice(0, 8)}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                // If order is succeeded and onSucceededClose is provided, call it
                if (order?.status === 'approved' && onSucceededClose) {
                  onSucceededClose();
                } else {
                  onClose();
                }
              }}
              className="p-2 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200"
            >
              <X className="h-5 w-5 text-cafe-text" />
            </button>
          </div>
        </div>

        {loading && !order ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-cafe-primary animate-spin" />
          </div>
        ) : order ? (
          <div className="space-y-6">
            {/* Status Display */}
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex items-center gap-3">
                <StatusIcon className={`h-8 w-8 ${statusDisplay?.color} ${order.status === 'processing' || order.status === 'pending' ? 'animate-spin' : ''}`} />
                <span className={`text-2xl font-semibold ${statusDisplay?.color}`}>
                  {statusDisplay?.text}
                </span>
              </div>
              {order.created_at && (
                <p className="text-sm text-cafe-textMuted">
                  {new Date(order.created_at).toLocaleString()}
                </p>
              )}
            </div>

            {/* Order Details */}
            <div className="glass-strong rounded-lg p-4 border border-cafe-primary/30">
              <h3 className="font-medium text-cafe-text mb-4">Order Details</h3>
              <div className="space-y-3">
                {order.order_items.map((item, index) => (
                  <div key={index} className="flex items-start gap-4 py-2 border-b border-cafe-primary/20 last:border-b-0">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg">
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
                      <h4 className="font-medium text-cafe-text">{item.name}</h4>
                      {item.selectedVariation && (
                        <p className="text-sm text-cafe-textMuted">Package: {item.selectedVariation.name}</p>
                      )}
                      {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                        <p className="text-sm text-cafe-textMuted">
                          Add-ons: {item.selectedAddOns.map(addOn => 
                            addOn.quantity && addOn.quantity > 1 
                              ? `${addOn.name} x${addOn.quantity}`
                              : addOn.name
                          ).join(', ')}
                        </p>
                      )}
                      <p className="text-sm text-cafe-textMuted">₱{item.totalPrice} × {item.quantity}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-cafe-primary/30">
                <div className="flex items-center justify-between text-xl font-semibold text-cafe-text">
                  <span>Total:</span>
                  <span className="text-white">₱{order.total_price}</span>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            <div className="glass-strong rounded-lg p-4 border border-cafe-primary/30">
              <h3 className="font-medium text-cafe-text mb-4">Customer Information</h3>
              {order.customer_info['Multiple Accounts'] ? (
                // Multiple accounts mode
                <div className="space-y-4">
                  {(order.customer_info['Multiple Accounts'] as Array<{
                    game: string;
                    package: string;
                    fields: Record<string, string>;
                  }>).map((account, accountIndex) => (
                    <div key={accountIndex} className="pb-4 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                      <div className="mb-2">
                        <p className="text-sm font-semibold text-cafe-text">{account.game}</p>
                        <p className="text-xs text-cafe-textMuted">Package: {account.package}</p>
                      </div>
                      <div className="space-y-2 mt-2">
                        {Object.entries(account.fields).map(([key, value]) => (
                          <p key={key} className="text-sm text-cafe-textMuted">
                            {key}: {value}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Single account mode (default)
                <div className="space-y-2">
                  {Object.entries(order.customer_info).map(([key, value]) => (
                    <p key={key} className="text-sm text-cafe-textMuted">
                      {key}: {value}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-cafe-textMuted">Order not found</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-cafe-primary/20">
          <p className="text-xs text-cafe-textMuted text-center">
            by AmberKinGamerXtream
          </p>
        </div>
      </div>
    </div>
  );
};

export default OrderStatusModal;
