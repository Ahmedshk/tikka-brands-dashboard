import { Layout } from '../../components/common/Layout';
import { useAuth } from '../../hooks/useAuth';

export const NoAccess = () => {
  const { logout } = useAuth();

  return (
    <Layout>
      <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-primary md:text-3xl">
            No access
          </h1>
          <p className="text-primary/90">
            Your account does not have access to any pages in this application.
            Please contact your administrator to request access.
          </p>
          <div className="pt-4">
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-md bg-button-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};
