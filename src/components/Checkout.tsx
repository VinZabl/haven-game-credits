import React, { useState, useMemo, useRef } from 'react';
import { ArrowLeft, Upload, X, Copy, Check, MousePointerClick, Download } from 'lucide-react';
import { CartItem, PaymentMethod, CustomField } from '../types';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useImageUpload } from '../hooks/useImageUpload';
import { useOrders } from '../hooks/useOrders';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useMemberAuth } from '../hooks/useMemberAuth';
import { supabase } from '../lib/supabase';
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
  const { createOrder } = useOrders();
  const { siteSettings } = useSiteSettings();
  const { currentMember } = useMemberAuth();
  const orderOption = siteSettings?.order_option || 'order_via_messenger';
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
  const [generatedInvoiceNumber, setGeneratedInvoiceNumber] = useState<string | null>(null);
  const [invoiceNumberDate, setInvoiceNumberDate] = useState<string | null>(null);
  const [showPaymentDetailsModal, setShowPaymentDetailsModal] = useState(false);

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

  // Detect if we can use multiple accounts (same game with different packages)
  const canUseMultipleAccounts = useMemo(() => {
    if (!hasAnyCustomFields) return false;
    
    // Group cart items by original menu item ID (game)
    const itemsByGame = new Map<string, typeof cartItems>();
    cartItems.forEach(item => {
      const originalId = getOriginalMenuItemId(item.id);
      if (!itemsByGame.has(originalId)) {
        itemsByGame.set(originalId, []);
      }
      itemsByGame.get(originalId)!.push(item);
    });
    
    // Check if any game has multiple different packages/variations
    for (const [gameId, items] of itemsByGame.entries()) {
      if (items.length > 1) {
        // Check if they have different variations
        const variationIds = new Set(items.map(item => item.selectedVariation?.id || 'none'));
        if (variationIds.size > 1) {
          return true;
        }
      }
    }
    
    return false;
  }, [cartItems, hasAnyCustomFields]);

  // Get items grouped by game and variation for multiple accounts
  const itemsByGameAndVariation = useMemo(() => {
    if (!canUseMultipleAccounts) return [];
    
    const grouped = new Map<string, Map<string, typeof cartItems[0][]>>();
    
    cartItems.forEach(item => {
      const originalId = getOriginalMenuItemId(item.id);
      const variationId = item.selectedVariation?.id || 'none';
      
      if (!grouped.has(originalId)) {
        grouped.set(originalId, new Map());
      }
      const gameGroup = grouped.get(originalId)!;
      
      if (!gameGroup.has(variationId)) {
        gameGroup.set(variationId, []);
      }
      gameGroup.get(variationId)!.push(item);
    });
    
    // Convert to array format
    const result: Array<{
      gameId: string;
      gameName: string;
      variationId: string;
      variationName: string;
      items: typeof cartItems[0][];
    }> = [];
    
    grouped.forEach((variations, gameId) => {
      const firstItem = Array.from(variations.values())[0][0];
      const gameName = firstItem.name;
      
      variations.forEach((items, variationId) => {
        const variationName = items[0].selectedVariation?.name || 'Default';
        result.push({
          gameId,
          gameName,
          variationId,
          variationName,
          items
        });
      });
    });
    
    return result;
  }, [cartItems, canUseMultipleAccounts]);

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
  }, []);

  // Show payment details modal when payment method is selected
  React.useEffect(() => {
    if (paymentMethod) {
      setShowPaymentDetailsModal(true);
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
  }, []);

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
    setGeneratedInvoiceNumber(null); // Reset invoice number when receipt is removed
    setInvoiceNumberDate(null);
  };

  // Helper function to get current date in Philippine timezone (Asia/Manila, UTC+8)
  const getPhilippineDate = () => {
    const now = new Date();
    // Convert to Philippine time (UTC+8)
    const philippineTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    // Get date components
    const year = philippineTime.getFullYear();
    const month = String(philippineTime.getMonth() + 1).padStart(2, '0');
    const day = String(philippineTime.getDate()).padStart(2, '0');
    return {
      dateString: `${year}-${month}-${day}`, // YYYY-MM-DD
      dayOfMonth: philippineTime.getDate()
    };
  };

  // Generate invoice number (format: {orderNumber}M{day}D{orderNumber})
  // Example: 1M17D1 = 1st order on the 17th day of the month
  //          1M17D2 = 2nd order on the 17th day of the month
  // Resets daily at 12:00 AM Philippine time (Asia/Manila, UTC+8)
  // The invoice number increments each time "Copy Order Message" is clicked (forceNew = true)
  // Subsequent calls (like "Order via Messenger") will reuse the same invoice number (forceNew = false)
  // Uses database (site_settings) to track invoice count with proper locking to prevent race conditions
  const generateInvoiceNumber = async (forceNew: boolean = false): Promise<string> => {
    const { dateString: todayStr, dayOfMonth } = getPhilippineDate();
    
    // Check if we already generated an invoice number for today and forceNew is false
    // If forceNew is false, reuse the existing number from state
    if (!forceNew && generatedInvoiceNumber && invoiceNumberDate === todayStr) {
      return generatedInvoiceNumber;
    }

    try {
      // Get invoice count from database (site_settings table)
      const countSettingId = 'invoice_count';
      const dateSettingId = 'invoice_count_date';
      
      // Fetch current invoice count and date from database
      // Use a transaction-like approach: fetch, check, update
      const { data: countData, error: countError } = await supabase
        .from('site_settings')
        .select('value')
        .eq('id', countSettingId)
        .maybeSingle();
      
      if (countError) {
        console.error('Error fetching invoice count:', countError);
        // Continue with default value
      }
      
      const { data: dateData, error: dateError } = await supabase
        .from('site_settings')
        .select('value')
        .eq('id', dateSettingId)
        .maybeSingle();
      
      if (dateError) {
        console.error('Error fetching invoice count date:', dateError);
        // Continue with default value
      }
      
      let currentCount = 0;
      const lastDate = dateData?.value || null;
      
      // Check if we need to reset (new day)
      if (lastDate !== todayStr) {
        // New day - reset the count to 0
        currentCount = 0;
        
        // Update both count and date in database atomically
        const { error: updateCountError } = await supabase
          .from('site_settings')
          .upsert({ id: countSettingId, value: '0', type: 'number', description: 'Current invoice count for the day' }, { onConflict: 'id' });
        
        if (updateCountError) {
          console.error('Error updating invoice count:', updateCountError);
        }
        
        const { error: updateDateError } = await supabase
          .from('site_settings')
          .upsert({ id: dateSettingId, value: todayStr, type: 'text', description: 'Date of the current invoice count' }, { onConflict: 'id' });
        
        if (updateDateError) {
          console.error('Error updating invoice date:', updateDateError);
        }
      } else {
        // Same day - get current count from database
        currentCount = countData?.value ? parseInt(countData.value, 10) : 0;
      }
      
      // If forceNew is true (Copy button clicked), always increment the count
      // This ensures each new order gets a new invoice number
      if (forceNew) {
        currentCount += 1;
        
        // Update count in database - ensure this completes before returning
        const { error: updateError } = await supabase
          .from('site_settings')
          .upsert({ id: countSettingId, value: currentCount.toString(), type: 'number', description: 'Current invoice count for the day' }, { onConflict: 'id' });
        
        if (updateError) {
          console.error('Error updating invoice count:', updateError);
          // Still use the incremented count even if update fails
        }
      } else {
        // If forceNew is false and no count exists, start at 1
        if (currentCount === 0) {
          currentCount = 1;
          const { error: updateError } = await supabase
            .from('site_settings')
            .upsert({ id: countSettingId, value: currentCount.toString(), type: 'number', description: 'Current invoice count for the day' }, { onConflict: 'id' });
          
          if (updateError) {
            console.error('Error updating invoice count:', updateError);
          }
        }
      }

      const orderNumber = currentCount;

      // Format: 1M{day}D{orderNumber}
      // Example: AKGXT1M17D1 (1st order on day 17), AKGXT1M17D2 (2nd order on day 17), etc.
      // The first number is always 1, the last number is the order number
      const invoiceNumber = `AKGXT1M${dayOfMonth}D${orderNumber}`;
      
      // Store the generated invoice number and date
      setGeneratedInvoiceNumber(invoiceNumber);
      setInvoiceNumberDate(todayStr);
      
      return invoiceNumber;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      // Fallback to a simple format if there's an error
      const { dayOfMonth } = getPhilippineDate();
      return `1M${dayOfMonth}D1`;
    }
  };

  // Generate the order message text
  const generateOrderMessage = async (forceNewInvoice: boolean = false): Promise<string> => {
    // Generate invoice number first
    // forceNewInvoice is true when "Copy Order Message" is clicked to generate a new number
    // forceNewInvoice is false when "Order via Messenger" is clicked to reuse existing number
    const invoiceNumber = await generateInvoiceNumber(forceNewInvoice);
    
    // Build message lines
    const lines: string[] = [];
    
    // Invoice number
    lines.push(`INVOICE # ${invoiceNumber}`);
    lines.push(''); // Break after invoice
    
    // Handle multiple accounts mode
    if (useMultipleAccounts && canUseMultipleAccounts) {
      // Group by game and variation
      const gameGroups = new Map<string, Array<{ variationName: string; items: CartItem[]; fields: Array<{ label: string, value: string }> }>>();
      
      itemsByGameAndVariation.forEach(({ gameId, gameName, variationId, variationName, items }) => {
        const firstItem = items[0];
        if (!firstItem.customFields) return;
        
        const fields = firstItem.customFields.map(field => {
          const valueKey = `${gameId}_${variationId}_${field.key}`;
          const value = customFieldValues[valueKey] || '';
          return value ? { label: field.label, value } : null;
        }).filter(Boolean) as Array<{ label: string, value: string }>;
        
        if (fields.length === 0) return;
        
        if (!gameGroups.has(gameName)) {
          gameGroups.set(gameName, []);
        }
        gameGroups.get(gameName)!.push({ variationName, items, fields });
      });
      
      // Build message for each game (game name mentioned once)
      gameGroups.forEach((variations, gameName) => {
        lines.push(`GAME: ${gameName}`);
        
        variations.forEach(({ variationName, items, fields }) => {
          // ID & SERVER or other fields
          if (fields.length === 1) {
            lines.push(`${fields[0].label}: ${fields[0].value}`);
          } else if (fields.length > 1) {
            // Combine fields with & if multiple
            const allValuesSame = fields.every(f => f.value === fields[0].value);
            if (allValuesSame) {
              const labels = fields.map(f => f.label);
              if (labels.length === 2) {
                lines.push(`${labels[0]} & ${labels[1]}: ${fields[0].value}`);
              } else {
                const allButLast = labels.slice(0, -1).join(', ');
                const lastLabel = labels[labels.length - 1];
                lines.push(`${allButLast} & ${lastLabel}: ${fields[0].value}`);
              }
            } else {
              // Different values, show each field separately
              fields.forEach(field => {
                lines.push(`${field.label}: ${field.value}`);
              });
            }
          }
          
          // Order items for this variation
          items.forEach(item => {
            const variationText = item.selectedVariation ? ` ${item.selectedVariation.name}` : '';
            const addOnsText = item.selectedAddOns && item.selectedAddOns.length > 0
              ? ` + ${item.selectedAddOns.map(a => a.name).join(', ')}`
              : '';
            lines.push(`ORDER: ${item.name}${variationText}${addOnsText} x${item.quantity} - ₱${item.totalPrice * item.quantity}`);
          });
        });
      });
    } else if (hasAnyCustomFields) {
      // Build game/order sections (single account or bulk mode)
      // Group games by their field values (for bulk input)
      const gamesByFieldValues = new Map<string, { games: string[], items: CartItem[], fields: Array<{ label: string, value: string }> }>();
      const itemsWithoutFields: CartItem[] = [];
      
      cartItems.forEach(cartItem => {
        const originalId = getOriginalMenuItemId(cartItem.id);
        const item = itemsWithCustomFields.find(i => getOriginalMenuItemId(i.id) === originalId);
        
        if (!item || !item.customFields || item.customFields.length === 0) {
          // Item without custom fields, handle separately
          itemsWithoutFields.push(cartItem);
          return;
        }
        
        const fields = item.customFields.map(field => {
          const valueKey = `${originalId}_${field.key}`;
          const value = customFieldValues[valueKey] || '';
          return value ? { label: field.label, value } : null;
        }).filter(Boolean) as Array<{ label: string, value: string }> || [];
        
        if (fields.length === 0) {
          // No field values, treat as item without fields
          itemsWithoutFields.push(cartItem);
          return;
        }
        
        // Create a key based on field values (to group games with same values)
        const valueKey = fields.map(f => `${f.label}:${f.value}`).join('|');
        
        if (!gamesByFieldValues.has(valueKey)) {
          gamesByFieldValues.set(valueKey, { games: [], items: [], fields });
        }
        const group = gamesByFieldValues.get(valueKey)!;
        if (!group.games.includes(item.name)) {
          group.games.push(item.name);
        }
        group.items.push(cartItem);
        group.fields = fields; // Use the fields from this item
      });
      
      // Build sections for each group
      gamesByFieldValues.forEach(({ games, items, fields }) => {
        // Game name (only once if multiple games share same fields)
        lines.push(`GAME: ${games.join(', ')}`);
        
        // ID & SERVER or other fields
        if (fields.length === 1) {
          lines.push(`${fields[0].label}: ${fields[0].value}`);
        } else if (fields.length > 1) {
          // Combine fields with & if multiple
          const allValuesSame = fields.every(f => f.value === fields[0].value);
          if (allValuesSame) {
            // All values same, combine labels with &
            const labels = fields.map(f => f.label);
            if (labels.length === 2) {
              lines.push(`${labels[0]} & ${labels[1]}: ${fields[0].value}`);
            } else {
              const allButLast = labels.slice(0, -1).join(', ');
              const lastLabel = labels[labels.length - 1];
              lines.push(`${allButLast} & ${lastLabel}: ${fields[0].value}`);
            }
          } else {
            // Different values, show each field separately
            const fieldPairs = fields.map(f => `${f.label}: ${f.value}`);
            lines.push(fieldPairs.join(', '));
          }
        }
        
        // Order items
        items.forEach(item => {
          let orderLine = `ORDER: ${item.selectedVariation?.name || item.name}`;
          if (item.quantity > 1) {
            orderLine += ` x${item.quantity}`;
          }
          orderLine += ` - ₱${item.totalPrice * item.quantity}`;
          lines.push(orderLine);
        });
      });
      
      // Handle items without custom fields
      if (itemsWithoutFields.length > 0) {
        const uniqueGames = [...new Set(itemsWithoutFields.map(item => item.name))];
        lines.push(`GAME: ${uniqueGames.join(', ')}`);
        
        itemsWithoutFields.forEach(item => {
          let orderLine = `ORDER: ${item.selectedVariation?.name || item.name}`;
          if (item.quantity > 1) {
            orderLine += ` x${item.quantity}`;
          }
          orderLine += ` - ₱${item.totalPrice * item.quantity}`;
          lines.push(orderLine);
        });
      }
    } else {
      // No custom fields, single account mode
      const uniqueGames = [...new Set(cartItems.map(item => item.name))];
      lines.push(`GAME: ${uniqueGames.join(', ')}`);
      
      // Default IGN field
      const ign = customFieldValues['default_ign'] || '';
      if (ign) {
        lines.push(`IGN: ${ign}`);
      }
      
      // Order items
      cartItems.forEach(item => {
        let orderLine = `ORDER: ${item.selectedVariation?.name || item.name}`;
        if (item.quantity > 1) {
          orderLine += ` x${item.quantity}`;
        }
        orderLine += ` - ₱${item.totalPrice * item.quantity}`;
        lines.push(orderLine);
      });
    }
    
    // Payment
    const paymentLine = `PAYMENT: ${selectedPaymentMethod?.name || ''}${selectedPaymentMethod?.account_name ? ` - ${selectedPaymentMethod.account_name}` : ''}`;
    lines.push(paymentLine);
    
    // Total
    lines.push(`TOTAL: ₱${totalPrice}`);
    lines.push(''); // Break before payment receipt
    
    // Payment Receipt
    lines.push('PAYMENT RECEIPT:');
    if (receiptImageUrl) {
      lines.push(receiptImageUrl);
    }
    
    return lines.join('\n');
  };

  const isSavingOrder = useRef(false);

  const saveOrderToDb = async () => {
    if (orderId || isSavingOrder.current) return orderId;
    
    try {
      isSavingOrder.current = true;
      const customerInfo = getCustomerInfo();
      
      // Generate invoice number if not already generated
      // This ensures each order has a unique invoice number
      let invoiceNum = generatedInvoiceNumber;
      if (!invoiceNum || invoiceNumberDate !== getPhilippineDate().dateString) {
        // Generate new invoice number (forceNew = true to ensure increment)
        invoiceNum = await generateInvoiceNumber(true);
      }
      
      const newOrder = await createOrder({
        order_items: cartItems,
        customer_info: customerInfo as Record<string, string> | Array<{ game: string; package: string; fields: Record<string, string> }>,
        payment_method_id: paymentMethod!,
        receipt_url: receiptImageUrl!,
        total_price: totalPrice,
        member_id: currentMember?.id,
        order_option: orderOption,
        invoice_number: invoiceNum,
      });
      
      if (newOrder) {
        setOrderId(newOrder.id);
        return newOrder.id;
      }
    } catch (error) {
      console.error('Error saving order to database:', error);
    } finally {
      isSavingOrder.current = false;
    }
    return null;
  };

  const handleCopyMessage = async () => {
    try {
      // Save order to database if not already saved
      saveOrderToDb();

      // Detect iOS - use execCommand directly for better compatibility
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      // For iOS, we need to copy synchronously within user gesture
      // So we generate message first, then copy immediately
      let message: string;
      
      if (isIOS) {
        // On iOS, generate message synchronously using optimistic invoice number
        // Then copy immediately, then update database in background
        const { dateString: todayStr, dayOfMonth } = getPhilippineDate();
        
        // Optimistically increment invoice number
        // Fetch current count from database first for accuracy (quick async call)
        let optimisticCount = 1;
        try {
          const { data: countData } = await supabase
            .from('site_settings')
            .select('value')
            .eq('id', 'invoice_count')
            .maybeSingle();
          
          const { data: dateData } = await supabase
            .from('site_settings')
            .select('value')
            .eq('id', 'invoice_count_date')
            .maybeSingle();
          
          const lastDate = dateData?.value || null;
          if (lastDate === todayStr) {
            // Same day - increment from database count
            optimisticCount = countData?.value ? parseInt(countData.value, 10) + 1 : 1;
          } else {
            // New day - start at 1
            optimisticCount = 1;
          }
        } catch (error) {
          console.error('Error fetching invoice count for iOS:', error);
          // Fallback: increment from existing state if available
          if (generatedInvoiceNumber && invoiceNumberDate === todayStr) {
            const match = generatedInvoiceNumber.match(/AKGXT1M\d+D(\d+)/);
            if (match) {
              optimisticCount = parseInt(match[1], 10) + 1;
            }
          }
        }
        
        const optimisticInvoiceNumber = `AKGXT1M${dayOfMonth}D${optimisticCount}`;
        
        // Generate message synchronously (without database calls)
        message = await generateOrderMessageSync(optimisticInvoiceNumber);
        
        // Copy immediately (synchronously)
        const textarea = document.createElement('textarea');
        textarea.value = message;
        textarea.style.position = 'fixed';
        textarea.style.left = '0';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, message.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (successful) {
          setCopied(true);
          setHasCopiedMessage(true);
          setTimeout(() => setCopied(false), 2000);
          
          // Update database in background (async, doesn't block)
          // This ensures the count is properly saved for the next order
          generateInvoiceNumber(true).then((actualInvoiceNumber) => {
            // Update state with actual invoice number
            setGeneratedInvoiceNumber(actualInvoiceNumber);
            setInvoiceNumberDate(todayStr);
          }).catch(console.error);
        } else {
          console.error('Failed to copy message on iOS');
        }
      } else {
        // For non-iOS, use async approach
        message = await generateOrderMessage(true);
        
        try {
          await navigator.clipboard.writeText(message);
          setCopied(true);
          setHasCopiedMessage(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (clipboardError) {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = message;
          textarea.style.position = 'fixed';
          textarea.style.left = '-999999px';
          textarea.style.top = '-999999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          
          if (successful) {
            setCopied(true);
            setHasCopiedMessage(true);
            setTimeout(() => setCopied(false), 2000);
          } else {
            console.error('Failed to copy message');
          }
        }
      }
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };
  
  // Synchronous version of generateOrderMessage that uses a provided invoice number
  const generateOrderMessageSync = async (invoiceNumber: string): Promise<string> => {
    // Build message lines (same logic as generateOrderMessage but without invoice generation)
    const lines: string[] = [];
    
    // Invoice number
    lines.push(`INVOICE # ${invoiceNumber}`);
    lines.push(''); // Break after invoice
    
    // Handle multiple accounts mode
    if (useMultipleAccounts && canUseMultipleAccounts) {
      // Group by game and variation
      const gameGroups = new Map<string, Array<{ variationName: string; items: CartItem[]; fields: Array<{ label: string, value: string }> }>>();
      
      itemsByGameAndVariation.forEach(({ gameId, gameName, variationId, variationName, items }) => {
        const firstItem = items[0];
        if (!firstItem.customFields) return;
        
        const fields = firstItem.customFields.map(field => {
          const valueKey = `${gameId}_${variationId}_${field.key}`;
          const value = customFieldValues[valueKey] || '';
          return value ? { label: field.label, value } : null;
        }).filter(Boolean) as Array<{ label: string, value: string }>;
        
        if (fields.length === 0) return;
        
        if (!gameGroups.has(gameName)) {
          gameGroups.set(gameName, []);
        }
        gameGroups.get(gameName)!.push({ variationName, items, fields });
      });
      
      // Build message for each game (game name mentioned once)
      gameGroups.forEach((variations, gameName) => {
        lines.push(`GAME: ${gameName}`);
        
        variations.forEach(({ variationName, items, fields }) => {
          // ID & SERVER or other fields
          if (fields.length === 1) {
            lines.push(`${fields[0].label}: ${fields[0].value}`);
          } else if (fields.length > 1) {
            // Combine fields with & if multiple
            const allValuesSame = fields.every(f => f.value === fields[0].value);
            if (allValuesSame) {
              const labels = fields.map(f => f.label);
              if (labels.length === 2) {
                lines.push(`${labels[0]} & ${labels[1]}: ${fields[0].value}`);
              } else {
                const allButLast = labels.slice(0, -1).join(', ');
                const lastLabel = labels[labels.length - 1];
                lines.push(`${allButLast} & ${lastLabel}: ${fields[0].value}`);
              }
            } else {
              // Different values, show each field separately
              fields.forEach(field => {
                lines.push(`${field.label}: ${field.value}`);
              });
            }
          }
          
          // Order items for this variation
          items.forEach(item => {
            const variationText = item.selectedVariation ? ` ${item.selectedVariation.name}` : '';
            const addOnsText = item.selectedAddOns && item.selectedAddOns.length > 0
              ? ` + ${item.selectedAddOns.map(a => a.name).join(', ')}`
              : '';
            lines.push(`ORDER: ${item.name}${variationText}${addOnsText} x${item.quantity} - ₱${item.totalPrice * item.quantity}`);
          });
        });
      });
    } else if (hasAnyCustomFields) {
      // Build game/order sections (single account or bulk mode)
      // Group games by their field values (for bulk input)
      const gamesByFieldValues = new Map<string, { games: string[], items: CartItem[], fields: Array<{ label: string, value: string }> }>();
      const itemsWithoutFields: CartItem[] = [];
      
      cartItems.forEach(cartItem => {
        const originalId = getOriginalMenuItemId(cartItem.id);
        const item = itemsWithCustomFields.find(i => getOriginalMenuItemId(i.id) === originalId);
        
        if (!item || !item.customFields || item.customFields.length === 0) {
          // Item without custom fields, handle separately
          itemsWithoutFields.push(cartItem);
          return;
        }
        
        const fields = item.customFields.map(field => {
          const valueKey = `${originalId}_${field.key}`;
          const value = customFieldValues[valueKey] || '';
          return value ? { label: field.label, value } : null;
        }).filter(Boolean) as Array<{ label: string, value: string }> || [];
        
        if (fields.length === 0) {
          // No field values, treat as item without fields
          itemsWithoutFields.push(cartItem);
          return;
        }
        
        // Create a key based on field values (to group games with same values)
        const valueKey = fields.map(f => `${f.label}:${f.value}`).join('|');
        
        if (!gamesByFieldValues.has(valueKey)) {
          gamesByFieldValues.set(valueKey, { games: [], items: [], fields });
        }
        const group = gamesByFieldValues.get(valueKey)!;
        if (!group.games.includes(item.name)) {
          group.games.push(item.name);
        }
        group.items.push(cartItem);
        group.fields = fields; // Use the fields from this item
      });
      
      // Build sections for each group
      gamesByFieldValues.forEach(({ games, items, fields }) => {
        // Game name (only once if multiple games share same fields)
        lines.push(`GAME: ${games.join(', ')}`);
        
        // ID & SERVER or other fields
        if (fields.length === 1) {
          lines.push(`${fields[0].label}: ${fields[0].value}`);
        } else if (fields.length > 1) {
          // Combine fields with & if multiple
          const allValuesSame = fields.every(f => f.value === fields[0].value);
          if (allValuesSame) {
            // All values same, combine labels with &
            const labels = fields.map(f => f.label);
            if (labels.length === 2) {
              lines.push(`${labels[0]} & ${labels[1]}: ${fields[0].value}`);
            } else {
              const allButLast = labels.slice(0, -1).join(', ');
              const lastLabel = labels[labels.length - 1];
              lines.push(`${allButLast} & ${lastLabel}: ${fields[0].value}`);
            }
          } else {
            // Different values, show each field separately
            const fieldPairs = fields.map(f => `${f.label}: ${f.value}`);
            lines.push(fieldPairs.join(', '));
          }
        }
        
        // Order items
        items.forEach(item => {
          let orderLine = `ORDER: ${item.selectedVariation?.name || item.name}`;
          if (item.quantity > 1) {
            orderLine += ` x${item.quantity}`;
          }
          orderLine += ` - ₱${item.totalPrice * item.quantity}`;
          lines.push(orderLine);
        });
      });
      
      // Handle items without custom fields
      if (itemsWithoutFields.length > 0) {
        const uniqueGames = [...new Set(itemsWithoutFields.map(item => item.name))];
        lines.push(`GAME: ${uniqueGames.join(', ')}`);
        
        itemsWithoutFields.forEach(item => {
          let orderLine = `ORDER: ${item.selectedVariation?.name || item.name}`;
          if (item.quantity > 1) {
            orderLine += ` x${item.quantity}`;
          }
          orderLine += ` - ₱${item.totalPrice * item.quantity}`;
          lines.push(orderLine);
        });
      }
    } else {
      // No custom fields, single account mode
      const uniqueGames = [...new Set(cartItems.map(item => item.name))];
      lines.push(`GAME: ${uniqueGames.join(', ')}`);
      
      // Default IGN field
      const ign = customFieldValues['default_ign'] || '';
      if (ign) {
        lines.push(`IGN: ${ign}`);
      }
      
      // Order items
      cartItems.forEach(item => {
        let orderLine = `ORDER: ${item.selectedVariation?.name || item.name}`;
        if (item.quantity > 1) {
          orderLine += ` x${item.quantity}`;
        }
        orderLine += ` - ₱${item.totalPrice * item.quantity}`;
        lines.push(orderLine);
      });
    }
    
    // Payment
    const paymentLine = `PAYMENT: ${selectedPaymentMethod?.name || ''}${selectedPaymentMethod?.account_name ? ` - ${selectedPaymentMethod.account_name}` : ''}`;
    lines.push(paymentLine);
    
    // Total
    lines.push(`TOTAL: ₱${totalPrice}`);
    lines.push(''); // Break before payment receipt
    
    // Payment Receipt
    lines.push('PAYMENT RECEIPT:');
    if (receiptImageUrl) {
      lines.push(receiptImageUrl);
    }
    
    return lines.join('\n');
  };

  const handleCopyAccountNumber = async (accountNumber: string) => {
    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      if (isIOS) {
        const textarea = document.createElement('textarea');
        textarea.value = accountNumber;
        textarea.style.position = 'fixed';
        textarea.style.left = '0';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, accountNumber.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          setCopiedAccountNumber(true);
          setTimeout(() => setCopiedAccountNumber(false), 2000);
        }
      } else {
        try {
          await navigator.clipboard.writeText(accountNumber);
          setCopiedAccountNumber(true);
          setTimeout(() => setCopiedAccountNumber(false), 2000);
        } catch (clipboardError) {
          const textarea = document.createElement('textarea');
          textarea.value = accountNumber;
          textarea.style.position = 'fixed';
          textarea.style.left = '-999999px';
          textarea.style.top = '-999999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (successful) {
            setCopiedAccountNumber(true);
            setTimeout(() => setCopiedAccountNumber(false), 2000);
          }
        }
      }
    } catch (error) {
      console.error('Failed to copy account number:', error);
    }
  };

  const handleCopyAccountName = async (accountName: string) => {
    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      if (isIOS) {
        const textarea = document.createElement('textarea');
        textarea.value = accountName;
        textarea.style.position = 'fixed';
        textarea.style.left = '0';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, accountName.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          setCopiedAccountName(true);
          setTimeout(() => setCopiedAccountName(false), 2000);
        }
      } else {
        try {
          await navigator.clipboard.writeText(accountName);
          setCopiedAccountName(true);
          setTimeout(() => setCopiedAccountName(false), 2000);
        } catch (clipboardError) {
          const textarea = document.createElement('textarea');
          textarea.value = accountName;
          textarea.style.position = 'fixed';
          textarea.style.left = '-999999px';
          textarea.style.top = '-999999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (successful) {
            setCopiedAccountName(true);
            setTimeout(() => setCopiedAccountName(false), 2000);
          }
        }
      }
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

  const getCustomerInfo = () => {
    let customerInfo: Record<string, string> | Array<{ game: string; package: string; fields: Record<string, string> }>;
    
    if (useMultipleAccounts && canUseMultipleAccounts) {
      // Multiple accounts mode: store as array
      const accountsData: Array<{ game: string; package: string; fields: Record<string, string> }> = [];
      
      itemsByGameAndVariation.forEach(({ gameId, gameName, variationId, variationName, items }) => {
        const firstItem = items[0];
        if (!firstItem.customFields) return;
        
        const fields: Record<string, string> = {};
        firstItem.customFields.forEach(field => {
          const valueKey = `${gameId}_${variationId}_${field.key}`;
          const value = customFieldValues[valueKey];
          if (value) {
            fields[field.label] = value;
          }
        });
        
        if (Object.keys(fields).length > 0) {
          accountsData.push({
            game: gameName,
            package: variationName,
            fields
          });
        }
      });
      
      customerInfo = accountsData.length > 0 ? accountsData : {};
    } else {
      // Single account mode: store as flat object
      const singleAccountInfo: Record<string, string> = {};
      
      // Add payment method
      if (selectedPaymentMethod) {
        singleAccountInfo['Payment Method'] = selectedPaymentMethod.name;
      }

      // Add custom fields
      if (hasAnyCustomFields) {
        itemsWithCustomFields.forEach((item) => {
          const originalId = getOriginalMenuItemId(item.id);
          item.customFields?.forEach(field => {
            const valueKey = `${originalId}_${field.key}`;
            const value = customFieldValues[valueKey];
            if (value) {
              singleAccountInfo[field.label] = value;
            }
          });
        });
      } else {
        // Default IGN field
        if (customFieldValues['default_ign']) {
          singleAccountInfo['IGN'] = customFieldValues['default_ign'];
        }
      }
      
      customerInfo = singleAccountInfo;
    }
    return customerInfo;
  };

  const handlePlaceOrder = async () => {
    if (!paymentMethod) {
      setReceiptError('Please select a payment method');
      return;
    }
    
    if (!receiptImageUrl) {
      setReceiptError('Please upload your payment receipt before placing the order');
      return;
    }

    // Save order to database if not already saved
    await saveOrderToDb();

    // Reuse the existing invoice number (don't generate a new one)
    // If no invoice number exists yet, it will generate one, but ideally Copy should be clicked first
    const orderDetails = await generateOrderMessage(false);
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
      const savedOrderId = await saveOrderToDb();

      if (savedOrderId) {
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
    if (!hasAnyCustomFields) {
      // Default IGN field
      return customFieldValues['default_ign']?.trim() || false;
    }
    
    // Multiple accounts mode
    if (useMultipleAccounts && canUseMultipleAccounts) {
      return itemsByGameAndVariation.every(({ gameId, variationId, items }) => {
        const firstItem = items[0];
        if (!firstItem.customFields) return true;
        
        return firstItem.customFields.every(field => {
          if (!field.required) return true;
          const valueKey = `${gameId}_${variationId}_${field.key}`;
          return customFieldValues[valueKey]?.trim() || false;
        });
      });
    }
    
    // Single account mode: Check all required fields for all items (use original menu item ID)
    return itemsWithCustomFields.every(item => {
      if (!item.customFields) return true;
      const originalId = getOriginalMenuItemId(item.id);
      return item.customFields.every(field => {
        if (!field.required) return true;
        const valueKey = `${originalId}_${field.key}`;
        return customFieldValues[valueKey]?.trim() || false;
      });
    });
  }, [hasAnyCustomFields, itemsWithCustomFields, customFieldValues, useMultipleAccounts, canUseMultipleAccounts, itemsByGameAndVariation]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-center mb-8 relative">
        <button
          onClick={onBack}
          className="flex items-center text-cafe-textMuted hover:text-cafe-primary transition-colors duration-200 absolute left-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-3xl font-semibold text-cafe-text">Top Up</h1>
      </div>

        <div className="space-y-6">
          {/* Customer Details Form */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-6 h-6 rounded-full bg-cafe-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                1
              </div>
              <h2 className="text-sm font-medium text-cafe-text">Customer Information</h2>
            </div>
            
            <form className="space-y-6">
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

              {/* Multiple Accounts Toggle */}
              {canUseMultipleAccounts && (
                <div className="mb-6 p-4 glass-strong border border-cafe-primary/30 rounded-lg">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useMultipleAccounts}
                      onChange={(e) => setUseMultipleAccounts(e.target.checked)}
                      className="w-5 h-5 text-cafe-primary border-cafe-primary/30 rounded focus:ring-cafe-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-cafe-text">Multiple Accounts</p>
                      <p className="text-xs text-cafe-textMuted">Enable if you need separate account information for different packages of the same game</p>
                    </div>
                  </label>
                </div>
              )}

              {/* Dynamic Custom Fields grouped by game */}
              {hasAnyCustomFields ? (
                useMultipleAccounts && canUseMultipleAccounts ? (
                  // Multiple accounts mode: show fields for each package
                  itemsByGameAndVariation.map(({ gameId, gameName, variationId, variationName, items }) => {
                    const firstItem = items[0];
                    if (!firstItem.customFields) return null;

                    return (
                      <div key={`${gameId}_${variationId}`} className="space-y-4 pb-6 border-b border-cafe-primary/20 last:border-b-0 last:pb-0">
                        <div className="mb-4 flex items-center gap-4">
                          {/* Game Icon */}
                          <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg">
                            {firstItem.image ? (
                              <img
                                src={firstItem.image}
                                alt={gameName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`absolute inset-0 flex items-center justify-center ${firstItem.image ? 'hidden' : ''}`}>
                              <div className="text-4xl opacity-20 text-gray-400">🎮</div>
                            </div>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-cafe-text">{gameName}</h3>
                            <p className="text-sm text-cafe-textMuted">{variationName}</p>
                          </div>
                        </div>
                        {firstItem.customFields.map((field) => {
                          const valueKey = `${gameId}_${variationId}_${field.key}`;
                          return (
                            <div key={field.key}>
                              <label className="block text-sm font-medium text-cafe-text mb-2">
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                              </label>
                              <input
                                type="text"
                                value={customFieldValues[valueKey] || ''}
                                onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [valueKey]: e.target.value }))}
                                className="w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted"
                                placeholder={field.placeholder || field.label}
                                required={field.required}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  // Single account mode: show fields grouped by game
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
                              className="w-full px-4 py-3 glass border border-cafe-primary/30 rounded-lg focus:ring-2 focus:ring-cafe-primary focus:border-cafe-primary transition-all duration-200 text-cafe-text placeholder-cafe-textMuted"
                              placeholder={field.placeholder || field.label}
                              required={field.required}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))
                )
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

            </form>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-cafe-primary/30 my-6"></div>

        {/* Payment Section */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-6 h-6 rounded-full bg-cafe-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              2
            </div>
            <h2 className="text-sm font-medium text-cafe-text">Choose Payment Method</h2>
          </div>
          
          <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => {
                  setPaymentMethod(method.id as PaymentMethod);
                  setShowPaymentDetailsModal(true);
                }}
                className={`p-2 rounded-lg border-2 transition-all duration-200 flex flex-col items-center justify-center gap-0 ${
                  paymentMethod === method.id
                    ? 'border-transparent text-white'
                    : 'glass border-cafe-primary/30 text-cafe-text hover:border-cafe-primary hover:glass-strong'
                }`}
                style={paymentMethod === method.id ? { backgroundColor: '#1E7ACB' } : {}}
              >
                {/* Icon on Top */}
                <div className="relative w-8 h-8 md:w-14 md:h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-cafe-darkCard to-cafe-darkBg flex items-center justify-center p-0">
                  <span className="text-base md:text-2xl">💳</span>
                </div>
                {/* Text Below */}
                <span className="font-medium text-xs text-center">{method.name}</span>
              </button>
            ))}
          </div>


          {/* Receipt Upload Section */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-cafe-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                3
              </div>
              <label className="text-sm font-medium text-cafe-text">
                Payment Receipt <span className="text-red-400">*</span>
              </label>
            </div>
            
            {!receiptPreview ? (
              <div className="relative glass border-2 border-dashed border-cafe-primary/30 rounded-lg p-6 text-center hover:border-cafe-primary transition-colors duration-200">
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

            <p className="text-xs text-cafe-textMuted text-center mt-3">
              Please upload a screenshot of your payment receipt. This helps us verify and process your order quickly.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-cafe-primary/30 my-6"></div>

      {/* Place Order Section */}
      <div>
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
                  4
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
                  5
                </div>
                {uploadingReceipt ? 'Uploading Receipt...' : 'Order via Messenger'}
              </button>
              
              <p className="text-xs text-cafe-textMuted text-center mt-3">
                You'll be redirected to Facebook Messenger to confirm your order. Your receipt has been uploaded and will be included in the message.
              </p>
            </>
          ) : (
            <>
              {/* Place Order button - for place_order option */}
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
                  4
                </div>
                {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Payment Details Modal */}
      {showPaymentDetailsModal && selectedPaymentMethod && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-semibold text-cafe-text">Payment Details</h3>
              <button
                onClick={() => setShowPaymentDetailsModal(false)}
                className="p-2 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200"
              >
                <X className="h-5 w-5 text-cafe-text" />
              </button>
            </div>

            <p className="text-xs text-cafe-textMuted mb-6">
              Press the copy button to copy the number or download the QR code, make a payment, then proceed to upload your receipt.
            </p>

            <div className="space-y-4">
              {/* Payment Method Name and Amount */}
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-cafe-text">{selectedPaymentMethod.name}</p>
                <p className="text-xl font-semibold text-white">₱{totalPrice}</p>
              </div>
              
              {/* Account Number and Account Name in one row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Account Number with Copy Button */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm text-cafe-textMuted">Number:</p>
                    <button
                      onClick={() => handleCopyAccountNumber(selectedPaymentMethod.account_number)}
                      className="p-1.5 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 flex-shrink-0"
                      title="Copy account number"
                    >
                      {copiedAccountNumber ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-cafe-text" />
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-cafe-text font-medium text-sm">{selectedPaymentMethod.account_number}</p>
                </div>
                
                {/* Account Name with Copy Button */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm text-cafe-textMuted">Name:</p>
                    <button
                      onClick={() => handleCopyAccountName(selectedPaymentMethod.account_name)}
                      className="p-1.5 glass-strong rounded-lg hover:bg-cafe-primary/20 transition-colors duration-200 flex-shrink-0"
                      title="Copy account name"
                    >
                      {copiedAccountName ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-cafe-text" />
                      )}
                    </button>
                  </div>
                  <p className="text-cafe-text font-medium text-sm">{selectedPaymentMethod.account_name}</p>
                </div>
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
            </div>
          </div>
        </div>
      )}

      {/* Order Status Modal */}
      <OrderStatusModal
        orderId={orderId}
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        onSucceededClose={onNavigateToMenu}
      />
    </div>
  );
};

export default Checkout;