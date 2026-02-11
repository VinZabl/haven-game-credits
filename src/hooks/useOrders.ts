import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order, CreateOrderData, OrderStatus } from '../types';
import { useSiteSettings } from './useSiteSettings';

export const useOrders = () => {
  const { siteSettings } = useSiteSettings();
  const orderOption = siteSettings?.order_option || 'order_via_messenger';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all orders (optimized - only fetch essential fields, limit to recent orders)
  const fetchOrders = async (limit: number = 100, since?: string) => {
    try {
      setLoading(true);
      let query = supabase
        .from('orders')
        .select('id, invoice_number, status, total_price, payment_method_id, created_at, updated_at, member_id, order_option, order_items, customer_info, receipt_url, rejection_message')
        .order('created_at', { ascending: false })
        .limit(limit);

      // If since is provided, only fetch orders newer than that
      if (since) {
        query = query.gt('created_at', since);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (since && data && data.length > 0) {
        // Append new orders to the beginning, keep only the most recent 100
        setOrders(prev => {
          const combined = [...(data as Order[]), ...prev];
          // Remove duplicates by id
          const unique = combined.filter((order, index, self) => 
            index === self.findIndex(o => o.id === order.id)
          );
          // Keep only the most recent 100
          return unique.slice(0, limit);
        });
      } else {
        // Initial fetch or full refresh
        setOrders((data || []) as Order[]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch a single order by ID
  const fetchOrderById = async (orderId: string): Promise<Order | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError) throw fetchError;

      return data;
    } catch (err) {
      console.error('Error fetching order:', err);
      return null;
    }
  };

  // Create a new order
  const createOrder = async (orderData: CreateOrderData): Promise<Order | null> => {
    try {
      const { data, error: createError } = await supabase
        .from('orders')
        .insert({
          order_items: orderData.order_items,
          customer_info: orderData.customer_info,
          payment_method_id: orderData.payment_method_id,
          receipt_url: orderData.receipt_url,
          total_price: orderData.total_price,
          member_id: orderData.member_id || null,
          order_option: orderData.order_option || 'place_order',
          invoice_number: orderData.invoice_number || null,
          status: 'pending',
        })
        .select()
        .single();

      if (createError) throw createError;

      // Add new order to the list if we're in admin view
      if (orders.length > 0 && data) {
        setOrders(prev => {
          const updated = [data as Order, ...prev];
          // Keep only the most recent 100
          return updated.slice(0, 100);
        });
      } else if (orders.length === 0) {
        // If no orders loaded, fetch initial set
        await fetchOrders(100);
      }

      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
      console.error('Error creating order:', err);
      return null;
    }
  };

  // Update order status (rejectionMessage optional, used when status is 'rejected')
  const updateOrderStatus = async (orderId: string, status: OrderStatus, rejectionMessage?: string | null): Promise<boolean> => {
    try {
      const updatePayload: { status: OrderStatus; rejection_message?: string | null } = { status };
      if (status === 'rejected' && rejectionMessage !== undefined) {
        updatePayload.rejection_message = rejectionMessage && rejectionMessage.trim() ? rejectionMessage.trim() : null;
      }
      const { error: updateError } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Update the specific order in the list
      if (orders.length > 0) {
        setOrders(prev => prev.map(order =>
          order.id === orderId
            ? { ...order, status, rejection_message: status === 'rejected' ? (updatePayload.rejection_message ?? null) : null }
            : order
        ));
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order');
      console.error('Error updating order:', err);
      return false;
    }
  };

  // Subscribe to order changes via Supabase Realtime + polling fallback when order_option is 'place_order'
  useEffect(() => {
    if (orderOption !== 'place_order') return;

    // Initial fetch so dashboard badge/count and list are correct without opening Orders tab
    fetchOrders(100);

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload: { eventType?: string; event?: string; new?: Order; old?: { id: string } }) => {
          const eventType = payload.eventType ?? payload.event;
          if (eventType === 'INSERT') {
            const newOrder = payload.new as Order;
            if (!newOrder?.id) return;
            setOrders(prev => {
              if (prev.some(order => order.id === newOrder.id)) return prev;
              return [newOrder, ...prev].slice(0, 100);
            });
          } else if (eventType === 'UPDATE') {
            const updatedOrder = payload.new as Order;
            if (!updatedOrder?.id) return;
            setOrders(prev => prev.map(order =>
              order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order
            ));
          } else if (eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (!oldId) return;
            setOrders(prev => prev.filter(order => order.id !== oldId));
          }
        }
      )
      .subscribe();

    // Fallback: refetch every 20s so badge and list update even if Realtime doesn't deliver
    const pollInterval = setInterval(() => fetchOrders(100), 20000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [orderOption]);

  return {
    orders,
    loading,
    error,
    fetchOrders,
    fetchOrderById,
    createOrder,
    updateOrderStatus,
  };
};
