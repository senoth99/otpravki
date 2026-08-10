interface OrderNumberDisplayProps {
  orderNumber: string;
  className?: string;
  /** @deprecated no longer used — kept for call-site compatibility */
  prefixClassName?: string;
  /** @deprecated no longer used — kept for call-site compatibility */
  last4ClassName?: string;
}

/** Полный номер заказа одним размером. */
export function OrderNumberDisplay({
  orderNumber,
  className = "",
}: OrderNumberDisplayProps) {
  return <span className={className.trim() || undefined}>{orderNumber}</span>;
}
