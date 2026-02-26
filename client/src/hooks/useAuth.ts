import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RootState, AppDispatch } from "../store/store";
import { setUser, clearUser, setLoading } from "../store/slices/auth.slice";
import { setCurrentLocation } from "../store/slices/location.slice";
import api from "../services/api.service";
import { ApiResponse, User } from "../types";
import { API_ENDPOINTS } from "../utils/constants";
import { AxiosError } from "axios";

interface LoginCredentials {
  email: string;
  password: string;
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
      const response = await api.post<ApiResponse<{ user: User }>>(
        API_ENDPOINTS.AUTH.LOGIN,
        credentials
      );

      if (response.data.success && response.data.data) {
        dispatch(setUser(response.data.data.user));
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

  const logout = async (): Promise<void> => {
    try {
      await api.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch (error) {
      // Continue with logout even if API call fails
      console.error("Logout error:", error);
    } finally {
      dispatch(clearUser());
      dispatch(setCurrentLocation(null));
      toast.success("Logged out successfully");
      navigate("/login");
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
