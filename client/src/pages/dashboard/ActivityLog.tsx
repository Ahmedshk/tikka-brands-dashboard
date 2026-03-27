import OperationsIcon from '@assets/icons/operations.svg?react';
import { Layout } from '../../components/common/Layout';

export const ActivityLog = () => {
  return (
    <Layout>
      <div className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-primary md:text-lg 2xl:text-xl">
          <OperationsIcon className="h-4 w-4 text-primary md:h-5 md:w-5 2xl:h-6 2xl:w-6" aria-hidden />
          Activity Log
        </h2>
        <div className="rounded-xl border border-gray-200 bg-card-background p-6 text-sm text-primary/80">
          Activity Log content will be added here.
        </div>
      </div>
    </Layout>
  );
};
