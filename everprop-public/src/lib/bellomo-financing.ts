// Commercial conditions transcribed from Financiación Bellomo.docx (2026-09-08).
// Fixed interest on initial financed capital confirmed by the commercial team (2026-09-08).
export type FinancingPlan = {
  name: string;
  stage: 'preventa' | 'venta' | 'alquiler';
  minimum: { ars: number } | { percent: number };
  fixed: { max: number; rate: number }[];
  cacMax?: number;
  reserve: string;
  stepped?: boolean;
  rentalYears?: number[];
};
const standard = [{ max: 12, rate: 3.5 }, { max: 48, rate: 4 }];
const shorter = [{ max: 12, rate: 3.5 }, { max: 36, rate: 4 }];
const shortSale = [{ max: 6, rate: 5 }, { max: 18, rate: 6 }];
const commission = 'Comisión de bienes (entrega mínima)';
export const FINANCING_PLANS: FinancingPlan[] = [
  { name: 'El Rocío', stage: 'preventa', minimum: { ars: 1500000 }, fixed: [{ max: 48, rate: 4 }], cacMax: 48, reserve: commission },
  { name: 'San Pablo 1', stage: 'preventa', minimum: { percent: 30 }, fixed: shorter, cacMax: 48, reserve: '10% del precio' },
  { name: 'San Pablo 2', stage: 'preventa', minimum: { percent: 10 }, fixed: standard, cacMax: 48, reserve: commission },
  { name: 'Santa Emilia', stage: 'preventa', minimum: { ars: 1500000 }, fixed: standard, cacMax: 48, reserve: commission },
  { name: 'Valle Verde', stage: 'preventa', minimum: { percent: 10 }, fixed: standard, cacMax: 48, reserve: 'ARS 1.500.000' },
  { name: 'Cardinales', stage: 'preventa', minimum: { ars: 1500000 }, fixed: standard, cacMax: 48, reserve: commission },
  { name: 'La Arbolada 2', stage: 'preventa', minimum: { percent: 20 }, fixed: shorter, cacMax: 48, reserve: 'ARS 1.500.000' },
  { name: 'Los Arenales', stage: 'preventa', minimum: { percent: 50 }, fixed: shortSale, reserve: 'ARS 1.500.000' },
  { name: 'El Arrabal', stage: 'preventa', minimum: { ars: 1500000 }, fixed: standard, cacMax: 48, reserve: commission },
  { name: 'Las Colinas 2', stage: 'preventa', minimum: { percent: 10 }, fixed: [{ max: 72, rate: 4 }], reserve: 'ARS 1.500.000', stepped: true },
  { name: 'La Arbolada', stage: 'venta', minimum: { percent: 35 }, fixed: shorter, cacMax: 48, reserve: '7% del precio' },
  { name: 'Los Perales', stage: 'venta', minimum: { percent: 50 }, fixed: shortSale, reserve: 'ARS 1.500.000' },
  { name: 'Galería Norte 1, Chijra', stage: 'alquiler', minimum: { percent: 0 }, fixed: [], reserve: 'Un mes de comisión y un mes de alquiler', rentalYears: [1, 2] },
  { name: 'Galería Norte 2, Chijra', stage: 'alquiler', minimum: { percent: 0 }, fixed: [], reserve: 'Un mes de comisión y un mes de alquiler', rentalYears: [1, 2] },
  { name: 'Locales comerciales en alquiler', stage: 'alquiler', minimum: { percent: 0 }, fixed: [], reserve: 'Un mes de comisión y un mes de alquiler', rentalYears: [1] },
];
export function findFinancingPlan(name?: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return FINANCING_PLANS.find(plan => normalize(plan.name) === normalize(name ?? ''));
}
export function financingSummary(plan: FinancingPlan, price: number, discount: boolean, currency: 'ARS' | 'USD', exchange: number, advance?: number) {
  if (!Number.isFinite(price) || price <= 0) return null;
  const discountAmount = discount ? price * 0.1 : 0;
  const net = price - discountAmount;
  const minimum = 'percent' in plan.minimum ? net * plan.minimum.percent / 100
    : currency === 'ARS' ? plan.minimum.ars
    : Number.isFinite(exchange) && exchange > 0 ? plan.minimum.ars / exchange : null;
  const initial = advance ?? minimum;
  const valid = minimum !== null && initial !== null && Number.isFinite(initial) && initial >= minimum && initial <= net;
  return { net, discountAmount, minimum, initial, valid, balance: valid ? net - initial! : null };
}
export function cacPayment(balance: number, months: number, baseIndex: number, dueIndex: number) {
  if (![balance, months, baseIndex, dueIndex].every(Number.isFinite) || balance < 0 || !Number.isInteger(months) || months < 1 || baseIndex <= 0 || dueIndex <= 0) return null;
  const result = balance / months * dueIndex / baseIndex;
  return Number.isFinite(result) ? result : null;
}

export function fixedPayment(balance: number, months: number, monthlyPercent: number) {
  if (![balance, months, monthlyPercent].every(Number.isFinite) || balance < 0 || !Number.isInteger(months) || months < 1 || monthlyPercent < 0) return null;
  const monthlyInterest = balance * monthlyPercent / 100;
  const monthly = balance / months + monthlyInterest;
  const interest = monthlyInterest * months;
  const total = balance + interest;
  return [monthly, interest, total].every(Number.isFinite) ? { monthly, interest, total } : null;
}