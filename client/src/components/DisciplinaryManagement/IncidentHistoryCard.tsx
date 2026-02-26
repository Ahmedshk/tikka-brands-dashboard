import type { IncidentHistoryItem } from '../../types/disciplinaryManagement.types';
import PendingIcon from '@assets/icons/pending.svg?react';
import CompliantIcon from '@assets/icons/compliant.svg?react';
import DownloadIcon from '@assets/icons/download.svg?react';
import ViewIcon from '@assets/icons/view.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface IncidentHistoryCardProps {
  items: IncidentHistoryItem[];
  onDownload?: (item: IncidentHistoryItem, index: number) => void;
  onView?: (item: IncidentHistoryItem, index: number) => void;
  onViewAll?: () => void;
}

export const IncidentHistoryCard = ({
  items,
  onDownload,
  onView,
  onViewAll,
}: IncidentHistoryCardProps) => {
  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden h-full`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Incident History (90 Days)
        </h3>
      </div>
      <div className="p-5 flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto min-h-0 flex-1">
          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="pb-3 pr-4 pl-2 font-semibold">Incident Type</th>
                <th className="pb-3 pr-4 font-semibold text-center">Date</th>
                <th className="pb-3 pr-4 font-semibold text-center">Document</th>
                <th className="pb-3 pr-4 font-semibold text-center">Status</th>
                <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {items.map((item, index) => (
                <tr
                  key={`${item.incidentType}-${item.date}-${index}`}
                  className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                >
                  <td className="py-3 pr-4 pl-2">{item.incidentType}</td>
                  <td className="py-3 pr-4 text-center">{item.date}</td>
                  <td className="py-3 pr-4 text-center">{item.documentName}</td>
                  <td className="py-3 pr-4 text-center">
                    <div className="flex items-center gap-1.5 justify-center">
                      {item.status === 'pending' ? (
                        <>
                          <PendingIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 shrink-0 text-pending font-semibold" aria-hidden />
                          <span className="text-pending font-semibold">Pending Signature</span>
                        </>
                      ) : (
                        <>
                          <CompliantIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 shrink-0 text-positive" aria-hidden />
                          <span className="text-positive font-semibold">Signed</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onDownload?.(item, index)}
                        className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                        aria-label="Download"
                        title="Download"
                      >
                        <DownloadIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onView?.(item, index)}
                        className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                        aria-label="View"
                        title="View"
                      >
                        <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {onViewAll != null && (
          <div className="flex justify-end pt-3 flex-shrink-0">
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-medium text-quaternary hover:underline bg-transparent border-0 cursor-pointer p-0"
              title="View all"
            >
              View All
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
