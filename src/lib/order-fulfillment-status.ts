export const fulfillmentTransitions = {
  confirmed: { next: 'processing', label: 'Start processing' },
  processing: { next: 'ready_for_dispatch', label: 'Mark ready for dispatch' },
  ready_for_dispatch: { next: 'shipped', label: 'Mark shipped' },
  shipped: { next: 'delivered', label: 'Mark delivered' },
} as const;

export type FulfillmentTargetStatus =
  (typeof fulfillmentTransitions)[keyof typeof fulfillmentTransitions]['next'];

export function isFulfillmentStatus(status: string): status is keyof typeof fulfillmentTransitions {
  return Object.hasOwn(fulfillmentTransitions, status);
}

export function getFulfillmentAction(status: string) {
  return isFulfillmentStatus(status) ? fulfillmentTransitions[status] : null;
}
