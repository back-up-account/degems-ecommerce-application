export function createProductSlug(name: string, sku: string) {
  const slugBase = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'product';
  return `${slugBase}-${sku.toLowerCase()}`;
}
