import LocationIcon from '@assets/icons/location.svg?react';

export interface ReviewLocationPillProps {
  name: string;
}

export function ReviewLocationPill({ name }: Readonly<ReviewLocationPillProps>) {
  return (
    <div className="mb-2">
      <span className="inline-flex items-center gap-1 max-w-full text-xs text-tertiary bg-gray-100 px-2 py-0.5 rounded">
        <LocationIcon className="w-3 h-3 shrink-0" aria-hidden />
        <span className="truncate">{name}</span>
      </span>
    </div>
  );
}
