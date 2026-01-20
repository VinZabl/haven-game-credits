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

  useEffect(() => {
    if (isOpen && orderId) {
      isInitialLoad.current = true;
      loadOrder(true);
      // Poll for order updates every 3 seconds
      const interval = setInterval(() => loadOrder(false), 3000);
      return () => clearInterval(interval);
    } else {
      // Reset when modal closes
      setOrder(null);
      setLoading(true);
      isInitialLoad.current = true;
    }
  }, [isOpen, orderId]);

  const loadOrder = async (isInitial: boolean) => {
    if (!orderId) return;
    
    if (isInitial) {
      setLoading(true);
    }
    
    const orderData = await fetchOrderById(orderId);
    
    if (orderData) {
      // Only update if status or updated_at changed (indicating a real update)
      setOrder(prevOrder => {
        if (!prevOrder || isInitial) {
          return orderData;
        }
        // Only update if status or updated_at timestamp changed
        if (prevOrder.status !== orderData.status || prevOrder.updated_at !== orderData.updated_at) {
          return orderData;
        }
        return prevOrder; // Keep previous order to prevent unnecessary re-renders
      });
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
        return { text: 'Cancelled', icon: XCircle, color: 'text-red-400' };
      default:
        return { text: 'Processing', icon: Loader2, color: 'text-cafe-primary' };
    }
  };

  const statusDisplay = order ? getStatusDisplay(order.status) : null;
  const StatusIcon = statusDisplay?.icon || Loader2;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-cafe-text">Order Status</h2>
            {order && (
              <p className="text-sm text-cafe-textMuted mt-1">
                Order {order.invoice_number ? `#${order.invoice_number}` : `#${order.id.slice(0, 8)}`}
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

        {loading ? (
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
              <div className="space-y-2">
                {Object.entries(order.customer_info).map(([key, value]) => (
                  <p key={key} className="text-sm text-cafe-textMuted">
                    {key}: {value}
                  </p>
                ))}
              </div>
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
