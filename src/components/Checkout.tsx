import React, { useState, useMemo, useRef } from 'react';
import { ArrowLeft, Upload, X, Copy, Check, MousePointerClick, ChevronUp, Download } from 'lucide-react';
import { CartItem, PaymentMethod, CustomField } from '../types';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useImageUpload } from '../hooks/useImageUpload';

interface CheckoutProps {
  cartItems: CartItem[];
  totalPrice: number;
  onBack: () => void;
}

const Checkout: React.FC<CheckoutProps> = ({ cartItems, totalPrice, onBack }) => {
  const { paymentMethods } = usePaymentMethods();
  const { uploadImage, uploading: uploadingReceipt } = useImageUpload();
  const [step, setStep] = useState<'details' | 'payment'>('details');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const paymentDetailsRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasCopiedMessage, setHasCopiedMessage] = useState(false);
  const [copiedAccountNumber, setCopiedAccountNumber] = useState(false);
  const [bulkInputValues, setBulkInputValues] = useState<Record<string, string>>({});
  const [bulkSelectedGames, setBulkSelectedGames] = useState<string[]>([]);

  // Extract original menu item ID from cart item ID (format: "menuItemId:::CART:::timestamp-random")
  // This allows us to group all packages from the same game together
  const getOriginalMenuItemId = (cartItemId: string): string => {
    const parts = cartItemId.split(':::CART:::');
    return parts.length > 1 ? parts[0] : cartItemId;
  };

  // Group custom fields by item/game
  // If any game has custom fields, show those grouped by game. Otherwise, show default "IGN" field
  // Deduplicate by original menu item ID to avoid showing the same fields multiple times for the same game
  // (even if different packages/variations are selected)
  const itemsWithCustomFields = useMemo(() => {
    const itemsWithFields = cartItems.filter(item => item.customFields && item.customFields.length > 0);
    // Deduplicate by original menu item ID
    const uniqueItems = new Map<string, typeof cartItems[0]>();
    itemsWithFields.forEach(item => {
      const originalId = getOriginalMenuItemId(item.id);
      if (!uniqueItems.has(originalId)) {
        uniqueItems.set(originalId, item);
      }
    });
    return Array.from(uniqueItems.values());
  }, [cartItems]);

  const hasAnyCustomFields = itemsWithCustomFields.length > 0;

  // Get bulk input fields based on selected games - position-based
  // If selected games have N fields, show N bulk input fields
  const bulkInputFields = useMemo(() => {
    if (bulkSelectedGames.length === 0) return [];
    
    // Get all selected items (bulkSelectedGames contains original menu item IDs)
    const selectedItems = itemsWithCustomFields.filter(item => 
      bulkSelectedGames.includes(getOriginalMenuItemId(item.id))
    );
    
    if (selectedItems.length === 0) return [];
    
    // Find the maximum number of fields across all selected games
    const maxFields = Math.max(...selectedItems.map(item => item.customFields?.length || 0));
    
    if (maxFields === 0) return [];
    
    // Create fields array based on position (index)
    // Use the first selected item's fields as reference for labels
    const referenceItem = selectedItems[0];
    const fields: Array<{ index: number, field: CustomField | null }> = [];
    
    for (let i = 0; i < maxFields; i++) {
      // Try to get field from reference item, or use a placeholder
      const field = referenceItem.customFields?.[i] || null;
      fields.push({ index: i, field });
    }
    
    return fields;
  }, [bulkSelectedGames, itemsWithCustomFields]);

  // Sync bulk input values to selected games by position
  React.useEffect(() => {
    if (bulkSelectedGames.length === 0) return;
    
    const updates: Record<string, string> = {};
    
    // Get selected items (bulkSelectedGames contains original menu item IDs)
    const selectedItems = itemsWithCustomFields.filter(item => 
      bulkSelectedGames.includes(getOriginalMenuItemId(item.id))
    );
    
    // For each bulk input field (by index)
    Object.entries(bulkInputValues).forEach(([fieldIndexStr, value]) => {
      const fieldIndex = parseInt(fieldIndexStr, 10);
      
      // Apply to all selected games at the same field position
      selectedItems.forEach(item => {
        if (item.customFields && item.customFields[fieldIndex]) {
          const field = item.customFields[fieldIndex];
          const originalId = getOriginalMenuItemId(item.id);
          const valueKey = `${originalId}_${field.key}`;
          updates[valueKey] = value;
        }
      });
    });
    
    if (Object.keys(updates).length > 0) {
      setCustomFieldValues(prev => ({ ...prev, ...updates }));
    }
  }, [bulkInputValues, bulkSelectedGames, itemsWithCustomFields]);

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // Auto-scroll to payment details when payment method is selected
  React.useEffect(() => {
    if (paymentMethod && paymentDetailsRef.current) {
      setShowScrollIndicator(true); // Reset to show indicator when payment method is selected
      setTimeout(() => {
        paymentDetailsRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [paymentMethod]);

  // Check if buttons section is visible to hide scroll indicator
  React.useEffect(() => {
    if (!buttonsRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // If buttons are visible, hide the scroll indicator
          if (entry.isIntersecting) {
            setShowScrollIndicator(false);
          } else {
            setShowScrollIndicator(true);
          }
        });
      },
      {
        threshold: 0.1, // Trigger when 10% of the element is visible
        rootMargin: '-50px 0px' // Add some margin to trigger earlier
      }
    );

    observer.observe(buttonsRef.current);

    return () => {
      observer.disconnect();
    };
  }, [step]);

  const selectedPaymentMethod = paymentMethods.find(method => method.id === paymentMethod);
  
  const handleBulkInputChange = (fieldKey: string, value: string) => {
    setBulkInputValues(prev => ({ ...prev, [fieldKey]: value }));
  };

  const handleBulkGameSelectionChange = (itemId: string, checked: boolean) => {
    // itemId is the cart item ID, convert to original menu item ID
    const originalId = getOriginalMenuItemId(itemId);
    if (checked) {
      setBulkSelectedGames(prev => [...prev, originalId]);
    } else {
      setBulkSelectedGames(prev => prev.filter(id => id !== originalId));
    }
  };

  const handleProceedToPayment = () => {
    setStep('payment');
  };

  const handleReceiptUpload = async (file: File) => {
    try {
      setReceiptError(null);
      setReceiptFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setReceiptPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase
      const url = await uploadImage(file, 'payment-receipts');
      setReceiptImageUrl(url);
    } catch (error) {
      console.error('Error uploading receipt:', error);
      setReceiptError(error instanceof Error ? error.message : 'Failed to upload receipt');
      setReceiptFile(null);
      setReceiptPreview(null);
    }
  };

  const handleReceiptRemove = () => {
    setReceiptFile(null);
    setReceiptImageUrl(null);
    setReceiptPreview(null);
    setReceiptError(null);
    setHasCopiedMessage(false); // Reset copy state when receipt is removed
  };

  // Generate the order message text
  const generateOrderMessage = (): string => {
    // Build custom fields section grouped by game
    let customFieldsSection = '';
    if (hasAnyCustomFields) {
      // Group games by their field values (to simplify when bulk input is used)
      const gamesByFieldValues = new Map<string, { games: string[], fields: Array<{ label: string, value: string }> }>();
      
      itemsWithCustomFields.forEach(item => {
        // Get all field values for this game (use original menu item ID)
        const originalId = getOriginalMenuItemId(item.id);
        const fields = item.customFields?.map(field => {
          const valueKey = `${originalId}_${field.key}`;
          const value = customFieldValues[valueKey] || '';
          return value ? { label: field.label, value } : null;
        }).filter(Boolean) as Array<{ label: string, value: string }> || [];
        
        if (fields.length === 0) return;
        
        // Create a key based on field values (to group games with same values)
        const valueKey = fields.map(f => `${f.label}:${f.value}`).join('|');
        
        if (!gamesByFieldValues.has(valueKey)) {
          gamesByFieldValues.set(valueKey, { games: [], fields });
        }
        gamesByFieldValues.get(valueKey)!.games.push(item.name);
      });
      
      // Build the section
      const sections: string[] = [];
      gamesByFieldValues.forEach(({ games, fields }) => {
        if (games.length === 0 || fields.length === 0) return;
        
        // Add game names
        sections.push(games.join('\n'));
        
        // If all values are the same, combine into one line
        const allValuesSame = fields.every(f => f.value === fields[0].value);
        if (allValuesSame && fields.length > 1) {
          const labels = fields.map(f => f.label).join(', ');
          const lastCommaIndex = labels.lastIndexOf(',');
          const combinedLabels = lastCommaIndex > 0 
            ? labels.substring(0, lastCommaIndex) + ' &' + labels.substring(lastCommaIndex + 1)
            : labels;
          sections.push(`${combinedLabels}: ${fields[0].value}`);
        } else {
          // Different values, show each field separately
          const fieldStrings = fields.map(f => `${f.label}: ${f.value}`).join(', ');
          sections.push(fieldStrings);
        }
      });
      
      if (sections.length > 0) {
        customFieldsSection = sections.join('\n');
      }
    } else {
      customFieldsSection = `🎮 IGN: ${customFieldValues['default_ign'] || ''}`;
    }

    const orderDetails = `
🛒 AmberKin ORDER

${customFieldsSection}

📋 ORDER DETAILS:
${cartItems.map(item => {
  let itemDetails = `• ${item.name}`;
  if (item.selectedVariation) {
    itemDetails += ` (${item.selectedVariation.name})`;
  }
  itemDetails += ` x${item.quantity} - ₱${item.totalPrice * item.quantity}`;
  return itemDetails;
}).join('\n')}

💰 TOTAL: ₱${totalPrice}

💳 Payment: ${selectedPaymentMethod?.name || ''}

📸 Payment Receipt: ${receiptImageUrl || ''}

Please confirm this order to proceed. Thank you for choosing AmberKin! 🎮
    `.trim();

    return orderDetails;
  };

  const handleCopyMessage = async () => {
    try {
      const message = generateOrderMessage();
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setHasCopiedMessage(true); // Mark that copy button has been clicked
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const handleCopyAccountNumber = async (accountNumber: string) => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopiedAccountNumber(true);
      setTimeout(() => setCopiedAccountNumber(false), 2000);
    } catch (error) {
      console.error('Failed to copy account number:', error);
    }
  };

  const handleDownloadQRCode = (qrCodeUrl: string, paymentMethodName: string) => {
    // Use img element approach for better Messenger browser compatibility
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Enable CORS
    
    img.onload = () => {
      try {
        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }
        
        ctx.drawImage(img, 0, 0);
        
        // Convert canvas to blob
        canvas.toBlob((blob) => {
          if (!blob) {
            // Fallback to direct link if blob creation fails
            const link = document.createElement('a');
            link.href = qrCodeUrl;
            link.download = `qr-code-${paymentMethodName.toLowerCase().replace(/\s+/g, '-')}.png`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
          }
          
          // Create download link from blob
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `qr-code-${paymentMethodName.toLowerCase().replace(/\s+/g, '-')}.png`;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 'image/png');
      } catch (error) {
        console.error('Canvas conversion failed:', error);
        // Fallback to direct link
        const link = document.createElement('a');
        link.href = qrCodeUrl;
        link.download = `qr-code-${paymentMethodName.toLowerCase().replace(/\s+/g, '-')}.png`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };
    
    img.onerror = () => {
      // If image fails to load, try direct link as fallback
      console.log('Image load failed, trying direct link');
      const link = document.createElement('a');
      link.href = qrCodeUrl;
      link.download = `qr-code-${paymentMethodName.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    
    // Load the image
    img.src = qrCodeUrl;
  };

  const handlePlaceOrder = () => {
    if (!paymentMethod) {
      setReceiptError('Please select a payment method');
      return;
    }
    
    if (!receiptImageUrl) {
      setReceiptError('Please upload your payment receipt before placing the order');
      return;
    }

    const orderDetails = generateOrderMessage();
    const encodedMessage = encodeURIComponent(orderDetails);
    const messengerUrl = `https://m.me/AmberKinGamerXtream?text=${encodedMessage}`;
    
    window.open(messengerUrl, '_blank');
    
  };

  const isDetailsValid = useMemo(() => {
    if (!hasAnyCustomFields) {
      // Default IGN field
      return customFieldValues['default_ign']?.trim() || false;
    }
    
    // Check all required fields for all items (use original menu item ID)
    return itemsWithCustomFields.every(item => {
      if (!item.customFields) return true;
      const originalId = getOriginalMenuItemId(item.id);
      return item.customFields.every(field => {
        if (!field.required) return true;
        const valueKey = `${originalId}_${field.key}`;
        return customFieldValues[valueKey]?.trim() || false;
      });
    });
  }, [hasAnyCustomFields, itemsWithCustomFields, customFieldValues]);

  if (step === 'details') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center mb-8">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Cart</span>
          </button>
          <h1 className="text-3xl font-semibold text-cafe-text ml-8">Order Details</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Customer Details Form */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-2xl font-medium text-cafe-text mb-6">Customer Information</h2>
            
            <form className="space-y-6">
              {/* Show count of items with custom fields */}
              {hasAnyCustomFields && itemsWithCustomFields.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-semibold">{itemsWithCustomFields.length}</span> game{itemsWithCustomFields.length > 1 ? 's' : ''} require{itemsWithCustomFields.length === 1 ? 's' : ''} additional information
                  </p>
                </div>
              )}

              {/* Bulk Input Section */}
              {itemsWithCustomFields.length >= 2 && (
                <div className="mb-6 p-4 glass-strong border border-cafe-primary/30 rounded-lg">
                  <h3 className="text-lg font-semibold text-cafe-text mb-4">Bulk Input</h3>
                  <p className="text-sm text-cafe-textMuted mb-4">
                    Select games and fill fields once for all selected games.
                  </p>
                  
                  {/* Game Selection Checkboxes */}
                  <div className="space-y-2 mb-4">
                    {itemsWithCustomFields.map((item) => {
                      const originalId = getOriginalMenuItemId(item.id);
                      const isSelected = bulkSelectedGames.includes(originalId);
                      return (
                        <label
                          key={item.id}
                          className="flex items-center space-x-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleBulkGameSelectionChange(item.id, e.target.checked)}
                            className="w-4 h-4 text-cafe-primary border-cafe-primary/30 rounded focus:ring-cafe-primary"
                          />
                          <span className="text-sm text-cafe-text">{item.name}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Input Fields - Only show if games are selected */}
                  {bulkSelectedGames.length > 0 && bulkInputFields.length > 0 && (
                    <div className="space-y-4 mt-4 pt-4 border-t border-cafe-primary/20">
                      {bulkInputFields.map(({ index, field }) => (
                        <div key={index}>
                          <label className="block text-sm font-medium text-cafe-text mb-2">
                            {field ? field.label : `Field ${index + 1}`} <span className="text-cafe-textMuted">(Bulk)</span> {field?.required && <span className="text-red-500">*</span>}
                          </label>
                          <input
                            type="text"
                            value={bulkInputValues[index.toString()] || ''}
                            onChange={(e) => handleBulkInputChange(index.toString(), e.target.value)}
                            className="w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted"
                            placeholder={field?.placeholder || field?.label || `Field ${index + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Custom Fields grouped by game */}
              {hasAnyCustomFields ? (
                itemsWithCustomFields.map((item) => (
                  <div key={item.id} className="space-y-4 pb-6 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-cafe-text">{item.name}</h3>
                      <p className="text-sm text-cafe-textMuted">Please provide the following information for this game</p>
                    </div>
                    {item.customFields?.map((field) => {
                      const originalId = getOriginalMenuItemId(item.id);
                      const valueKey = `${originalId}_${field.key}`;
                      return (
                        <div key={valueKey}>
                          <label className="block text-sm font-medium text-cafe-text mb-2">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                          </label>
                          <input
                            type="text"
                            value={customFieldValues[valueKey] || ''}
                            onChange={(e) => setCustomFieldValues({
                              ...customFieldValues,
                              [valueKey]: e.target.value
                            })}
                            className="w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted"
                            placeholder={field.placeholder || field.label}
                            required={field.required}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div>
                  <label className="block text-sm font-medium text-cafe-text mb-2">
                    IGN <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customFieldValues['default_ign'] || ''}
                    onChange={(e) => setCustomFieldValues({
                      ...customFieldValues,
                      ['default_ign']: e.target.value
                    })}
                    className="w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted"
                    placeholder="In game name"
                    required
                  />
                </div>
              )}

              <button
                onClick={handleProceedToPayment}
                disabled={!isDetailsValid}
                className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
                  isDetailsValid
                    ? 'text-white hover:opacity-90 hover:scale-[1.02]'
                    : 'glass text-cafe-textMuted cursor-not-allowed'
                }`}
                style={isDetailsValid ? { backgroundColor: '#1E7ACB' } : {}}
              >
                Proceed to Payment
              </button>
            </form>
          </div>

          {/* Order Summary */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-2xl font-medium text-cafe-text mb-6">Order Summary</h2>
            
            <div className="space-y-4 mb-6">
              {cartItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-cafe-primary/30">
                  <div>
                    <h4 className="font-medium text-cafe-text">{item.name}</h4>
                    {item.selectedVariation && (
                      <p className="text-sm text-cafe-textMuted">Package: {item.selectedVariation.name}</p>
                    )}
                    {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                      <p className="text-sm text-cafe-textMuted">
                        Add-ons: {item.selectedAddOns.map(addOn => addOn.name).join(', ')}
                      </p>
                    )}
                    <p className="text-sm text-cafe-textMuted">₱{item.totalPrice} x {item.quantity}</p>
                  </div>
                  <span className="font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</span>
                </div>
              ))}
            </div>
            
            <div className="border-t border-cafe-primary/30 pt-4">
              <div className="flex items-center justify-between text-2xl font-semibold text-cafe-text">
                <span>Total:</span>
                <span className="text-white">₱{totalPrice}</span>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    );
  }

  // Payment Step
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center mb-8">
        <button
          onClick={() => setStep('details')}
          className="flex items-center space-x-2 text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Details</span>
        </button>
        <h1 className="text-3xl font-semibold text-cafe-text ml-8">Payment</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Payment Method Selection */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-2xl font-medium text-cafe-text mb-6">Choose Payment Method</h2>
          
          <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => {
                  setPaymentMethod(method.id as PaymentMethod);
                }}
                className={`p-2 md:p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                  paymentMethod === method.id
                    ? 'border-transparent text-white'
                    : 'glass border-cafe-primary/30 text-cafe-text hover:border-cafe-primary hover:glass-strong'
                }`}
                style={paymentMethod === method.id ? { backgroundColor: '#1E7ACB' } : {}}
              >
                {/* Icon on Top */}
                <div className="relative w-12 h-12 md:w-14 md:h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg flex items-center justify-center">
                  <span className="text-xl md:text-2xl">💳</span>
                </div>
                {/* Text Below */}
                <span className="font-medium text-xs md:text-sm text-center">{method.name}</span>
              </button>
            ))}
          </div>

          {/* Payment Details with QR Code */}
          {selectedPaymentMethod && (
            <div 
              ref={paymentDetailsRef}
              className="glass-strong rounded-lg p-6 mb-6 border border-cafe-primary/30"
            >
              <h3 className="font-medium text-cafe-text mb-4">Payment Details</h3>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-cafe-textMuted mb-1">{selectedPaymentMethod.name}</p>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-mono text-cafe-text font-medium text-xl md:text-2xl">{selectedPaymentMethod.account_number}</p>
                    <button
                      onClick={() => handleCopyAccountNumber(selectedPaymentMethod.account_number)}
                      className="px-3 py-1.5 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 flex-shrink-0 text-sm font-medium"
                      title="Copy account number"
                    >
                      {copiedAccountNumber ? (
                        <span className="text-green-400">Copied!</span>
                      ) : (
                        <span className="text-cafe-text">Copy</span>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-cafe-textMuted mb-3">Account Name: {selectedPaymentMethod.account_name}</p>
                  <p className="text-xl font-semibold text-white mb-3">Amount: ₱{totalPrice}</p>
                  <p className="text-sm text-cafe-textMuted">Press the copy button to copy the number or download the QR code, make a payment, then upload the receipt below 👇</p>
                </div>
                <div className="flex-shrink-0 w-full md:w-auto flex flex-col items-center md:items-start">
                  <h3 className="font-medium text-cafe-text mb-4 text-center md:text-left w-full md:w-auto">Other Option</h3>
                  <button
                    onClick={() => handleDownloadQRCode(selectedPaymentMethod.qr_code_url, selectedPaymentMethod.name)}
                    className="px-3 py-1.5 mb-2 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 text-sm font-medium text-cafe-text flex items-center gap-2 mx-auto md:mx-0"
                    title="Download QR code"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download QR</span>
                  </button>
                  <img 
                    src={selectedPaymentMethod.qr_code_url} 
                    alt={`${selectedPaymentMethod.name} QR Code`}
                    className="w-32 h-32 rounded-lg border-2 border-cafe-primary/30 shadow-sm mx-auto md:mx-0"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
                    }}
                  />
                  <p className="text-xs text-cafe-textMuted text-center mt-2">Scan to pay</p>
                </div>
              </div>
            </div>
          )}

          {/* Payment instructions */}
          <div className="glass border border-cafe-primary/30 rounded-lg p-4">
            <h4 className="font-medium text-cafe-text mb-2">📸 Payment Proof Required</h4>
            <p className="text-sm text-cafe-textMuted">
              After making your payment, please upload a screenshot of your payment receipt below. This helps us verify and process your order quickly.
            </p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-2xl font-medium text-cafe-text mb-6">Final Order Summary</h2>
          
          <div className="space-y-4 mb-6">
            <div className="glass-strong rounded-lg p-4 border border-cafe-primary/30">
              <h4 className="font-medium text-cafe-text mb-2">Customer Details</h4>
              {hasAnyCustomFields ? (
                itemsWithCustomFields.map((item) => {
                  const originalId = getOriginalMenuItemId(item.id);
                  const fields = item.customFields?.map(field => {
                    const valueKey = `${originalId}_${field.key}`;
                    const value = customFieldValues[valueKey];
                    return value ? (
                      <p key={valueKey} className="text-sm text-cafe-textMuted">
                        {field.label}: {value}
                      </p>
                    ) : null;
                  }).filter(Boolean);
                  
                  if (!fields || fields.length === 0) return null;
                  
                  return (
                    <div key={item.id} className="mb-3 pb-3 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                      <p className="text-sm font-semibold text-cafe-text mb-1">{item.name}:</p>
                      {fields}
                    </div>
                  );
                })
              ) : (
                customFieldValues['default_ign'] && (
                  <p className="text-sm text-cafe-textMuted">
                    IGN: {customFieldValues['default_ign']}
                  </p>
                )
              )}
            </div>

            {cartItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-cafe-primary/30">
                <div>
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
                  <p className="text-sm text-cafe-textMuted">₱{item.totalPrice} x {item.quantity}</p>
                </div>
                <span className="font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</span>
              </div>
            ))}
          </div>
          
          <div className="border-t border-cafe-primary/30 pt-4 mb-6">
            <div className="flex items-center justify-between text-2xl font-semibold text-cafe-text">
              <span>Total:</span>
              <span className="text-white">₱{totalPrice}</span>
            </div>
          </div>

          {/* Receipt Upload Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-cafe-text mb-2">
              Payment Receipt <span className="text-red-400">*</span>
            </label>
            
            {!receiptPreview ? (
              <div className="glass border-2 border-dashed border-cafe-primary/30 rounded-lg p-6 text-center hover:border-cafe-primary transition-colors duration-200">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleReceiptUpload(file);
                    }
                  }}
                  className="hidden"
                  id="receipt-upload"
                  disabled={uploadingReceipt}
                />
                <label
                  htmlFor="receipt-upload"
                  className={`cursor-pointer flex flex-col items-center space-y-2 ${uploadingReceipt ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {uploadingReceipt ? (
                    <>
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cafe-primary"></div>
                      <span className="text-sm text-cafe-textMuted">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-cafe-primary" />
                      <span className="text-sm text-cafe-text">Click to upload receipt</span>
                      <span className="text-xs text-cafe-textMuted">JPEG, PNG, WebP, or GIF (Max 5MB)</span>
                    </>
                  )}
                </label>
              </div>
            ) : (
              <div className="relative glass border border-cafe-primary/30 rounded-lg p-4">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="w-20 h-20 object-cover rounded-lg border border-cafe-primary/30"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-cafe-text truncate">
                      {receiptFile?.name || 'Receipt uploaded'}
                    </p>
                    <p className="text-xs text-cafe-textMuted">
                      {receiptImageUrl ? '✓ Uploaded successfully' : 'Uploading...'}
                    </p>
                  </div>
                  <button
                    onClick={handleReceiptRemove}
                    className="flex-shrink-0 p-2 glass-strong rounded-lg hover:bg-red-500/20 transition-colors duration-200"
                    disabled={uploadingReceipt}
                  >
                    <X className="h-4 w-4 text-cafe-text" />
                  </button>
                </div>
              </div>
            )}

            {receiptError && (
              <p className="mt-2 text-sm text-red-400">{receiptError}</p>
            )}
          </div>

          <div ref={buttonsRef}>
            {/* Copy button - must be clicked before placing order */}
            <button
              onClick={handleCopyMessage}
              disabled={uploadingReceipt || !paymentMethod || !receiptImageUrl}
              className={`w-full py-3 rounded-xl font-medium transition-all duration-200 transform mb-3 flex items-center justify-center space-x-2 ${
                !uploadingReceipt && paymentMethod && receiptImageUrl
                  ? 'glass border border-cafe-primary/30 text-cafe-text hover:border-cafe-primary hover:glass-strong'
                  : 'glass border border-cafe-primary/20 text-cafe-textMuted cursor-not-allowed'
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-5 w-5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-5 w-5" />
                  <span>Copy Order Message</span>
                </>
              )}
            </button>

            {/* Place Order button - requires payment method, receipt, and copy button to be clicked */}
            <button
              onClick={handlePlaceOrder}
              disabled={!paymentMethod || !receiptImageUrl || uploadingReceipt || !hasCopiedMessage}
              className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
                paymentMethod && receiptImageUrl && !uploadingReceipt && hasCopiedMessage
                  ? 'text-white hover:opacity-90 hover:scale-[1.02]'
                  : 'glass text-cafe-textMuted cursor-not-allowed'
              }`}
              style={paymentMethod && receiptImageUrl && !uploadingReceipt && hasCopiedMessage ? { backgroundColor: '#1E7ACB' } : {}}
            >
              {uploadingReceipt ? 'Uploading Receipt...' : 'Place Order via Messenger'}
            </button>
            
            <p className="text-xs text-cafe-textMuted text-center mt-3">
              You'll be redirected to Facebook Messenger to confirm your order. Your receipt has been uploaded and will be included in the message.
            </p>
          </div>
        </div>
      </div>

      {/* Fixed Scroll Indicator at Bottom */}
      {step === 'payment' && selectedPaymentMethod && showScrollIndicator && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-50">
          <div className="flex flex-col items-center space-y-1">
            <ChevronUp 
              className="h-8 w-8 text-cafe-primary" 
              strokeWidth={4}
              fill="currentColor"
              style={{
                animation: 'scrollUp 1.5s ease-in-out infinite',
                animationDelay: '0s'
              }}
            />
            <ChevronUp 
              className="h-8 w-8 text-cafe-primary" 
              strokeWidth={4}
              fill="currentColor"
              style={{
                animation: 'scrollUp 1.5s ease-in-out infinite',
                animationDelay: '0.3s'
              }}
            />
            <ChevronUp 
              className="h-8 w-8 text-cafe-primary" 
              strokeWidth={4}
              fill="currentColor"
              style={{
                animation: 'scrollUp 1.5s ease-in-out infinite',
                animationDelay: '0.6s'
              }}
            />
          </div>
          <style>{`
            @keyframes scrollUp {
              0% {
                opacity: 0;
                transform: translateY(0);
              }
              50% {
                opacity: 1;
                transform: translateY(-10px);
              }
              100% {
                opacity: 0;
                transform: translateY(-20px);
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default Checkout;