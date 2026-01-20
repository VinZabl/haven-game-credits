import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, X, Search, Eye, Filter, Edit } from 'lucide-react';
import { useMembers } from '../hooks/useMembers';
import { Member, MemberUserType, Order } from '../types';
import { supabase } from '../lib/supabase';

interface MemberManagerProps {
  onBack: () => void;
}

const MemberManager: React.FC<MemberManagerProps> = ({ onBack }) => {
  const { members, loading, fetchMembers, updateMember } = useMembers();
  
  const [memberFilter, setMemberFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'end_user' | 'reseller'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [viewingMemberOrders, setViewingMemberOrders] = useState<Member | null>(null);
  const [memberOrders, setMemberOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [memberOrderCounts, setMemberOrderCounts] = useState<Record<string, number>>({});
  const [memberTotalCosts, setMemberTotalCosts] = useState<Record<string, number>>({});
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // Filter and search members
  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      // Search filter
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        if (!member.username.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Status filter
      if (memberFilter === 'active' && member.status !== 'active') return false;
      if (memberFilter === 'inactive' && member.status !== 'inactive') return false;

      // User type filter
      if (userTypeFilter === 'end_user' && member.user_type !== 'end_user') return false;
      if (userTypeFilter === 'reseller' && member.user_type !== 'reseller') return false;

      return true;
    });
  }, [members, searchQuery, memberFilter, userTypeFilter]);

  // Sync editingMember with updated members array
  useEffect(() => {
    if (editingMember) {
      const updatedMember = members.find(m => m.id === editingMember.id);
      if (updatedMember && (
        updatedMember.user_type !== editingMember.user_type ||
        updatedMember.status !== editingMember.status
      )) {
        setEditingMember(updatedMember);
      }
    }
  }, [members, editingMember]);

  // Fetch order counts and total costs for all members
  useEffect(() => {
    const fetchOrderData = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('member_id, total_price')
          .not('member_id', 'is', null);

        if (error) throw error;

        const counts: Record<string, number> = {};
        const costs: Record<string, number> = {};
        data.forEach(order => {
          if (order.member_id) {
            counts[order.member_id] = (counts[order.member_id] || 0) + 1;
            costs[order.member_id] = (costs[order.member_id] || 0) + (order.total_price || 0);
          }
        });

        setMemberOrderCounts(counts);
        setMemberTotalCosts(costs);
      } catch (err) {
        console.error('Error fetching order data:', err);
      }
    };

    fetchOrderData();
  }, [members]);

  // Fetch orders for a specific member
  const fetchMemberOrders = async (memberId: string, limit: number = 50) => {
    try {
      setLoadingOrders(true);
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total_price, payment_method_id, created_at, updated_at, order_option, order_items, customer_info')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setMemberOrders(data as Order[]);
    } catch (err) {
      console.error('Error fetching member orders:', err);
      setMemberOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleViewMemberOrders = async (member: Member) => {
    setViewingMemberOrders(member);
    await fetchMemberOrders(member.id);
  };

  const getOrderStatus = (order: Order) => {
    const orderOption = order.order_option || 'place_order';
    if (orderOption === 'order_via_messenger' && order.status === 'pending') {
      return 'Done via Messenger';
    }
    return order.status;
  };

  const getOrderStatusClass = (order: Order) => {
    const displayStatus = getOrderStatus(order);
    if (displayStatus === 'Done via Messenger' || displayStatus === 'approved') {
      return 'bg-green-100 text-green-800';
    } else if (displayStatus === 'rejected') {
      return 'bg-red-100 text-red-800';
    } else if (displayStatus === 'processing') {
      return 'bg-yellow-100 text-yellow-800';
    } else {
      return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-gray-600 hover:text-black transition-colors duration-200"
                aria-label="Back to dashboard"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-black">Manage Members</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-gray-900">All Members</h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                showFilters
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>
          
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
              />
            </div>
          </div>

          {/* Filters Panel - Collapsible */}
          {showFilters && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setMemberFilter('all');
                    setUserTypeFilter('all');
                  }}
                  className={`px-3 py-2 md:px-4 rounded-lg text-xs font-medium transition-colors ${
                    memberFilter === 'all' && userTypeFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setMemberFilter('active')}
                  className={`px-3 py-2 md:px-4 rounded-lg text-xs font-medium transition-colors ${
                    memberFilter === 'active'
                      ? 'bg-green-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setMemberFilter('inactive')}
                  className={`px-3 py-2 md:px-4 rounded-lg text-xs font-medium transition-colors ${
                    memberFilter === 'inactive'
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Inactive
                </button>
                <button
                  onClick={() => setUserTypeFilter('end_user')}
                  className={`px-3 py-2 md:px-4 rounded-lg text-xs font-medium transition-colors ${
                    userTypeFilter === 'end_user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Members
                </button>
                <button
                  onClick={() => setUserTypeFilter('reseller')}
                  className={`px-3 py-2 md:px-4 rounded-lg text-xs font-medium transition-colors ${
                    userTypeFilter === 'reseller'
                      ? 'bg-orange-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Resellers
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-gray-600 text-xs">Loading...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-gray-600 text-center py-8 text-xs">
            {searchQuery.trim() !== '' 
              ? `No members found matching "${searchQuery}"`
              : 'No members found with the selected filters'}
          </div>
        ) : (
          <>
            {/* Results Count */}
            <div className="mb-4 text-xs text-gray-600">
              Showing {filteredMembers.length} of {members.length} member(s)
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredMembers.map((member) => (
                <div
                  key={member.id}
                  onClick={() => handleViewMemberOrders(member)}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  {/* Top row: Status and Edit button */}
                  <div className="flex items-start justify-between mb-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                        member.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {member.status}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingMember(member);
                      }}
                      className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                      title="Edit Member"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {/* Username row with total cost */}
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-semibold text-gray-900 truncate text-xs flex-1 min-w-0">
                      {member.username} <span className="text-gray-400">/ {member.user_type === 'end_user' ? 'Member' : 'Reseller'}</span>
                    </h4>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <span className="font-semibold text-gray-900 text-xs">₱{(memberTotalCosts[member.id] || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  
                  {/* Email row with total orders */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-600 truncate flex-1">{member.email}</p>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <span className="text-xs text-gray-500">Orders:</span>
                      <span className="font-semibold text-gray-900 text-xs">{memberOrderCounts[member.id] || 0}</span>
                    </div>
                  </div>
                  
                  {/* Tap to view orders text */}
                  <div className="text-center pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500">Tap to view orders</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left p-3 text-gray-900 font-semibold text-xs">Username</th>
                    <th className="text-left p-3 text-gray-900 font-semibold text-xs">Email</th>
                    <th className="text-center p-3 text-gray-900 font-semibold text-xs">Total Orders</th>
                    <th className="text-left p-3 text-gray-900 font-semibold text-xs">Status</th>
                    <th className="text-left p-3 text-gray-900 font-semibold text-xs">User Type</th>
                    <th className="text-left p-3 text-gray-900 font-semibold text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr 
                      key={member.id} 
                      className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-3 text-gray-900 text-xs">{member.username}</td>
                      <td className="p-3 text-gray-900 text-xs">{member.email}</td>
                      <td className="p-3 text-gray-900 font-semibold text-center text-xs">{memberOrderCounts[member.id] || 0}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            member.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td className="p-3 text-gray-900 text-xs capitalize">
                        {member.user_type === 'end_user' ? 'Member' : 'Reseller'}
                      </td>
                      <td className="p-3">
                        <div className="flex space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMember(member);
                            }}
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                            title="Edit Member"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewMemberOrders(member);
                            }}
                            className="p-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                            title="View Orders"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Edit Member Modal */}
        {editingMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-gray-900">Edit Member</h3>
                <button
                  onClick={() => setEditingMember(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-4 w-4 text-gray-600" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-900 mb-1">{editingMember.username}</p>
                  <p className="text-xs text-gray-600">{editingMember.email}</p>
                </div>

                {/* User Type and Status in one row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* User Type Dropdown */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">User Type</label>
                    <select
                      value={editingMember.user_type}
                      onChange={async (e) => {
                        await updateMember(editingMember.id, {
                          user_type: e.target.value as MemberUserType
                        });
                      }}
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-xs"
                    >
                      <option value="end_user">Member</option>
                      <option value="reseller">Reseller</option>
                    </select>
                  </div>

                  {/* Status Toggle */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Status</label>
                    <button
                      onClick={async () => {
                        const newStatus = editingMember.status === 'active' ? 'inactive' : 'active';
                        await updateMember(editingMember.id, {
                          status: newStatus
                        });
                      }}
                      className={`w-full px-4 py-2 rounded text-xs font-semibold transition-colors ${
                        editingMember.status === 'active'
                          ? 'bg-red-100 text-red-800 hover:bg-red-200'
                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                      }`}
                    >
                      {editingMember.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Member Orders Modal */}
        {viewingMemberOrders && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 relative">
                <h3 className="text-gray-900">Order History</h3>
                <button
                  onClick={() => setViewingMemberOrders(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 absolute top-4 right-4"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              {/* Orders List */}
              <div className="flex-1 overflow-y-auto p-4">
                {loadingOrders ? (
                  <div className="text-center text-gray-600 py-8 text-xs">Loading orders...</div>
                ) : memberOrders.length === 0 ? (
                  <div className="text-center text-gray-600 py-8 text-xs">No orders found for this member.</div>
                ) : (
                  <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                      {memberOrders.map((order) => (
                        <div key={order.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-xs text-gray-900 mb-1">#{order.id.slice(0, 8)}</p>
                              <p className="text-xs text-gray-600">{new Date(order.created_at).toLocaleString()}</p>
                            </div>
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold flex-shrink-0 ml-2 ${getOrderStatusClass(order)}`}
                            >
                              {getOrderStatus(order)}
                            </span>
                          </div>
                          <div className="space-y-2 pt-3 border-t border-gray-200">
                            <div className="text-xs">
                              <span className="text-gray-600">Items:</span>
                              <div className="mt-1 space-y-1">
                                {Array.isArray(order.order_items) && order.order_items.length > 0 ? (
                                  order.order_items.map((item: any, idx: number) => (
                                    <div key={idx} className="text-gray-900">
                                      • {item.name} {item.selectedVariation ? `(${item.selectedVariation.name})` : ''} x{item.quantity || 1}
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-gray-900">No items</span>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Payment:</span>
                              <span className="text-gray-900">{order.payment_method_id || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between text-xs pt-2 border-t border-gray-200">
                              <span className="text-gray-600 font-medium">Total:</span>
                              <span className="text-gray-900 font-bold text-xs">₱{order.total_price.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-300">
                            <th className="text-left p-3 text-gray-900 font-semibold text-xs">Order ID</th>
                            <th className="text-left p-3 text-gray-900 font-semibold text-xs">Date</th>
                            <th className="text-left p-3 text-gray-900 font-semibold text-xs">Items</th>
                            <th className="text-left p-3 text-gray-900 font-semibold text-xs">Payment Method</th>
                            <th className="text-left p-3 text-gray-900 font-semibold text-xs">Status</th>
                            <th className="text-left p-3 text-gray-900 font-semibold text-xs">Total Order</th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberOrders.map((order) => (
                            <tr key={order.id} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="p-3 text-gray-900 font-mono text-xs">
                                #{order.id.slice(0, 8)}
                              </td>
                              <td className="p-3 text-gray-600 text-xs">
                                {new Date(order.created_at).toLocaleString()}
                              </td>
                              <td className="p-3 text-gray-600 text-xs">
                                <div className="space-y-1">
                                  {Array.isArray(order.order_items) && order.order_items.length > 0 ? (
                                    order.order_items.map((item: any, idx: number) => (
                                      <div key={idx}>
                                        {item.name} {item.selectedVariation ? `(${item.selectedVariation.name})` : ''} x{item.quantity || 1}
                                      </div>
                                    ))
                                  ) : (
                                    <span>No items</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-gray-600 text-xs">
                                {order.payment_method_id || 'N/A'}
                              </td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-semibold ${getOrderStatusClass(order)}`}
                                >
                                  {getOrderStatus(order)}
                                </span>
                              </td>
                              <td className="p-3 text-gray-900 font-bold text-xs">
                                ₱{order.total_price.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberManager;
