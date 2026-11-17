// Server-side validation. The checkout page runs the same rules, but only these are trusted.
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export type Customer = {
  name: string; email: string; mobile: string;
  house: string; street: string; city: string; state: string; pinCode: string; country: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max + 1) : '');

/** Accepts 98765 43210, +91 98765-43210, 098765 43210; returns the 10 digits or '' */
export function normaliseMobile(v: unknown): string {
  if (typeof v !== 'string') return '';
  let d = v.replace(/[\s\-()]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9][0-9]{9}$/.test(d) ? d : '';
}

export function validateCustomer(input: Record<string, unknown>): { ok: true; customer: Customer } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = clean(input.name, 80);
  const email = clean(input.email, 120).toLowerCase();
  const mobile = normaliseMobile(input.mobile);
  const house = clean(input.house, 100);
  const street = clean(input.street, 160);
  const city = clean(input.city, 60);
  const state = clean(input.state, 60);
  const pinCode = clean(input.pinCode, 6).replace(/\s/g, '');
  const country = clean(input.country, 40) || 'India';

  if (name.length < 2 || name.length > 80 || !/[A-Za-zÀ-ɏऀ-ॿ]/.test(name)) errors.name = 'Enter your full name.';
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Enter a valid email address.';
  if (!mobile) errors.mobile = 'Enter a valid 10-digit Indian mobile number.';
  if (!house || house.length > 100) errors.house = 'Enter your house or flat number.';
  if (street.length < 3 || street.length > 160) errors.street = 'Enter your street or locality.';
  if (city.length < 2 || city.length > 60) errors.city = 'Enter your city.';
  if (!INDIAN_STATES.includes(state)) errors.state = 'Choose your state.';
  if (!/^[1-9][0-9]{5}$/.test(pinCode)) errors.pinCode = 'Enter a valid 6-digit PIN code.';
  if (country !== 'India') errors.country = 'We currently deliver within India only.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, customer: { name, email, mobile, house, street, city, state, pinCode, country } };
}

export function formatAddress(c: Customer): string {
  return `${c.house}, ${c.street}, ${c.city}, ${c.state} ${c.pinCode}, ${c.country}`;
}
