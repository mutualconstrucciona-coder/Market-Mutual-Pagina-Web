export const ONLINE_STOCK_THRESHOLD = 3

export function hasOnlineStock(stock: number | null | undefined) {
  return typeof stock === 'number' && stock > ONLINE_STOCK_THRESHOLD
}
