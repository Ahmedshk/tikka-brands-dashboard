import { useEffect, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store/store';
import { setUser, setAuthCheckDone } from '../../store/slices/auth.slice';
import { Spinner } from '../common/Spinner';
import api from '../../services/api.service';
import { connectSocket } from '../../services/socket.service';
import { API_ENDPOINTS } from '../../utils/constants';
import { ApiResponse } from '../../types';
import type { User } from '../../types';

interface AuthInitProps {
  children: ReactNode;
}

export const AuthInit = ({ children }: AuthInitProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const authCheckDone = useSelector((state: RootState) => state.auth.authCheckDone);

  useEffect(() => {
    let cancelled = false;

    const runCheck = async () => {
      try {
        const res = await api.post<ApiResponse<{ user: User; socketToken?: string }>>(API_ENDPOINTS.AUTH.REFRESH, undefined, {
          withCredentials: true,
        });
        if (cancelled) return;
        if (res.data.success && res.data.data?.user) {
          dispatch(setUser(res.data.data.user));
          if (res.data.data.socketToken) {
            connectSocket(res.data.data.socketToken);
          }
        }
      } catch {
        if (!cancelled) {
          // No valid session - leave isAuthenticated false
        }
      } finally {
        if (!cancelled) {
          dispatch(setAuthCheckDone(true));
        }
      }
    };

    runCheck();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  if (!authCheckDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dashboard-background">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" className="text-button-primary" />
          <p className="text-sm text-primary">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
