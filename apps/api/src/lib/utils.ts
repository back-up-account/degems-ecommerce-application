export function formatNairaFromKobo(valueInKobo: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(valueInKobo / 100);
}
