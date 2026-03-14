"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,   // 5 min — don't refetch if data is fresh
            gcTime:    30 * 60 * 1000,   // 30 min — keep in cache after unmount
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
