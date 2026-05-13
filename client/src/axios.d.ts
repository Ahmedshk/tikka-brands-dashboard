import 'axios';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** When true, the api response error interceptor skips the global toast */
    skipGlobalErrorToast?: boolean;
  }
}
