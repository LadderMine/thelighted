"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/authStore";
import { AdminRole } from "@/lib/types/user";

interface UseRoleProtectionOptions {
allowedRoles: AdminRole[];
redirectTo?: string;
}

export function useRoleProtection({
allowedRoles,
redirectTo = "/admin/dashboard",
}: UseRoleProtectionOptions) {
const router = useRouter();
const { user, isLoading } = useAuthStore();

useEffect(() => {
// Wait for auth to load
if (isLoading) return;

    // If no user, redirect to login (handled by auth middleware)
    if (!user) return;

    // Check if user's role is in allowed roles
    const hasAccess = user.role && allowedRoles.includes(user.role);

    if (!hasAccess) {
      console.warn(
        `Access denied: User role '${user.role}' not in allowed roles`,
        allowedRoles
      );
      router.replace(redirectTo);
    }

}, [user, isLoading, allowedRoles, redirectTo, router]);

// Return access status
return {
hasAccess: user?.role ? allowedRoles.includes(user.role) : false,
isLoading,
user,
};
}
