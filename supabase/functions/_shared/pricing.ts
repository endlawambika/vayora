// All money is handled in paise (integers) on the server. The browser's numbers are display only.
import type { Config } from './config.ts';

export type Amounts = {
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
};

export function computeAmounts(quantity: number, c: Config): Amounts {
  const unitPricePaise = Math.round(c.unitPriceInr * 100);
  const subtotalPaise = unitPricePaise * quantity;
  const shippingPaise = Math.round(c.shippingFeeInr * 100);
  const taxPaise = Math.round((subtotalPaise * c.taxRatePercent) / 100);
  return { quantity, unitPricePaise, subtotalPaise, shippingPaise, taxPaise, totalPaise: subtotalPaise + shippingPaise + taxPaise, currency: c.currency };
}

/** ₹4,999 or ₹4,999.50 */
export function formatInr(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}
