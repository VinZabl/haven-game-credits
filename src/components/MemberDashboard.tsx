import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, Trophy, ArrowLeft, X, Search, Eye, Filter } from 'lucide-react';
import { useMembers } from '../hooks/useMembers';
import { Member, MemberUserType, Order } from '../types';
import { supabase } from '../lib/supabase';

const MemberDashboard: React.FC = () => {
  const { members, topMembers, loading, fetchMembers, updateMember } = useMembers();
  
  const [activeTab, setActiveTab] = useState<'top' | 'manage'>('top');
  const [memberFilter, setMemberFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'end_user' | 'reseller'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [viewingMemberOrders, setViewingMemberOrders] = useState<Member | null>(null);
  const [memberOrders, setMemberOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [memberOrderCounts, setMemberOrderCounts] = useState<Record<string, number>>({});
  
  const contentRef = useRef<HTMLDivElement>(null);

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

  // Fetch order counts for all members (optimized - only fetch member_id)
  useEffect(() => {
    const fetchOrderCounts = async () => {
      try {
        // Only select member_id column, not full order data
        const { data, error } = await supabase
          .from('orders')
          .select('member_id')
          .not('member_id', 'is', null);

        if (error) throw error;

        const counts: Record<string, number> = {};
        data.forEach(order => {
          if (order.member_id) {
            counts[order.member_id] = (counts[order.member_id] || 0) + 1;
          }
        });

        setMemberOrderCounts(counts);
      } catch (err) {
        console.error('Error fetching order counts:', err);
      }
    };

    if (activeTab === 'manage') {
      fetchOrderCounts();
    }
  }, [activeTab, members]);

  // Fetch orders for a specific member (optimized - limit and select only needed fields)
  const fetchMemberOrders = async (memberId: string, limit: number = 50) => {
    try {
      setLoadingOrders(true);
      // Only fetch essential fields, limit results
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
    // For messenger orders with pending status, show "Done via Messenger"
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
    <div className="space-y-6 relative">

      {/* Quick Actions - Same style as customer section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <div className="space-y-3">
            <button
              onClick={() => {
                setActiveTab('top');
                // Scroll to content on mobile
                setTimeout(() => {
                  contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              className={`w-full flex items-center space-x-3 p-2 md:p-3 text-left hover:bg-gray-50 rounded-lg transition-colors duration-200 ${
                activeTab === 'top' ? 'bg-blue-50' : ''
              }`}
            >
              <Trophy className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
              <span className="text-sm md:text-base font-medium text-gray-900">Top Members</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('manage');
                // Scroll to content on mobile
                setTimeout(() => {
                  contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              className={`w-full flex items-center space-x-3 p-2 md:p-3 text-left hover:bg-gray-50 rounded-lg transition-colors duration-200 ${
                activeTab === 'manage' ? 'bg-blue-50' : ''
              }`}
            >
              <Users className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
              <span className="text-sm md:text-base font-medium text-gray-900">Manage Members</span>
            </button>
          </div>
        </div>

        {/* Right panel - can be used for stats or left empty */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <h3 className="text-base md:text-lg font-playfair font-medium text-black mb-4">Members Overview</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">Total Members</span>
              </div>
              <span className="text-sm text-gray-500">{members.length} members</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">Resellers</span>
              </div>
              <span className="text-sm text-gray-500">{members.filter(m => m.user_type === 'reseller').length} resellers</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">Active Members</span>
              </div>
              <span className="text-sm text-gray-500">{members.filter(m => m.status === 'active').length} active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div ref={contentRef} className="bg-white rounded-lg shadow-sm p-4 md:p-6">
        {/* Top Members Tab */}
        {activeTab === 'top' && (
          <>
          <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Top Members by Total Cost</h3>
          {loading ? (
            <div className="text-gray-600">Loading...</div>
          ) : topMembers.length === 0 ? (
            <div className="text-gray-600">No member orders yet.</div>
          ) : (
            <div className="space-y-3">
              {topMembers.map((topMember, index) => (
                <div
                  key={topMember.member.id}
                  className="flex items-center justify-between p-3 md:p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full text-white font-bold text-sm md:text-base flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 text-sm md:text-base truncate">{topMember.member.username}</div>
                      <div className="text-xs md:text-sm text-gray-600 truncate">{topMember.member.email}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="font-bold text-blue-600 text-base md:text-lg">₱{topMember.total_cost.toFixed(2)}</div>
                    <div className="text-xs text-gray-600">{topMember.total_orders} order{topMember.total_orders !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </>
        )}

        {/* Manage Members Tab */}
        {activeTab === 'manage' && (
          <>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg md:text-xl font-bold text-gray-900">All Members</h3>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm md:text-base"
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
                className={`px-3 py-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                      memberFilter === 'all' && userTypeFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setMemberFilter('active')}
                className={`px-3 py-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                  memberFilter === 'active'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setMemberFilter('inactive')}
                className={`px-3 py-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                  memberFilter === 'inactive'
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Inactive
              </button>
                  <button
                    onClick={() => setUserTypeFilter('end_user')}
                    className={`px-3 py-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                      userTypeFilter === 'end_user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Members
                  </button>
                  <button
                    onClick={() => setUserTypeFilter('reseller')}
                    className={`px-3 py-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-colors ${
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
            <div className="text-gray-600">Loading...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-gray-600 text-center py-8">
              {searchQuery.trim() !== '' 
                ? `No members found matching "${searchQuery}"`
                : 'No members found with the selected filters'}
            </div>
          ) : (
            <>
              {/* Results Count */}
              <div className="mb-4 text-sm text-gray-600">
                Showing {filteredMembers.length} of {members.length} member(s)
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {filteredMembers.map((member) => (
                    <div
                      key={member.id}
                      className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                    >
                      <div className="mb-3">
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
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Orders:</span>
                            <span className="font-semibold text-gray-900">{memberOrderCounts[member.id] || 0}</span>
                      </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 mb-1 truncate">{member.username}</h4>
                          <p className="text-xs text-gray-600 truncate">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                        <select
                          value={member.user_type}
                          onChange={async (e) => {
                            e.stopPropagation();
                            const success = await updateMember(member.id, {
                              user_type: e.target.value as MemberUserType
                            });
                            if (success) {
                              await fetchMembers();
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm"
                        >
                          <option value="end_user">End User</option>
                          <option value="reseller">Reseller</option>
                        </select>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMember(member.id, {
                              status: member.status === 'active' ? 'inactive' : 'active'
                            });
                          }}
                          className={`px-3 py-2 rounded text-xs font-semibold whitespace-nowrap ${
                            member.status === 'active'
                              ? 'bg-red-100 text-red-800 active:bg-red-200'
                              : 'bg-green-100 text-green-800 active:bg-green-200'
                          }`}
                        >
                          {member.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewMemberOrders(member);
                          }}
                          className="p-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 active:bg-blue-300 transition-colors"
                          title="View Orders"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left p-3 text-gray-900 font-semibold">Username</th>
                      <th className="text-left p-3 text-gray-900 font-semibold">Email</th>
                      <th className="text-center p-3 text-gray-900 font-semibold">Total Orders</th>
                      <th className="text-left p-3 text-gray-900 font-semibold">Status</th>
                      <th className="text-left p-3 text-gray-900 font-semibold">User Type</th>
                      <th className="text-left p-3 text-gray-900 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((member) => (
                      <tr 
                        key={member.id} 
                        className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <td className="p-3 text-gray-900">{member.username}</td>
                        <td className="p-3 text-gray-900">{member.email}</td>
                        <td className="p-3 text-gray-900 font-semibold text-center">{memberOrderCounts[member.id] || 0}</td>
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
                        <td className="p-3">
                          <select
                            value={member.user_type}
                            onChange={async (e) => {
                              e.stopPropagation();
                              const success = await updateMember(member.id, {
                                user_type: e.target.value as MemberUserType
                              });
                              if (success) {
                                await fetchMembers();
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-900 text-sm"
                          >
                            <option value="end_user">End User</option>
                            <option value="reseller">Reseller</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateMember(member.id, {
                                  status: member.status === 'active' ? 'inactive' : 'active'
                                });
                              }}
                              className={`px-3 py-1 rounded text-xs font-semibold ${
                                member.status === 'active'
                                  ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                  : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
                            >
                              {member.status === 'active' ? 'Deactivate' : 'Activate'}
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
          </>
        )}

        {/* Member Orders Modal */}
        {viewingMemberOrders && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-none md:rounded-lg shadow-xl max-w-4xl w-full h-full md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <button
                    onClick={() => setViewingMemberOrders(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg md:text-xl font-bold text-gray-900 truncate">Order History</h3>
                    <p className="text-xs md:text-sm text-gray-600 truncate">{viewingMemberOrders.username} ({viewingMemberOrders.email})</p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingMemberOrders(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 md:block hidden"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              {/* Orders List */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {loadingOrders ? (
                  <div className="text-center text-gray-600 py-8">Loading orders...</div>
                ) : memberOrders.length === 0 ? (
                  <div className="text-center text-gray-600 py-8">No orders found for this member.</div>
                ) : (
                  <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                      {memberOrders.map((order) => (
                        <div key={order.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-sm text-gray-900 mb-1">{order.invoice_number ? `#${order.invoice_number}` : `#${order.id.slice(0, 8)}`}</p>
                              <p className="text-xs text-gray-600">{new Date(order.created_at).toLocaleString()}</p>
                            </div>
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold flex-shrink-0 ml-2 ${getOrderStatusClass(order)}`}
                            >
                              {getOrderStatus(order)}
                            </span>
                          </div>
                          <div className="space-y-2 pt-3 border-t border-gray-200">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Items:</span>
                              <span className="text-gray-900 font-medium">{Array.isArray(order.order_items) ? order.order_items.length : 0} item(s)</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Payment:</span>
                              <span className="text-gray-900">{order.payment_method_id || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                              <span className="text-gray-600 font-medium">Total:</span>
                              <span className="text-gray-900 font-bold text-lg">₱{order.total_price.toFixed(2)}</span>
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
                            <th className="text-left p-3 text-gray-900 font-semibold">Order ID</th>
                            <th className="text-left p-3 text-gray-900 font-semibold">Date</th>
                            <th className="text-left p-3 text-gray-900 font-semibold">Items</th>
                            <th className="text-left p-3 text-gray-900 font-semibold">Payment Method</th>
                            <th className="text-left p-3 text-gray-900 font-semibold">Status</th>
                            <th className="text-left p-3 text-gray-900 font-semibold">Total Order</th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberOrders.map((order) => (
                            <tr key={order.id} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="p-3 text-gray-900 font-mono text-sm">
                                {order.invoice_number ? `#${order.invoice_number}` : `#${order.id.slice(0, 8)}`}
                              </td>
                              <td className="p-3 text-gray-600 text-sm">
                                {new Date(order.created_at).toLocaleString()}
                              </td>
                              <td className="p-3 text-gray-600 text-sm">
                                {Array.isArray(order.order_items) ? order.order_items.length : 0} item(s)
                              </td>
                              <td className="p-3 text-gray-600 text-sm">
                                {order.payment_method_id || 'N/A'}
                              </td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-semibold ${getOrderStatusClass(order)}`}
                                >
                                  {getOrderStatus(order)}
                                </span>
                              </td>
                              <td className="p-3 text-gray-900 font-bold">
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

export default MemberDashboard;
