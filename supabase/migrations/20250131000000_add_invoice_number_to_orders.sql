-- Add invoice_number column to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Create index for faster lookups by invoice number
CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders(invoice_number);

-- Add comment
COMMENT ON COLUMN orders.invoice_number IS 'Invoice number in format AKGXT1M{day}D{orderNumber} (e.g., AKGXT1M17D1)';
