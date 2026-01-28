// frontend/src/providers/ProtectedRoute.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/store/authStore";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, token } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Give zustand persist time to rehydrate from localStorage
    const timer = setTimeout(() => {
      setIsChecking(false);

      // After rehydration, check if authenticated
      if (!isAuthenticated || !token) {
        if (pathname !== "/login") {
          router.push("/login");
        }
      }
    }, 100); // Small delay to allow zustand to rehydrate

    return () => clearTimeout(timer);
  }, [isAuthenticated, token, pathname, router]);

  // Show loading state while zustand is rehydrating
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f0f0]">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-[#202020] font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated after checking, don't render children (will redirect)
  if (!isAuthenticated || !token) {
    return null;
  }

  return <>{children}</>;
}
