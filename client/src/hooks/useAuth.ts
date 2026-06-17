import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RootState, AppDispatch } from "../store/store";
import { setUser, clearUser, setLoading } from "../store/slices/auth.slice";
import { resetLocationState } from "../store/slices/location.slice";
import { clearNotifications } from "../store/slices/notification.slice";
import { invalidateLocationListCache } from "../services/location.service";
import { connectSocket, disconnectSocket } from "../services/socket.service";
import api from "../services/api.service";
import { ApiResponse, User } from "../types";
import { API_ENDPOINTS } from "../utils/constants";
import { AxiosError } from "axios";

interface LoginCredentials {
  email: string;
  password: string;
}

export interface LogoutOptions {
  replace?: boolean;
  loginState?: { message?: string };
  /** Omit for default success toast; `null` skips toast */
  toastMessage?: string | null;
}

export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useSelector(
    (state: RootState) => state.auth
  );

  const login = async (credentials: LoginCredentials): Promise<void> => {
    try {
      dispatch(setLoading(true));
      const response = await api.post<ApiResponse<{ user: User; socketToken?: string }>>(
        API_ENDPOINTS.AUTH.LOGIN,
        credentials
      );

      if (response.data.success && response.data.data) {
        invalidateLocationListCache();
        dispatch(resetLocationState());
        dispatch(setUser(response.data.data.user));
        if (response.data.data.socketToken) {
          connectSocket(response.data.data.socketToken);
        }
        toast.success("Login successful");
        navigate("/dashboard");
      } else {
        throw new Error(response.data.message || "Login failed");
      }
    } catch (error) {
      dispatch(setLoading(false));

      // Extract error message from API response
      if (error instanceof AxiosError && error.response?.data) {
        const apiError = error.response.data as ApiResponse;
        throw new Error(apiError.message || "An error occurred during login");
      }

      // Fallback for other errors
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("An error occurred during login");
    }
  };

  const logout = async (options?: LogoutOptions): Promise<void> => {
    try {
      await api.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch (error) {
      // Continue with logout even if API call fails
      console.error("Logout error:", error);
    } finally {
      disconnectSocket();
      invalidateLocationListCache();
      dispatch(clearUser());
      dispatch(resetLocationState());
      dispatch(clearNotifications());
      const toastMsg = options?.toastMessage;
      if (toastMsg !== null) {
        if (typeof toastMsg === "string" && toastMsg.trim() !== "") {
          toast.success(toastMsg);
        } else if (toastMsg === undefined) {
          toast.success("Logged out successfully");
        }
      }
      const navigateOpts: { replace: boolean; state?: { message?: string } } = {
        replace: options?.replace === true,
      };
      if (options?.loginState) {
        navigateOpts.state = options.loginState;
      }
      navigate("/login", navigateOpts);
    }
  };

  const checkAuth = async (): Promise<void> => {
    // Placeholder for checking auth status
    // This will be implemented when we have a /me endpoint
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkAuth,
  };
};
