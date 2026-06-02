import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      // Never retry 4xx client errors — the interceptor already handles 401 refresh
      // and retrying 429/403/404 immediately just makes the problem worse.
      retry: (failureCount, error) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status && status >= 400 && status < 500) return false;
        }
        return failureCount < 1; // retry network errors / 5xx once
      },
      retryDelay: (attemptIndex) => Math.min(1500 * 2 ** attemptIndex, 10_000),
    },
    mutations: {
      retry: false, // never auto-retry mutations
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
