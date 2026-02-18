export interface KPIsTableRow {
  label: string;
  current: string | number;
  previous: string | number;
  percent: number;
}

const DEFAULT_PERIOD_OPTIONS = [
  { value: 'Last 7 Days', label: 'Last 7 Days' },
  { value: 'Last 30 Days', label: 'Last 30 Days' },
  { value: 'Last 90 Days', label: 'Last 90 Days' },
];

const DEFAULT_COMPARISON_OPTIONS = [
  { value: 'vs. Last Year', label: 'Last Year' },
  { value: 'vs. Previous Period', label: 'Previous Period' },
];

export interface KPIsTableCardProps {
  rows: KPIsTableRow[];
  title?: string;
  currentPeriodLabel?: string;
  comparisonPeriodLabel?: string;
  period?: string;
  comparison?: string;
  onPeriodChange?: (value: string) => void;
  onComparisonChange?: (value: string) => void;
  periodOptions?: { value: string; label: string }[];
  comparisonOptions?: { value: string; label: string }[];
}

function formatCell(value: string | number): string {
  return typeof value === 'number'
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
}

const cardSelectClass = 'border-0 rounded-lg px-2 py-1 text-xs font-medium text-primary bg-white focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer';

export const KPIsTableCard = ({
  rows,
  title = 'KPIs',
  currentPeriodLabel = 'Last 30 Days',
  comparisonPeriodLabel = 'Last Year',
  period = 'Last 30 Days',
  comparison = 'vs. Last Year',
  onPeriodChange,
  onComparisonChange,
  periodOptions = DEFAULT_PERIOD_OPTIONS,
  comparisonOptions = DEFAULT_COMPARISON_OPTIONS,
}: KPIsTableCardProps) => {
  return (
    <div className="flex flex-col h-full">
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex flex-col md:flex-row items-center justify-center md:justify-between flex-wrap gap-2">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">{title}</h3>
        {onPeriodChange != null && onComparisonChange != null && (
          <div className="flex items-center gap-2 flex-wrap md:ml-auto justify-center">
            <select
              value={period}
              onChange={(e) => onPeriodChange(e.target.value)}
              className={cardSelectClass}
              aria-label="Period"
            >
              {periodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-white text-xs font-medium shrink-0">vs</span>
            <select
              value={comparison}
              onChange={(e) => onComparisonChange(e.target.value)}
              className={cardSelectClass}
              aria-label="Comparison"
            >
              {comparisonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="px-5 pb-5 flex-1 overflow-x-auto pt-5">
        <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
          <thead>
            <tr className="text-left text-xs md:text-sm 2xl:text-base text-secondary border-b border-gray-200">
              <th className="pb-3 pr-4 pl-2 font-semibold" />
              <th className="pb-3 pr-4 font-semibold text-right">{currentPeriodLabel}</th>
              <th className="pb-3 pr-4 font-semibold text-right">{comparisonPeriodLabel}</th>
              <th className="pb-3 pr-2 font-semibold text-right">Percentage (%)</th>
            </tr>
          </thead>
          <tbody className="text-primary text-[10px] md:text-xs 2xl:text-sm">
            {rows.map((row, index) => (
              <tr
                key={`${row.label}-${index}`}
                className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
              >
                <td className="py-3 pr-4 pl-2 font-medium text-secondary text-xs md:text-sm 2xl:text-base">{row.label}</td>
                <td className="py-3 pr-4 text-right font-semibold">{formatCell(row.current)}</td>
                <td className="py-3 pr-4 text-right font-semibold">{formatCell(row.previous)}</td>
                <td className="py-3 pr-2 text-right">
                  <span className={`font-semibold ${row.percent >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {row.percent >= 0 ? '+' : ''}{row.percent}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
