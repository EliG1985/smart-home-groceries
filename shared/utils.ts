// Shared utility functions for SmartHome Groceries

export function formatCurrency(amount: number, currency: string = '₪'): string {
  return `${currency}${amount.toFixed(2)}`;
}

export function daysUntil(date: string): number {
  const now = new Date();
  const target = new Date(date);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
