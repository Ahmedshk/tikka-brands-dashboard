import { Link, type LinkProps } from 'react-router-dom';
import ViewIcon from '@assets/icons/view.svg?react';

export interface ViewActionLinkProps extends Omit<LinkProps, 'children'> {
  title?: string;
}

export const ViewActionLink = ({
  className = '',
  title = 'View details',
  ...linkProps
}: ViewActionLinkProps) => (
  <Link
    {...linkProps}
    className={`p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center ${className}`.trim()}
    aria-label="View"
    title={title}
  >
    <ViewIcon className="w-4 h-4" />
  </Link>
);

const viewButtonClassName =
  'p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center';

export interface TableRowViewActionProps<T> {
  row: T;
  index: number;
  getViewTo?: (row: T, index: number) => string | undefined;
  onView?: (row: T, index: number) => void;
}

export function TableRowViewAction<T>({
  row,
  index,
  getViewTo,
  onView,
}: Readonly<TableRowViewActionProps<T>>) {
  const to = getViewTo?.(row, index);
  if (to) {
    return <ViewActionLink to={to} />;
  }
  return (
    <button
      type="button"
      onClick={() => onView?.(row, index)}
      className={viewButtonClassName}
      aria-label="View"
      title="View details"
    >
      <ViewIcon className="w-4 h-4" />
    </button>
  );
}
