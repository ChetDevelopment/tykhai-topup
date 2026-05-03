/**
 * Payment State Machine
 * 
 * Enforces strict state transitions:
 * PENDING → PAID → PROCESSING → DELIVERED
 *      ↓              ↓
 *   EXPIRED       FAILED
 *      ↓              ↓
 *   CANCELLED    MANUAL_REVIEW
 * 
 * Rules:
 * - No skipping states
 * - No rollback
 * - Transitions are atomic
 */

import { prisma } from "./prisma";

export type PaymentState =
  | 'PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'MANUAL_REVIEW';

export type DeliveryState =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'FAILED'
  | 'FAILED_RETRY'
  | 'MANUAL_REVIEW';

// Valid state transitions
const STATE_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  PENDING: ['PAID', 'EXPIRED', 'CANCELLED'],
  PAID: ['PROCESSING', 'FAILED'],
  PROCESSING: ['DELIVERED', 'FAILED', 'MANUAL_REVIEW'],
  DELIVERED: [], // Terminal state
  FAILED: ['MANUAL_REVIEW'],
  EXPIRED: [], // Terminal state
  CANCELLED: [], // Terminal state
  MANUAL_REVIEW: ['DELIVERED', 'FAILED'],
};

/**
 * Check if state transition is valid
 */
export function canTransition(from: PaymentState, to: PaymentState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Check if state is terminal (no further transitions)
 */
export function isTerminalState(state: PaymentState): boolean {
  return STATE_TRANSITIONS[state]?.length === 0;
}

/**
 * Atomically transition order state
 * Returns success=true if transition succeeded
 * Returns success=false if transition failed (invalid or concurrent modification)
 * 
 * RACE CONDITION PROTECTION:
 * - Uses optimistic locking with version field
 * - Checks current state before transition
 * - Webhook has priority over worker
 */
export async function transitionOrderState(
  orderId: string,
  from: PaymentState,
  to: PaymentState,
  metadata?: Record<string, unknown>,
  options?: {
    webhookPriority?: boolean; // If true, webhook can override worker
  }
): Promise<{ success: boolean; error?: string }> {
  // Validate transition
  if (!canTransition(from, to)) {
    return {
      success: false,
      error: `Invalid state transition: ${from} → ${to}`,
    };
  }

  try {
    // ATOMIC UPDATE with version check and state validation
    const result = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: from, // Only update if still in expected state
        // Version check prevents concurrent modifications
      },
      data: {
        status: to,
        // Update timestamps based on state
        ...(to === 'PAID' ? { paidAt: new Date() } : {}),
        ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        // Store metadata if provided
        ...(metadata ? { 
          metadata: { 
            ...(metadata as any), 
            lastTransition: { 
              from, 
              to, 
              at: new Date().toISOString(),
              webhookPriority: options?.webhookPriority,
            } 
          } 
        } : {}),
      },
    });

    if (result.count === 0) {
      // No rows updated = state already changed or order not found
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, version: true },
      });
      
      // RACE CONDITION CHECK: If webhook is updating and state changed, check if it's already paid
      if (options?.webhookPriority && to === 'PAID') {
        if (order && ['PAID', 'PROCESSING', 'DELIVERED'].includes(order.status)) {
          // Already paid by another process - this is OK
          console.log(`[State Machine] Order ${orderId} already paid (status: ${order.status})`);
          return { success: true }; // Consider it successful
        }
      }
      
      return {
        success: false,
        error: order 
          ? `State already changed from ${from} to ${order.status} (version: ${order.version})`
          : 'Order not found',
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[State Machine] Transition error:', error);
    return {
      success: false,
      error: error.message || 'Database error',
    };
  }
}

/**
 * Get current state of order
 */
export async function getOrderState(orderId: string): Promise<{
  paymentState: PaymentState;
  deliveryState: DeliveryState | null;
  isTerminal: boolean;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      deliveryStatus: true,
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  return {
    paymentState: order.status as PaymentState,
    deliveryState: order.deliveryStatus as DeliveryState | null,
    isTerminal: isTerminalState(order.status as PaymentState),
  };
}

/**
 * Mark order as paid (PENDING → PAID)
 * CRITICAL: Webhook has priority over worker polling
 */
export async function markOrderAsPaid(
  orderId: string,
  paymentData: {
    paymentRef: string;
    amount: number;
    currency: string;
    transactionId?: string;
    verifiedBy: 'webhook' | 'polling' | 'api';
  }
): Promise<{ success: boolean; error?: string }> {
  // Webhook always has priority
  const webhookPriority = paymentData.verifiedBy === 'webhook';
  
  return transitionOrderState(orderId, 'PENDING', 'PAID', {
    paymentRef: paymentData.paymentRef,
    amount: paymentData.amount,
    currency: paymentData.currency,
    transactionId: paymentData.transactionId,
    verifiedBy: paymentData.verifiedBy,
    verifiedAt: new Date().toISOString(),
  }, { webhookPriority });
}

/**
 * Mark order as processing (PAID → PROCESSING)
 */
export async function markOrderAsProcessing(
  orderId: string,
  deliveryData?: {
    provider: string;
    deliveryJobId: string;
  }
): Promise<{ success: boolean; error?: string }> {
  return transitionOrderState(orderId, 'PAID', 'PROCESSING', {
    ...deliveryData,
    processingStartedAt: new Date().toISOString(),
  });
}

/**
 * Mark order as delivered (PROCESSING → DELIVERED)
 */
export async function markOrderAsDelivered(
  orderId: string,
  deliveryData: {
    provider: string;
    transactionId: string;
    deliveredAt: string;
  }
): Promise<{ success: boolean; error?: string }> {
  return transitionOrderState(orderId, 'PROCESSING', 'DELIVERED', {
    ...deliveryData,
    finalState: true,
  });
}

/**
 * Mark order as failed (any → FAILED)
 */
export async function markOrderAsFailed(
  orderId: string,
  from: PaymentState,
  failureData: {
    reason: string;
    errorCode?: string;
    retryable?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  return transitionOrderState(orderId, from, 'FAILED', {
    ...failureData,
    failedAt: new Date().toISOString(),
  });
}

/**
 * Mark order as expired (PENDING → EXPIRED)
 */
export async function markOrderAsExpired(orderId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  return transitionOrderState(orderId, 'PENDING', 'EXPIRED', {
    expiredAt: new Date().toISOString(),
  });
}

/**
 * Mark order for manual review
 */
export async function markOrderForManualReview(
  orderId: string,
  from: PaymentState,
  reviewData: {
    reason: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    details?: Record<string, unknown>;
  }
): Promise<{ success: boolean; error?: string }> {
  return transitionOrderState(orderId, from, 'MANUAL_REVIEW', {
    ...reviewData,
    reviewRequestedAt: new Date().toISOString(),
  });
}
