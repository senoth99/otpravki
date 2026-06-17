import type { ShippingOrder } from "@/types/shipping";

interface OrderCommentsProps {
  order: Pick<ShippingOrder, "customerComment" | "staffComments">;
}

export function OrderComments({ order }: OrderCommentsProps) {
  const customerComment = order.customerComment?.trim();
  const staffComments = Array.isArray(order.staffComments)
    ? order.staffComments.filter((comment) => comment.body.trim())
    : [];

  if (!customerComment && staffComments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {customerComment && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 sm:px-4">
          <p className="text-xs font-medium text-amber-900">Комментарий клиента</p>
          <p className="mt-1 text-sm text-amber-950">{customerComment}</p>
        </div>
      )}

      {staffComments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 sm:px-4">
          <p className="text-xs font-medium text-gray-700">
            {staffComments.length === 1 ? "Внутренний комментарий" : "Внутренние комментарии"}
          </p>
          <ul className="mt-2 space-y-2">
            {staffComments.map((comment) => (
              <li key={comment.id} className="text-sm text-gray-800">
                <p>{comment.body}</p>
                {comment.authorName && (
                  <p className="mt-0.5 text-xs text-gray-500">{comment.authorName}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
