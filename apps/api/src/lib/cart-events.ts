export const CART_UPDATED_EVENT = 'degems:cart-updated';

export function publishCartUpdate(itemCount: number) {
  window.dispatchEvent(new CustomEvent<number>(CART_UPDATED_EVENT, { detail: itemCount }));
}
