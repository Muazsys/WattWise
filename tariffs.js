/* WattWise tariff data. THIS IS THE ONE FILE TO UPDATE when tariffs change.
   official:true = taken from a K-Electric / NEPRA publication; official:false = estimate. */
export const TARIFF = {
  version: "tariffs-2026-10",
  label: "Tariffs as of October 2026",
  utility: "K-Electric residential (protected and unprotected)",
  asOf: "K-Electric residential tariff schedule (SRO 279(I)/2026), NEPRA quarterly adjustment of PKR 0.5194/kWh (SRO 1501(I)/2026, September to November 2026 bills) and fuel adjustment of PKR 1.1086/kWh.",
  /* Unprotected: all units are billed at the rate of the one slab they fall in (not step by step). rate = base energy rate; QTA and FCA are added below. fixed = PKR per kW of sanctioned load per month. muct = municipal charge. */
  slabs: [
    { upto: 100, rate: 22.44, fixed: 275, muct: 0 },
    { upto: 200, rate: 28.91, fixed: 300, muct: 20 },
    { upto: 300, rate: 33.10, fixed: 350, muct: 40 },
    { upto: 400, rate: 36.46, fixed: 400, muct: 100 },
    { upto: 500, rate: 38.95, fixed: 500, muct: 125 },
    { upto: 600, rate: 40.22, fixed: 675, muct: 150 },
    { upto: 700, rate: 41.85, fixed: 675, muct: 175 },
    { upto: null, rate: 47.20, fixed: 675, muct: 300 },
  ],
  /* Protected: only while usage is 200 units or less every month for 6 months. Above 200 units the unprotected slabs apply. Lifeline slabs are not modeled. */
  protectedSlabs: [
    { upto: 100, rate: 10.54, fixed: 200, muct: 0 },
    { upto: 200, rate: 13.01, fixed: 300, muct: 20 },
  ],
  fca: 1.1086, qta: 0.5194, phlProtected: 0.43, dutyPct: 0.015, gstPct: 0.18, tvFee: 0, phl: 3.23, nonFilerTaxPct: 0.075, nonFilerTaxFrom: 25000,
  peakSunHours: 5.3, exportRate: 8.13, concurrenceFeePerKW: 1000,
  /* Net-metered customers on a peak/off-peak meter (rates read from a real 2026 K-Electric bill). */
  netMetered: { offPeak: 34.53, peak: 46.85, fixedPerKW: 675, creditRate: 22.44 },
  /* Credit per exported unit: legacy net metering (read from a 2026 bill) and the new net-billing regime (NEPRA purchase price, Apr to Jun 2026). Customers can edit it. */
  exportCredit: { legacy: 22.44, newRegime: 8.13 },
  items: [
    { label: "Slab rates and fixed charges", official: true, note: "K-Electric schedule, SRO 279(I)/2026" },
    { label: "Quarterly adjustment PKR 0.5194/kWh", official: true, note: "NEPRA SRO 1501(I)/2026" },
    { label: "Fuel adjustment PKR 1.1086/kWh", official: true, note: "Changes monthly" },
    { label: "GST 18%, TV fee PKR 35, 7.5% advance tax for non-filers on bills of PKR 25,000 and above", official: true, note: "K-Electric" },
    { label: "Net-billing export credit PKR 8.13/kWh", official: true, note: "NEPRA national average purchase price, April to June 2026; reset every quarter" },
    { label: "Municipal charge, electricity duty 2%, PKR 1,000/kW concurrence fee", official: false, note: "Estimate" },
    { label: "Equipment cost, battery cost, 5.3 peak sun hours", official: false, note: "Estimate" },
  ],
};
