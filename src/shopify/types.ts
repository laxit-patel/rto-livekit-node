export interface ShopifyOrderContext {
  orderId: string;
  orderName: string; // e.g., "#1001"
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
  language: 'hi-IN' | 'gu-IN' | 'ta-IN' | 'te-IN'; // Language preference
  previousAttempts: RTOAttempt[];
  attemptNumber: number;
  failureReason?: string; // Last failure reason if available
  createdAt: string;
  updatedAt: string;
}

export interface RTOAttempt {
  timestamp: string;
  reason?: string; // Customer's stated reason
  language: string;
  agentId: string;
  callDurationSeconds?: number;
  nextAttemptDate?: string;
  status: 'pending' | 'completed' | 'no_answer' | 'wrong_number';
}

export interface RedeliverySlot {
  dateTime: string;
  timezone: string;
  available: boolean;
}

export interface RTOMetafield {
  namespace: 'rto';
  key: 'attempts' | 'currentAttempt' | 'redeliveryScheduled';
  value: RTOAttempt[] | RTOAttempt | string;
  type: 'json' | 'string';
}

export interface ShopifyWebhookPayload {
  id: string;
  order_id: string;
  fulfillment_orders: Array<{
    id: string;
    status: string;
    fulfillment_status: string;
    line_items: Array<{
      id: string;
      quantity: number;
    }>;
  }>;
}
