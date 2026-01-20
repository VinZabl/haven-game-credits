import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, ArrowLeft, CreditCard, Upload, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import { usePaymentMethods, PaymentMethod, AdminPaymentGroup } from '../hooks/usePaymentMethods';
import { supabase } from '../lib/supabase';
import ImageUpload from './ImageUpload';

interface PaymentMethodManagerProps {
  onBack: () => void;
}

// Helper component for payment method image with fallback
const PaymentMethodImage: React.FC<{ qrCodeUrl?: string; name: string }> = ({ qrCodeUrl, name }) => {
  const [imageError, setImageError] = useState(false);
  const hasImage = qrCodeUrl && qrCodeUrl.trim() !== '';
  
  if (!hasImage || imageError) {
    return <CreditCard className="w-6 h-6 text-gray-400" />;
  }
  
  return (
    <img
      src={qrCodeUrl}
      alt={`${name} QR Code`}
      className="w-full h-full rounded-lg object-cover"
      onError={() => setImageError(true)}
    />
  );
};

const PaymentMethodManager: React.FC<PaymentMethodManagerProps> = ({ onBack }) => {
  const { 
    paymentMethods, 
    adminGroups,
    addPaymentMethod, 
    updatePaymentMethod, 
    deletePaymentMethod, 
    addAdminGroup,
    updateAdminGroup,
    deleteAdminGroup,
    refetchAll,
    refetchAdminGroups
  } = usePaymentMethods();
  
  // Fetch all payment methods (not filtered by active groups) for admin view
  const [allPaymentMethods, setAllPaymentMethods] = React.useState<PaymentMethod[]>([]);
  
  React.useEffect(() => {
    const fetchAll = async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true });
      
      if (!error && data) {
        setAllPaymentMethods(data);
      }
    };
    fetchAll();
  }, [paymentMethods]);
  const [currentView, setCurrentView] = useState<'list' | 'add' | 'edit'>('list');
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [newAdminName, setNewAdminName] = useState('');
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    account_number: '',
    account_name: '',
    qr_code_url: '',
    active: true,
    sort_order: 0,
    admin_name: ''
  });

  // Modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteType, setDeleteType] = useState<'method' | 'group' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ uuidId?: string; adminName?: string; methodName?: string } | null>(null);

  React.useEffect(() => {
    refetchAll();
    refetchAdminGroups();
  }, []);

  // Fetch all payment methods (not filtered by active groups) for admin view
  const fetchAllPaymentMethods = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (!error && data) {
      setAllPaymentMethods(data);
    }
  }, []);

  React.useEffect(() => {
    fetchAllPaymentMethods();
  }, [fetchAllPaymentMethods]);

  // Group payment methods by admin_name (use all payment methods, not filtered ones)
  const groupedPaymentMethods = React.useMemo(() => {
    const grouped: Record<string, PaymentMethod[]> = {};
    allPaymentMethods.forEach(method => {
      const adminName = method.admin_name || 'Unassigned';
      if (!grouped[adminName]) {
        grouped[adminName] = [];
      }
      grouped[adminName].push(method);
    });
    return grouped;
  }, [allPaymentMethods]);

  const handleToggleGroup = (adminName: string) => {
    const group = adminGroups.find(g => g.admin_name === adminName);
    if (group) {
      updateAdminGroup(adminName, !group.is_active);
    }
  };

  const handleAddAdminGroup = async () => {
    if (!newAdminName.trim()) {
      alert('Please enter an admin name');
      return;
    }
    try {
      await addAdminGroup(newAdminName.trim());
      setNewAdminName('');
      setShowAddAdminForm(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add admin group');
    }
  };

  const handleDeleteAdminGroup = (adminName: string) => {
    setDeleteType('group');
    setDeleteTarget({ adminName });
    setShowDeleteModal(true);
  };

  const confirmDeleteAdminGroup = async () => {
    if (!deleteTarget?.adminName) return;
    
    try {
      await deleteAdminGroup(deleteTarget.adminName);
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setDeleteType(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete admin group');
    }
  };

  const toggleGroupExpansion = (adminName: string) => {
    setExpandedGroups(prev => ({ ...prev, [adminName]: !prev[adminName] }));
  };

  const handleAddMethod = (adminName?: string) => {
    // Calculate sort order based on payment methods in the same admin group
    const methodsInGroup = adminName 
      ? allPaymentMethods.filter(m => m.admin_name === adminName)
      : [];
    const nextSortOrder = methodsInGroup.length > 0
      ? Math.max(...methodsInGroup.map(m => m.sort_order), 0) + 1
      : 1;
    setFormData({
      id: '',
      name: '',
      account_number: '',
      account_name: '',
      qr_code_url: '',
      active: true,
      sort_order: nextSortOrder,
      admin_name: adminName || ''
    });
    setCurrentView('add');
  };

  const handleEditMethod = (method: PaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      id: method.id,
      name: method.name,
      account_number: method.account_number,
      account_name: method.account_name,
      qr_code_url: method.qr_code_url,
      active: method.active,
      sort_order: method.sort_order,
      admin_name: method.admin_name || ''
    });
    setCurrentView('edit');
  };

  const handleDeleteMethod = (uuidId: string, methodName?: string) => {
    setDeleteType('method');
    setDeleteTarget({ uuidId, methodName });
    setShowDeleteModal(true);
  };

  const confirmDeleteMethod = async () => {
    if (!deleteTarget?.uuidId) return;
    
    try {
      await deletePaymentMethod(deleteTarget.uuidId);
      await fetchAllPaymentMethods();
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setDeleteType(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete payment method');
    }
  };

  const handleSaveMethod = async () => {
    if (!formData.id || !formData.name || !formData.account_number || !formData.account_name || !formData.qr_code_url || !formData.admin_name) {
      alert('Please fill in all required fields including Admin Name');
      return;
    }

    // Validate ID format (kebab-case)
    const idRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!idRegex.test(formData.id)) {
      alert('Payment method ID must be in kebab-case format (e.g., "gcash", "bank-transfer")');
      return;
    }

    // Check for duplicate ID within the same admin group when adding (not editing)
    if (currentView === 'add') {
      const duplicateInGroup = allPaymentMethods.some(
        m => m.id === formData.id && m.admin_name === formData.admin_name
      );
      if (duplicateInGroup) {
        alert(`A payment method with ID "${formData.id}" already exists in the "${formData.admin_name}" group. Please use a different ID.`);
        return;
      }
    }

    try {
      if (editingMethod) {
        await updatePaymentMethod(editingMethod.uuid_id, formData);
      } else {
        await addPaymentMethod(formData);
      }
      await fetchAllPaymentMethods();
      setCurrentView('list');
      setEditingMethod(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save payment method';
      if (errorMessage.includes('duplicate key') || errorMessage.includes('23505')) {
        alert(`A payment method with ID "${formData.id}" already exists in the "${formData.admin_name}" group. Please use a different ID.`);
      } else {
        alert(errorMessage);
      }
    }
  };

  const handleCancel = () => {
    setCurrentView('list');
    setEditingMethod(null);
  };

  const generateIdFromName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      id: currentView === 'add' ? generateIdFromName(name) : formData.id
    });
  };

  // Form View (Add/Edit)
  if (currentView === 'add' || currentView === 'edit') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-40 bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleCancel}
                  className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h1 className="text-xs font-semibold text-black">
                  {currentView === 'add' ? 'Add Payment Method' : 'Edit Payment Method'}
                </h1>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 md:px-4 md:py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200 flex items-center space-x-2 text-xs"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
                <button
                  onClick={handleSaveMethod}
                  className="px-3 py-1.5 md:px-4 md:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center space-x-2 text-xs"
                >
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-8">
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-medium text-black mb-2">Payment Method Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., GCash, Maya, Bank Transfer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-black mb-2">Method ID *</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="kebab-case-id"
                  disabled={currentView === 'edit'}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {currentView === 'edit' 
                    ? 'Method ID cannot be changed after creation'
                    : 'Use kebab-case format (e.g., "gcash", "bank-transfer")'
                  }
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-black mb-2">Account Number/Phone *</label>
                <input
                  type="text"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="09XX XXX XXXX or Account: 1234-5678-9012"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-black mb-2">Account Name *</label>
                <input
                  type="text"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="M&C Bakehouse"
                />
              </div>

              <div>
                <ImageUpload
                  currentImage={formData.qr_code_url}
                  onImageChange={(imageUrl) => setFormData({ ...formData, qr_code_url: imageUrl || '' })}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-black mb-2">Admin Name *</label>
                <select
                  value={formData.admin_name}
                  onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Admin Name</option>
                  {adminGroups.map(group => (
                    <option key={group.id} value={group.admin_name}>{group.admin_name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select which admin group this payment method belongs to
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-black mb-2">Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Lower numbers appear first in the checkout
                </p>
              </div>

              <div className="flex items-center">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-xs font-medium text-black">Active Payment Method</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View
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
              <h1 className="text-black">Payment Methods</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Add Admin Group Section */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-playfair font-medium text-black">Admin Groups</h2>
            {!showAddAdminForm && (
              <button
                onClick={() => setShowAddAdminForm(true)}
                className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 text-xs"
              >
                <Plus className="h-4 w-4" />
                <span>Add Admin Group</span>
              </button>
            )}
          </div>
          
          {showAddAdminForm && (
            <div className="flex items-center space-x-2 mb-4">
              <input
                type="text"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="Enter admin name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddAdminGroup();
                  }
                }}
              />
              <button
                onClick={handleAddAdminGroup}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 text-xs"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddAdminForm(false);
                  setNewAdminName('');
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 text-xs"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="space-y-3">
            {adminGroups.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">No admin groups found. Add an admin group to get started.</p>
              </div>
            ) : (
              adminGroups.map((group) => {
                const methods = groupedPaymentMethods[group.admin_name] || [];
                const isExpanded = expandedGroups[group.admin_name] === true; // Default to collapsed
                
                return (
                  <div key={group.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <button
                            onClick={() => toggleGroupExpansion(group.admin_name)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-600" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-600" />
                            )}
                          </button>
                          <span className="font-medium text-black">{group.admin_name}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleGroup(group.admin_name);
                            }}
                            className="flex items-center space-x-2"
                          >
                            {group.is_active ? (
                              <ToggleRight className="h-6 w-6 text-green-600" />
                            ) : (
                              <ToggleLeft className="h-6 w-6 text-gray-400" />
                            )}
                            <span className={`text-xs font-medium ${
                              group.is_active ? 'text-green-600' : 'text-gray-500'
                            }`}>
                              {group.is_active ? 'ON' : 'OFF'}
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddMethod(group.admin_name);
                            }}
                            className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-200"
                            title="Add payment method to this group"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          {group.admin_name !== 'Old' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAdminGroup(group.admin_name);
                              }}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-200"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="p-4 space-y-3 bg-white">
                        {methods.length === 0 ? (
                          <div className="text-center py-4">
                            <p className="text-xs text-gray-500 mb-3">No payment methods in this group</p>
                            <button
                              onClick={() => handleAddMethod(group.admin_name)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Add Payment Method
                            </button>
                          </div>
                        ) : (
                          methods.map((method) => (
                            <div
                              key={method.id}
                              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                            >
                              {/* Top Row: Status on left, Actions on right */}
                              <div className="flex items-center justify-between mb-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  method.active 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {method.active ? 'Active' : 'Inactive'}
                                </span>
                                
                                <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleEditMethod(method)}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors duration-200"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                
                                <button
                                  onClick={() => handleDeleteMethod(method.uuid_id, method.name)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-200"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                                </div>
                              </div>
                              
                              {/* Bottom Row: Payment Method Info */}
                              <div className="flex items-center space-x-4">
                                <div className="flex-shrink-0 w-12 h-12 rounded-lg border border-gray-300 flex items-center justify-center bg-gray-50">
                                  <PaymentMethodImage qrCodeUrl={method.qr_code_url} name={method.name} />
                                </div>
                                <div>
                                  <h3 className="font-medium text-black text-xs">{method.name}</h3>
                                  <p className="text-xs text-gray-600">{method.account_number}</p>
                                  <p className="text-xs text-gray-500">Account: {method.account_name}</p>
                                  <p className="text-xs text-gray-400">ID: {method.id} • Order: #{method.sort_order}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Unassigned payment methods */}
        {groupedPaymentMethods['Unassigned'] && groupedPaymentMethods['Unassigned'].length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-6">
            <div className="p-4 md:p-6">
              <h2 className="text-xs font-playfair font-medium text-black mb-4">Unassigned Payment Methods</h2>
              <div className="space-y-3">
                {groupedPaymentMethods['Unassigned'].map((method) => (
                  <div
                    key={method.id}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                  >
                    {/* Top Row: Status on left, Actions on right */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        method.active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {method.active ? 'Active' : 'Inactive'}
                      </span>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditMethod(method)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors duration-200"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      
                      <button
                        onClick={() => handleDeleteMethod(method.uuid_id, method.name)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      </div>
                    </div>
                    
                    {/* Bottom Row: Payment Method Info */}
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg border border-gray-300 flex items-center justify-center bg-gray-50">
                        <PaymentMethodImage qrCodeUrl={method.qr_code_url} name={method.name} />
                      </div>
                      <div>
                        <h3 className="font-medium text-black text-xs">{method.name}</h3>
                        <p className="text-xs text-gray-600">{method.account_number}</p>
                        <p className="text-xs text-gray-500">Account: {method.account_name}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-xs font-semibold text-gray-900">
                {deleteType === 'method' ? 'Delete Payment Method' : 'Delete Admin Group'}
              </h3>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 mb-2">
                {deleteType === 'method' ? (
                  <>
                    Are you sure you want to delete <span className="font-semibold text-gray-900">"{deleteTarget?.methodName || 'this payment method'}"</span>?
                    <br />
                    <span className="text-xs text-gray-500 mt-1 block">This action cannot be undone.</span>
                  </>
                ) : (
                  <>
                    Are you sure you want to delete the admin group <span className="font-semibold text-gray-900">"{deleteTarget?.adminName}"</span>?
                    <br />
                    <span className="text-xs text-gray-500 mt-1 block">This will not delete the payment methods, but they will become unassigned.</span>
                  </>
                )}
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                  setDeleteType(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={deleteType === 'method' ? confirmDeleteMethod : confirmDeleteAdminGroup}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentMethodManager;