/**
 * Thumbnail for non-image documents (PDF, Word, Excel, etc.) showing a format-specific icon/label.
 */
const FORMAT_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  pdf: { label: 'PDF', bg: 'bg-red-100', text: 'text-red-700' },
  doc: { label: 'DOC', bg: 'bg-blue-100', text: 'text-blue-700' },
  docx: { label: 'DOCX', bg: 'bg-blue-100', text: 'text-blue-700' },
  xls: { label: 'XLS', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  xlsx: { label: 'XLSX', bg: 'bg-emerald-100', text: 'text-emerald-700' },
};

function getStyle(format: string): { label: string; bg: string; text: string } {
  const key = format.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  return (
    FORMAT_STYLES[key] ?? {
      label: key ? key.toUpperCase().slice(0, 4) : 'FILE',
      bg: 'bg-gray-100',
      text: 'text-gray-600',
    }
  );
}

export interface DocumentTypeThumbnailProps {
  /** File format/extension (e.g. pdf, docx, xlsx). */
  readonly format: string;
  readonly className?: string;
}

export function DocumentTypeThumbnail({ format, className = '' }: DocumentTypeThumbnailProps) {
  const { label, bg, text } = getStyle(format);
  return (
    <div
      className={`w-12 h-12 rounded border border-gray-200 flex items-center justify-center flex-shrink-0 font-semibold text-xs ${bg} ${text} ${className}`}
      aria-hidden
    >
      {label}
    </div>
  );
}
