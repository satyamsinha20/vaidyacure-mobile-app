/**
 * All money is stored as whole paise (integers) so splits and refunds never
 * suffer from floating point rounding. Rupee values only exist at the edges
 * (admin input and the numbers shown in apps).
 */
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

export const paiseToRupees = (paise: number): number => Math.round(paise) / 100;

/** "₹550" or "₹148.50" */
export const formatInr = (paise: number): string => {
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

export interface PriceBreakdown {
  feePaise: number;
  commissionPaise: number;
  totalPaise: number;
}

export const FREE_PRICE: PriceBreakdown = { feePaise: 0, commissionPaise: 0, totalPaise: 0 };

/**
 * App price of a real doctor: the doctor's fee plus the platform commission on
 * top (₹500 fee + 10% = ₹550). The doctor receives the full fee.
 */
export const priceForFee = (feeRupees: number, commissionPercent: number): PriceBreakdown => {
  const feePaise = rupeesToPaise(feeRupees);
  const commissionPaise = Math.round((feePaise * commissionPercent) / 100);
  return { feePaise, commissionPaise, totalPaise: feePaise + commissionPaise };
};

export interface NoShowSplit {
  refundPaise: number;
  keptPaise: number;
  adminPaise: number;
  doctorPaise: number;
}

/**
 * Patient did not join: `keepPercent` of what they paid is kept (the rest is
 * refunded). Of the kept amount the platform keeps `adminSharePercent` and the
 * doctor gets the remainder. ₹550 → ₹385 refund, ₹16.50 admin, ₹148.50 doctor.
 */
export const patientNoShowSplit = (totalPaise: number, keepPercent: number, adminSharePercent: number): NoShowSplit => {
  const keptPaise = Math.round((totalPaise * keepPercent) / 100);
  const adminPaise = Math.round((keptPaise * adminSharePercent) / 100);
  return { refundPaise: totalPaise - keptPaise, keptPaise, adminPaise, doctorPaise: keptPaise - adminPaise };
};
