import { formatCurrency } from '../../utils/helpers';

const Row = ({ label, value, bold }) => (
  <div className={`flex justify-between text-sm ${bold ? 'font-bold text-base pt-2 border-t' : ''}`}>
    <span className="text-gray-600 dark:text-gray-400">{label}</span>
    <span className={bold ? 'text-primary-600' : 'font-medium text-gray-900 dark:text-white'}>{value}</span>
  </div>
);

// Server-computed breakdown display. Never computed from client totals.
const FareBreakdown = ({ breakdown }) => {
  if (!breakdown) return null;
  return (
    <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4 space-y-2 border border-primary-200 dark:border-primary-800">
      <Row label={`Base (${breakdown.billableHours}h × ${formatCurrency(breakdown.pricePerHour)})`} value={formatCurrency(breakdown.baseAmount)} />
      {breakdown.overdueCharge > 0 && (
        <Row label={`Overdue (${breakdown.overdueHours}h extra)`} value={formatCurrency(breakdown.overdueCharge)} />
      )}
      <Row label="Subtotal" value={formatCurrency(breakdown.subtotal)} />
      {breakdown.taxAmount > 0 && (
        <Row label={`Tax (${breakdown.taxPercent}%)`} value={formatCurrency(breakdown.taxAmount)} />
      )}
      {breakdown.serviceFee > 0 && <Row label="Service fee" value={formatCurrency(breakdown.serviceFee)} />}
      <Row label="Total payable" value={formatCurrency(breakdown.totalAmount)} bold />
      <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-1">
        Calculated on the server in test mode. The checkout amount cannot be changed from this screen.
      </p>
    </div>
  );
};

export default FareBreakdown;
