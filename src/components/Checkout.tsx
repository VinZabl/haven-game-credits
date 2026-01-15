import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowLeft, Upload, X, Copy, Check, MousePointerClick, Download, Eye } from 'lucide-react';
import { CartItem, PaymentMethod, CustomField, OrderStatus } from '../types';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useImageUpload } from '../hooks/useImageUpload';
import { useOrders } from '../hooks/useOrders';
import { useSiteSettings } from '../hooks/useSiteSettings';
import OrderStatusModal from './OrderStatusModal';

interface CheckoutProps {
  cartItems: CartItem[];
  totalPrice: number;
  onBack: () => void;
  onNavigateToMenu?: () => void; // Callback to navigate to menu (e.g., after order succeeded)
}

const Checkout: React.FC<CheckoutProps> = ({ cartItems, totalPrice, onBack, onNavigateToMenu }) => {
  const { paymentMethods } = usePaymentMethods();
  const { uploadImage, uploading: uploadingReceipt } = useImageUpload();
  const { createOrder, fetchOrderById } = useOrders();
  const { siteSettings } = useSiteSettings();
  const orderOption = siteSettings?.order_option || 'order_via_messenger';
  const [step, setStep] = useState<'details' | 'payment' | 'summary'>('details');
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
  const [copiedAccountName, setCopiedAccountName] = useState(false);
  const [bulkInputValues, setBulkInputValues] = useState<Record<string, string>>({});
  const [bulkSelectedGames, setBulkSelectedGames] = useState<string[]>([]);
  const [useMultipleAccounts, setUseMultipleAccounts] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [existingOrderStatus, setExistingOrderStatus] = useState<OrderStatus | null>(null);
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [isCheckingExistingOrder, setIsCheckingExistingOrder] = useState(true);

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

  // Detect if there are multiple different packages (variations) for the same game
  const hasMultiplePackagesForSameGame = useMemo(() => {
    // Group cart items by original menu item ID
    const itemsByGame = new Map<string, CartItem[]>();
    cartItems.forEach(item => {
      const originalId = getOriginalMenuItemId(item.id);
      if (!itemsByGame.has(originalId)) {
        itemsByGame.set(originalId, []);
      }
      itemsByGame.get(originalId)!.push(item);
    });

    // Check if any game has multiple different variations
    for (const [gameId, items] of itemsByGame.entries()) {
      const variations = new Set<string>();
      items.forEach(item => {
        if (item.selectedVariation) {
          variations.add(item.selectedVariation.id);
        }
      });
      // If a game has 2 or more different variations, enable multiple accounts option
      if (variations.size >= 2) {
        return true;
      }
    }
    return false;
  }, [cartItems]);

  // Group cart items by game and variation for multiple accounts mode
  const itemsByGameAndVariation = useMemo(() => {
    if (!useMultipleAccounts) return null;

    const grouped = new Map<string, Map<string, CartItem[]>>();
    cartItems.forEach(item => {
      const originalId = getOriginalMenuItemId(item.id);
      const variationId = item.selectedVariation?.id || 'default';
      
      if (!grouped.has(originalId)) {
        grouped.set(originalId, new Map());
      }
      const variationsMap = grouped.get(originalId)!;
      if (!variationsMap.has(variationId)) {
        variationsMap.set(variationId, []);
      }
      variationsMap.get(variationId)!.push(item);
    });

    return grouped;
  }, [cartItems, useMultipleAccounts]);

  // Check for existing order on mount (after itemsWithCustomFields and hasAnyCustomFields are defined)
  useEffect(() => {
    const checkExistingOrder = async () => {
      const storedOrderId = localStorage.getItem('current_order_id');
      if (storedOrderId) {
        const order = await fetchOrderById(storedOrderId);
        if (order) {
          setExistingOrderId(order.id);
          setExistingOrderStatus(order.status);
          setOrderId(order.id);
          
          // Load customer information from rejected order into form fields
          if (order.status === 'rejected' && order.customer_info) {
            const loadedValues: Record<string, string> = {};
            
            // Check if this is a multiple accounts order
            if (order.customer_info['Multiple Accounts']) {
              // Enable multiple accounts mode
              setUseMultipleAccounts(true);
              
              // Load multiple accounts data
              const accounts = order.customer_info['Multiple Accounts'] as Array<{
                game: string;
                package: string;
                fields: Record<string, string>;
              }>;
              
              accounts.forEach((account) => {
                // Find the matching game and variation
                const matchingItem = cartItems.find(item => {
                  const originalId = getOriginalMenuItemId(item.id);
                  const gameMatch = item.name === account.game;
                  const packageMatch = item.selectedVariation?.name === account.package;
                  return gameMatch && packageMatch;
                });
                
                if (matchingItem) {
                  const originalId = getOriginalMenuItemId(matchingItem.id);
                  const variationId = matchingItem.selectedVariation?.id || 'default';
                  
                  if (hasAnyCustomFields && matchingItem.customFields) {
                    matchingItem.customFields.forEach(field => {
                      const fieldValue = account.fields[field.label];
                      if (fieldValue) {
                        const valueKey = `${originalId}_${variationId}_${field.key}`;
                        loadedValues[valueKey] = fieldValue;
                      }
                    });
                  } else {
                    // Default IGN field
                    const ignValue = account.fields['IGN'];
                    if (ignValue) {
                      const valueKey = `default_${originalId}_${variationId}_ign`;
                      loadedValues[valueKey] = ignValue;
                    }
                  }
                }
              });
            } else {
              // Single account mode
              setUseMultipleAccounts(false);
              Object.entries(order.customer_info).forEach(([key, value]) => {
                // Skip payment method as it's not editable
                if (key !== 'Payment Method') {
                  // Try to match with custom fields
                  if (hasAnyCustomFields) {
                    itemsWithCustomFields.forEach((item) => {
                      const originalId = getOriginalMenuItemId(item.id);
                      item.customFields?.forEach(field => {
                        if (field.label === key) {
                          const valueKey = `${originalId}_${field.key}`;
                          loadedValues[valueKey] = value as string;
                        }
                      });
                    });
                  } else {
                    // Default IGN field
                    if (key === 'IGN') {
                      loadedValues['default_ign'] = value as string;
                    }
                  }
                }
              });
            }
            
            // Only update if we have values to load
            if (Object.keys(loadedValues).length > 0) {
              setCustomFieldValues(prev => ({ ...prev, ...loadedValues }));
            }
          }
          
          // Clear localStorage if order is approved or rejected
          if (order.status === 'approved' || order.status === 'rejected') {
            localStorage.removeItem('current_order_id');
            // For rejected orders, keep the IDs so user can see the order and place a new one
            // Only clear them if order is approved (succeeded)
            if (order.status === 'approved') {
              setExistingOrderStatus(null);
              setExistingOrderId(null);
              setOrderId(null);
            }
          }
        } else {
          // Order not found, clear localStorage
          localStorage.removeItem('current_order_id');
        }
      }
      setIsCheckingExistingOrder(false);
    };

    checkExistingOrder();
  }, [fetchOrderById, hasAnyCustomFields, itemsWithCustomFields]);

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
    
    if (useMultipleAccounts && itemsByGameAndVariation) {
      // Multiple accounts mode
      const sections: string[] = [];
      
      Array.from(itemsByGameAndVariation.entries()).forEach(([gameId, variationsMap]) => {
        const firstItem = cartItems.find(item => getOriginalMenuItemId(item.id) === gameId);
        if (!firstItem) return;
        
        Array.from(variationsMap.entries()).forEach(([variationId, items]) => {
          const variation = items[0].selectedVariation;
          const originalId = getOriginalMenuItemId(items[0].id);
          const accountFields: Array<{ label: string, value: string }> = [];
          
          if (hasAnyCustomFields && firstItem.customFields) {
            firstItem.customFields.forEach(field => {
              const valueKey = `${originalId}_${variationId}_${field.key}`;
              const value = customFieldValues[valueKey];
              if (value) {
                accountFields.push({ label: field.label, value });
              }
            });
          } else {
            // Default IGN field
            const valueKey = `default_${gameId}_${variationId}_ign`;
            const value = customFieldValues[valueKey];
            if (value) {
              accountFields.push({ label: 'IGN', value });
            }
          }
          
          if (accountFields.length > 0) {
            sections.push(`${firstItem.name} (${variation?.name || 'Default'})`);
            accountFields.forEach(field => {
              sections.push(`  ${field.label}: ${field.value}`);
            });
          }
        });
      });
      
      if (sections.length > 0) {
        customFieldsSection = sections.join('\n');
      }
    } else if (hasAnyCustomFields) {
      // Single account mode with custom fields
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
      // Single account mode with default IGN
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

  const handleCopyAccountName = async (accountName: string) => {
    try {
      await navigator.clipboard.writeText(accountName);
      setCopiedAccountName(true);
      setTimeout(() => setCopiedAccountName(false), 2000);
    } catch (error) {
      console.error('Failed to copy account name:', error);
    }
  };

  // Detect if we're in Messenger's in-app browser
  const isMessengerBrowser = useMemo(() => {
    return /FBAN|FBAV/i.test(navigator.userAgent) || 
           /FB_IAB/i.test(navigator.userAgent);
  }, []);

  const handleDownloadQRCode = async (qrCodeUrl: string | null | undefined, paymentMethodName: string) => {
    // Only disable in Messenger's in-app browser
    // All external browsers (Chrome, Safari, Firefox, Edge, etc.) should work
    if (isMessengerBrowser || !qrCodeUrl) {
      // In Messenger, downloads don't work - users can long-press the QR code image
      // Also return early if no QR code URL is provided
      return;
    }
    
    // For all external browsers, fetch and download as blob to force download
    // This approach works in Chrome, Safari, Firefox, Edge, Opera, and other modern browsers
    try {
      const response = await fetch(qrCodeUrl, {
        mode: 'cors',
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr-code-${paymentMethodName.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.style.display = 'none';
      
      // Append to body, click, then remove
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: try direct link with download attribute
      // This works in most browsers but may open instead of download in some cases
      try {
        const link = document.createElement('a');
        link.href = qrCodeUrl;
        link.download = `qr-code-${paymentMethodName.toLowerCase().replace(/\s+/g, '-')}.png`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
        }, 100);
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
      }
    }
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

  const handlePlaceOrderDirect = async () => {
    if (!paymentMethod) {
      setReceiptError('Please select a payment method');
      return;
    }
    
    if (!receiptImageUrl) {
      setReceiptError('Please upload your payment receipt before placing the order');
      return;
    }

    setIsPlacingOrder(true);
    setReceiptError(null);

    try {
      // Build customer info object
      const customerInfo: Record<string, string | any> = {};
      
      // Add payment method
      if (selectedPaymentMethod) {
        customerInfo['Payment Method'] = selectedPaymentMethod.name;
      }

      // Multiple accounts mode: store account info per package
      if (useMultipleAccounts && itemsByGameAndVariation) {
        const accountsByPackage: Array<{
          game: string;
          package: string;
          fields: Record<string, string>;
        }> = [];

        Array.from(itemsByGameAndVariation.entries()).forEach(([gameId, variationsMap]) => {
          const firstItem = cartItems.find(item => getOriginalMenuItemId(item.id) === gameId);
          if (!firstItem) return;

          Array.from(variationsMap.entries()).forEach(([variationId, items]) => {
            const variation = items[0].selectedVariation;
            const originalId = getOriginalMenuItemId(items[0].id);
            const packageFields: Record<string, string> = {};

            if (hasAnyCustomFields && firstItem.customFields) {
              firstItem.customFields.forEach(field => {
                const valueKey = `${originalId}_${variationId}_${field.key}`;
                const value = customFieldValues[valueKey];
                if (value) {
                  packageFields[field.label] = value;
                }
              });
            } else {
              // Default IGN field
              const valueKey = `default_${gameId}_${variationId}_ign`;
              const value = customFieldValues[valueKey];
              if (value) {
                packageFields['IGN'] = value;
              }
            }

            if (Object.keys(packageFields).length > 0) {
              accountsByPackage.push({
                game: firstItem.name,
                package: variation?.name || 'Default',
                fields: packageFields,
              });
            }
          });
        });

        if (accountsByPackage.length > 0) {
          customerInfo['Multiple Accounts'] = accountsByPackage;
        }
      } else {
        // Single account mode (default)
        // Add custom fields
        if (hasAnyCustomFields) {
          itemsWithCustomFields.forEach((item) => {
            const originalId = getOriginalMenuItemId(item.id);
            item.customFields?.forEach(field => {
              const valueKey = `${originalId}_${field.key}`;
              const value = customFieldValues[valueKey];
              if (value) {
                customerInfo[field.label] = value;
              }
            });
          });
        } else {
          // Default IGN field
          if (customFieldValues['default_ign']) {
            customerInfo['IGN'] = customFieldValues['default_ign'];
          }
        }
      }

      // Create order
      const newOrder = await createOrder({
        order_items: cartItems,
        customer_info: customerInfo,
        payment_method_id: paymentMethod,
        receipt_url: receiptImageUrl,
        total_price: totalPrice,
      });

      if (newOrder) {
        setOrderId(newOrder.id);
        setExistingOrderId(newOrder.id);
        setExistingOrderStatus(newOrder.status);
        // Store order ID in localStorage
        localStorage.setItem('current_order_id', newOrder.id);
        setIsOrderModalOpen(true);
      } else {
        setReceiptError('Failed to create order. Please try again.');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      setReceiptError('Failed to create order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const isDetailsValid = useMemo(() => {
    if (useMultipleAccounts && itemsByGameAndVariation) {
      // Multiple accounts mode: validate each package separately
      if (hasAnyCustomFields) {
        // Check all required fields for each game and variation combination
        return Array.from(itemsByGameAndVariation.entries()).every(([gameId, variationsMap]) => {
          const firstItem = cartItems.find(item => getOriginalMenuItemId(item.id) === gameId);
          if (!firstItem || !firstItem.customFields) return true;
          
          return Array.from(variationsMap.entries()).every(([variationId]) => {
            const originalId = getOriginalMenuItemId(firstItem.id);
            return firstItem.customFields!.every(field => {
              if (!field.required) return true;
              const valueKey = `${originalId}_${variationId}_${field.key}`;
              return customFieldValues[valueKey]?.trim() || false;
            });
          });
        });
      } else {
        // Default IGN field for each package
        return Array.from(itemsByGameAndVariation.entries()).every(([gameId, variationsMap]) => {
          return Array.from(variationsMap.entries()).every(([variationId]) => {
            const valueKey = `default_${gameId}_${variationId}_ign`;
            return customFieldValues[valueKey]?.trim() || false;
          });
        });
      }
    }
    
    // Single account mode (default)
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
  }, [hasAnyCustomFields, itemsWithCustomFields, customFieldValues, useMultipleAccounts, itemsByGameAndVariation, cartItems]);

  if (step === 'details') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center mb-8 relative">
          <button
            onClick={onBack}
            className="flex items-center text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200 absolute left-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-3xl font-semibold text-cafe-text">Order Details</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Customer Details Form */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-2xl font-medium text-cafe-text mb-6">Customer Information</h2>
            
            <form className="space-y-6">
              {/* Multiple Accounts Toggle */}
              {hasMultiplePackagesForSameGame && (
                <div className="mb-4 p-4 glass-strong border border-cafe-primary/30 rounded-lg">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-cafe-text">Multiple Accounts</p>
                      <p className="text-xs text-cafe-textMuted mt-1">
                        You have multiple different packages for the same game. Enable this to provide separate account information for each package.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={useMultipleAccounts}
                      onChange={(e) => {
                        setUseMultipleAccounts(e.target.checked);
                        // Clear custom field values when toggling to reset form
                        if (!e.target.checked) {
                          setCustomFieldValues({});
                        }
                      }}
                      disabled={existingOrderStatus === 'pending' || existingOrderStatus === 'processing'}
                      className="w-5 h-5 text-cafe-primary border-cafe-primary/30 rounded focus:ring-cafe-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </label>
                </div>
              )}

              {/* Show count of items with custom fields */}
              {hasAnyCustomFields && itemsWithCustomFields.length > 0 && !useMultipleAccounts && (
                <div className="mb-4 p-3 glass-strong border border-cafe-primary/30 rounded-lg">
                  <p className="text-sm text-cafe-text">
                    <span className="font-semibold text-cafe-primary">{itemsWithCustomFields.length}</span> game{itemsWithCustomFields.length > 1 ? 's' : ''} require{itemsWithCustomFields.length === 1 ? 's' : ''} additional information
                  </p>
                </div>
              )}

              {/* Bulk Input Section - Only show when NOT using multiple accounts */}
              {!useMultipleAccounts && itemsWithCustomFields.length >= 2 && (
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

              {/* Dynamic Custom Fields - Multiple Accounts Mode */}
              {useMultipleAccounts && itemsByGameAndVariation && hasAnyCustomFields ? (
                Array.from(itemsByGameAndVariation.entries()).map(([gameId, variationsMap]) => {
                  const firstItem = cartItems.find(item => getOriginalMenuItemId(item.id) === gameId);
                  if (!firstItem) return null;
                  
                  return Array.from(variationsMap.entries()).map(([variationId, items]) => {
                    const variation = items[0].selectedVariation;
                    const originalId = getOriginalMenuItemId(items[0].id);
                    
                    return (
                      <div key={`${gameId}_${variationId}`} className="space-y-4 pb-6 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                        <div className="mb-4 flex items-center gap-4">
                          {/* Game Icon */}
                          <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg">
                            {firstItem.image ? (
                              <img
                                src={firstItem.image}
                                alt={firstItem.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-full h-full flex items-center justify-center ${firstItem.image ? 'hidden' : ''}`}>
                              <div className="text-2xl opacity-20 text-gray-400">🎮</div>
                            </div>
                          </div>
                          
                          {/* Game Title and Package */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-cafe-text">{firstItem.name}</h3>
                            <p className="text-sm text-cafe-textMuted">
                              Package: {variation?.name || 'Default'}
                            </p>
                            <p className="text-xs text-cafe-textMuted mt-1">
                              Please provide account information for this package
                            </p>
                          </div>
                        </div>
                        {firstItem.customFields?.map((field) => {
                          const valueKey = `${originalId}_${variationId}_${field.key}`;
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
                                disabled={existingOrderStatus === 'pending' || existingOrderStatus === 'processing'}
                                className={`w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted ${
                                  existingOrderStatus === 'pending' || existingOrderStatus === 'processing' ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                placeholder={field.placeholder || field.label}
                                required={field.required}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                }).flat().filter(Boolean)
              ) : hasAnyCustomFields && !useMultipleAccounts ? (
                itemsWithCustomFields.map((item) => (
                  <div key={item.id} className="space-y-4 pb-6 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                    <div className="mb-4 flex items-center gap-4">
                      {/* Game Icon */}
                      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center ${item.image ? 'hidden' : ''}`}>
                          <div className="text-2xl opacity-20 text-gray-400">🎮</div>
                        </div>
                      </div>
                      
                      {/* Game Title and Description */}
                      <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-cafe-text">{item.name}</h3>
                      <p className="text-sm text-cafe-textMuted">Please provide the following information for this game</p>
                      </div>
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
                            disabled={existingOrderStatus === 'pending' || existingOrderStatus === 'processing'}
                            className={`w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted ${
                              existingOrderStatus === 'pending' || existingOrderStatus === 'processing' ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                            placeholder={field.placeholder || field.label}
                            required={field.required}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : !useMultipleAccounts ? (
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
                    disabled={existingOrderStatus === 'pending' || existingOrderStatus === 'processing'}
                    className={`w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted ${
                      existingOrderStatus === 'pending' || existingOrderStatus === 'processing' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    placeholder="In game name"
                    required
                  />
                </div>
              ) : (
                // Multiple accounts mode but no custom fields - show default IGN for each package
                itemsByGameAndVariation && Array.from(itemsByGameAndVariation.entries()).map(([gameId, variationsMap]) => {
                  const firstItem = cartItems.find(item => getOriginalMenuItemId(item.id) === gameId);
                  if (!firstItem) return null;
                  
                  return Array.from(variationsMap.entries()).map(([variationId, items]) => {
                    const variation = items[0].selectedVariation;
                    const valueKey = `default_${gameId}_${variationId}_ign`;
                    
                    return (
                      <div key={`${gameId}_${variationId}`} className="space-y-4 pb-6 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-cafe-text">{firstItem.name}</h3>
                          <p className="text-sm text-cafe-textMuted">Package: {variation?.name || 'Default'}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-cafe-text mb-2">
                            IGN <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={customFieldValues[valueKey] || ''}
                            onChange={(e) => setCustomFieldValues({
                              ...customFieldValues,
                              [valueKey]: e.target.value
                            })}
                            disabled={existingOrderStatus === 'pending' || existingOrderStatus === 'processing'}
                            className={`w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted ${
                              existingOrderStatus === 'pending' || existingOrderStatus === 'processing' ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                            placeholder="In game name"
                            required
                          />
                        </div>
                      </div>
                    );
                  });
                }).flat().filter(Boolean)
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
                <div key={item.id} className="flex items-start gap-4 py-3 border-b border-cafe-primary/30">
                  {/* Game Icon */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-full h-full flex items-center justify-center ${item.image ? 'hidden' : ''}`}>
                      <div className="text-2xl opacity-20 text-gray-400">🎮</div>
                    </div>
                  </div>
                  
                  {/* Game Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-cafe-text mb-1">{item.name}</h4>
                    {item.selectedVariation && (
                      <p className="text-sm text-cafe-textMuted">Package: {item.selectedVariation.name}</p>
                    )}
                    {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                      <p className="text-sm text-cafe-textMuted">
                        Add-ons: {item.selectedAddOns.map(addOn => addOn.name).join(', ')}
                      </p>
                    )}
                    <p className="text-sm text-cafe-textMuted mt-1">₱{item.totalPrice} × {item.quantity}</p>
                  </div>
                  
                  {/* Price */}
                  <div className="flex-shrink-0">
                  <span className="font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</span>
                  </div>
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
  if (step === 'payment') {
    return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-center mb-8 relative">
        <button
          onClick={() => setStep('details')}
          className="flex items-center text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200 absolute left-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-3xl font-semibold text-cafe-text">Payment</h1>
      </div>

      <div className="max-w-2xl mx-auto">
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
              <div className="space-y-4">
                {/* Payment Method Name */}
                <div>
                  <p className="text-lg font-semibold text-cafe-text">{selectedPaymentMethod.name}</p>
                </div>
                
                {/* Account Name with Copy Button */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm text-cafe-textMuted">Account Name:</p>
                    <button
                      onClick={() => handleCopyAccountName(selectedPaymentMethod.account_name)}
                      className="px-3 py-1.5 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 flex-shrink-0 text-sm font-medium"
                      title="Copy account name"
                    >
                      {copiedAccountName ? (
                        <span className="text-green-400">Copied!</span>
                      ) : (
                        <span className="text-cafe-text">Copy</span>
                      )}
                    </button>
                  </div>
                  <p className="text-cafe-text font-medium">{selectedPaymentMethod.account_name}</p>
                </div>
                
                {/* Other Option */}
                <div>
                  <h3 className="font-medium text-cafe-text text-center">Other Option</h3>
                </div>
                
                {/* Download QR Button and QR Image */}
                {selectedPaymentMethod.qr_code_url ? (
                <div className="flex flex-col items-center gap-3">
                  {!isMessengerBrowser && (
                    <button
                      onClick={() => handleDownloadQRCode(selectedPaymentMethod.qr_code_url, selectedPaymentMethod.name)}
                      className="px-3 py-1.5 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 text-sm font-medium text-cafe-text flex items-center gap-2"
                      title="Download QR code"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download QR</span>
                    </button>
                  )}
                  {isMessengerBrowser && (
                    <p className="text-xs text-cafe-textMuted text-center">Long-press the QR code to save</p>
                  )}
                  <img 
                    src={selectedPaymentMethod.qr_code_url} 
                    alt={`${selectedPaymentMethod.name} QR Code`}
                    className="w-32 h-32 rounded-lg border-2 border-cafe-primary/30 shadow-sm"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
                    }}
                  />
                </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-32 h-32 rounded-lg border-2 border-cafe-primary/30 shadow-sm bg-cafe-darkCard flex items-center justify-center">
                      <p className="text-xs text-cafe-textMuted text-center">No QR Code Available</p>
                    </div>
                  </div>
                )}
                
                {/* Account Number with Copy Button */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm text-cafe-textMuted">Account Number:</p>
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
                  <p className="font-mono text-cafe-text font-medium text-xl md:text-2xl">{selectedPaymentMethod.account_number}</p>
                </div>
                
                {/* Amount and Instructions */}
                <div className="pt-2 border-t border-cafe-primary/20">
                  <p className="text-xl font-semibold text-white mb-2">Amount: ₱{totalPrice}</p>
                  <p className="text-sm text-cafe-textMuted">Press the copy button to copy the number or download the QR code, make a payment, then proceed to the next page to upload your receipt.</p>
                </div>
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <button
            onClick={() => setStep('summary')}
            disabled={!paymentMethod}
            className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform mb-6 ${
              paymentMethod
                ? 'text-white hover:opacity-90 hover:scale-[1.02]'
                : 'glass text-cafe-textMuted cursor-not-allowed'
            }`}
            style={paymentMethod ? { backgroundColor: '#1E7ACB' } : {}}
          >
            Confirm
          </button>

          {/* Payment instructions */}
          <div className="glass border border-cafe-primary/30 rounded-lg p-4">
            <h4 className="font-medium text-cafe-text mb-2">📸 Payment Proof Required</h4>
            <p className="text-sm text-cafe-textMuted">
              After making your payment, please upload a screenshot of your payment receipt on the next page. This helps us verify and process your order quickly.
            </p>
          </div>
        </div>
      </div>
    </div>
    );
  }

  // Summary Step - Final Order Summary
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-center mb-8 relative">
        <button
          onClick={() => setStep('payment')}
          className="flex items-center text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200 absolute left-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-3xl font-semibold text-cafe-text">Order</h1>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="space-y-4 mb-6">
          {cartItems.map((item) => (
            <div key={item.id} className="flex items-start gap-4 py-3 border-b border-cafe-primary/30">
              {/* Game Icon */}
              <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`w-full h-full flex items-center justify-center ${item.image ? 'hidden' : ''}`}>
                  <div className="text-2xl opacity-20 text-gray-400">🎮</div>
                </div>
              </div>
              
              {/* Game Details */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-cafe-text mb-1">{item.name}</h4>
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
                <p className="text-sm text-cafe-textMuted mt-1">₱{item.totalPrice} × {item.quantity}</p>
              </div>
              
              {/* Price */}
              <div className="flex-shrink-0">
                <span className="font-semibold text-cafe-text">₱{item.totalPrice * item.quantity}</span>
              </div>
            </div>
          ))}
        </div>
        
        <div className="pt-4 mb-6">
          <div className="flex items-center justify-between text-2xl font-semibold text-cafe-text">
            <span>Total:</span>
            <span className="text-white">₱{totalPrice}</span>
          </div>
        </div>

        {/* Customer Information Display */}
        <div className="mb-6">
          <h4 className="font-medium text-cafe-text mb-2">Customer Information</h4>
          <div className="space-y-3">
            {selectedPaymentMethod && (
              <div>
                <label className="block text-sm font-medium text-cafe-text mb-1">
                  Payment Method
                </label>
                <p className="text-sm text-cafe-textMuted">{selectedPaymentMethod.name}</p>
              </div>
            )}
            {existingOrderStatus === 'rejected' ? (
              // Editable fields when order is rejected
              <>
                {hasAnyCustomFields ? (
                  itemsWithCustomFields.map((item) => {
                    const originalId = getOriginalMenuItemId(item.id);
                    return item.customFields?.map(field => {
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
                    });
                  })
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
              </>
            ) : (
              // Read-only display when order is not rejected
              <div className="space-y-1">
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
                    
                    return fields && fields.length > 0 ? fields : null;
                  })
                ) : (
                  customFieldValues['default_ign'] && (
                    <p className="text-sm text-cafe-textMuted">
                      IGN: {customFieldValues['default_ign']}
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Receipt Upload Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-cafe-text mb-2">
            Payment Receipt <span className="text-red-400">*</span>
          </label>
          
          {!receiptPreview ? (
            <div className="relative glass border-2 border-dashed border-cafe-primary/30 rounded-lg p-6 text-center hover:border-cafe-primary transition-colors duration-200">
              <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-cafe-primary text-white flex items-center justify-center text-xs font-bold">
                1
              </div>
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
              <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-cafe-primary text-white flex items-center justify-center text-xs font-bold">
                1
              </div>
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
          {orderOption === 'order_via_messenger' ? (
            <>
              {/* Copy button - must be clicked before placing order */}
              <button
                onClick={handleCopyMessage}
                disabled={uploadingReceipt || !paymentMethod || !receiptImageUrl}
                className={`relative w-full py-3 rounded-xl font-medium transition-all duration-200 transform mb-3 flex items-center justify-center space-x-2 ${
                  !uploadingReceipt && paymentMethod && receiptImageUrl
                    ? 'glass border border-cafe-primary/30 text-cafe-text hover:border-cafe-primary hover:glass-strong'
                    : 'glass border border-cafe-primary/20 text-cafe-textMuted cursor-not-allowed'
                }`}
              >
                <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  !uploadingReceipt && paymentMethod && receiptImageUrl
                    ? 'bg-cafe-primary text-white'
                    : 'bg-cafe-textMuted/30 text-cafe-textMuted'
                }`}>
                  2
                </div>
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
                className={`relative w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
                  paymentMethod && receiptImageUrl && !uploadingReceipt && hasCopiedMessage
                    ? 'text-white hover:opacity-90 hover:scale-[1.02]'
                    : 'glass text-cafe-textMuted cursor-not-allowed'
                }`}
                style={paymentMethod && receiptImageUrl && !uploadingReceipt && hasCopiedMessage ? { backgroundColor: '#1E7ACB' } : {}}
              >
                <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  paymentMethod && receiptImageUrl && !uploadingReceipt && hasCopiedMessage
                    ? 'bg-cafe-primary text-white'
                    : 'bg-cafe-textMuted/30 text-cafe-textMuted'
                }`}>
                  3
                </div>
                {uploadingReceipt ? 'Uploading Receipt...' : 'Order via Messenger'}
              </button>
              
              <p className="text-xs text-cafe-textMuted text-center mt-3">
                You'll be redirected to Facebook Messenger to confirm your order. Your receipt has been uploaded and will be included in the message.
              </p>
            </>
          ) : (
            <>
              {/* Show View Order button if order is processing/pending, Place Order if rejected or no order */}
              {existingOrderStatus === 'pending' || existingOrderStatus === 'processing' ? (
                <button
                  onClick={() => {
                    if (existingOrderId) {
                      setOrderId(existingOrderId);
                      setIsOrderModalOpen(true);
                    }
                  }}
                  className="relative w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform text-white hover:opacity-90 hover:scale-[1.02]"
                  style={{ backgroundColor: '#1E7ACB' }}
                >
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-cafe-primary text-white">
                    2
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Eye className="h-5 w-5" />
                    View Order
                  </div>
                </button>
              ) : (
                <button
                  onClick={handlePlaceOrderDirect}
                  disabled={!paymentMethod || !receiptImageUrl || uploadingReceipt || isPlacingOrder}
                  className={`relative w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
                    paymentMethod && receiptImageUrl && !uploadingReceipt && !isPlacingOrder
                      ? 'text-white hover:opacity-90 hover:scale-[1.02]'
                      : 'glass text-cafe-textMuted cursor-not-allowed'
                  }`}
                  style={paymentMethod && receiptImageUrl && !uploadingReceipt && !isPlacingOrder ? { backgroundColor: '#1E7ACB' } : {}}
                >
                  <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    paymentMethod && receiptImageUrl && !uploadingReceipt && !isPlacingOrder
                      ? 'bg-cafe-primary text-white'
                      : 'bg-cafe-textMuted/30 text-cafe-textMuted'
                  }`}>
                    2
                  </div>
                  {isPlacingOrder ? 'Placing Order...' : existingOrderStatus === 'rejected' ? 'Order Again' : 'Place Order'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Order Status Modal */}
      <OrderStatusModal
        orderId={orderId}
        isOpen={isOrderModalOpen}
        onClose={() => {
          setIsOrderModalOpen(false);
          // Check order status when modal closes
          if (orderId) {
            fetchOrderById(orderId).then(order => {
              if (order) {
                setExistingOrderStatus(order.status);
                if (order.status === 'approved' || order.status === 'rejected') {
                  localStorage.removeItem('current_order_id');
                  // Keep orderId and existingOrderId for rejected orders so user can see the info
                  // Only clear them if order is approved (succeeded)
                  if (order.status === 'approved') {
                    setExistingOrderStatus(null);
                    setExistingOrderId(null);
                    setOrderId(null);
                  }
                  // For rejected orders, keep the IDs so the button shows "Order Again"
                  // and user can still view the order details
                }
              }
            });
          }
        }}
        onSucceededClose={() => {
          localStorage.removeItem('current_order_id');
          setExistingOrderStatus(null);
          setExistingOrderId(null);
          setOrderId(null);
          if (onNavigateToMenu) {
            onNavigateToMenu();
          }
        }}
      />
    </div>
  );
};

export default Checkout;