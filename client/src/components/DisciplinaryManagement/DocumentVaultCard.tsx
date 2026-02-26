import type { DocumentVaultItem } from '../../types/disciplinaryManagement.types';
import DocumentIcon from '@assets/icons/document.svg?react';
import DownloadIcon from '@assets/icons/download.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface DocumentVaultCardProps {
  items: DocumentVaultItem[];
  onViewAll?: () => void;
  onDownload?: (item: DocumentVaultItem, index: number) => void;
}

export const DocumentVaultCard = ({
  items,
  onViewAll,
  onDownload,
}: DocumentVaultCardProps) => {
  return (
    <div className={`${cardClass} h-full flex flex-col min-h-0 overflow-hidden`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          Document Vault
        </h3>
      </div>
      <div className="p-5 flex-1 min-h-0 overflow-hidden">
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={`${item.fileName}-${index}`}
              className={`flex items-center justify-between gap-2 py-2 ${index % 2 === 1 ? 'bg-[#F3F5F7] -mx-2 px-2 rounded' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <DocumentIcon className="w-5 h-5 shrink-0 text-secondary" aria-hidden />
                <span className="text-[10px] md:text-xs 2xl:text-sm text-primary truncate">
                  {item.fileName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDownload?.(item, index)}
                className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors shrink-0"
                aria-label={`Download ${item.fileName}`}
                title={`Download ${item.fileName}`}
              >
                <DownloadIcon className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        {onViewAll != null && (
          <div className="mt-4 flex justify-end flex-shrink-0">
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
