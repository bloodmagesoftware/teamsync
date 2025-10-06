// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { eventManager } from "./eventManager";
import { messageCache } from "./messageCache";

export interface User {
	id: number;
	username: string;
	profileImageUrl?: string | null;
}

interface UserContextType {
	user: User | null;
	isLoading: boolean;
	login: (accessToken: string, refreshToken: string, user: User) => void;
	logout: () => void;
	checkAuth: () => Promise<void>;
	updateUser: (user: User) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const login = useCallback((accessToken: string, refreshToken: string, user: User) => {
		localStorage.setItem("accessToken", accessToken);
		localStorage.setItem("refreshToken", refreshToken);
		setUser(user);
	}, []);

	const logout = useCallback(async () => {
		eventManager.stop();
		await messageCache.close();
		localStorage.removeItem("accessToken");
		localStorage.removeItem("refreshToken");
		setUser(null);
	}, []);

	const updateUser = useCallback((user: User) => {
		setUser(user);
	}, []);

	const checkAuth = useCallback(async () => {
		const accessToken = localStorage.getItem("accessToken");
		if (!accessToken) {
			setIsLoading(false);
			return;
		}

		try {
			const response = await fetch("/api/auth/me", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (response.ok) {
				const userData = await response.json();
				setUser(userData);
			} else {
				logout();
			}
		} catch (error) {
			console.error("Failed to check auth:", error);
			logout();
		} finally {
			setIsLoading(false);
		}
	}, [logout]);

	useEffect(() => {
		checkAuth();
	}, [checkAuth]);

	const value = useMemo(
		() => ({ user, isLoading, login, logout, checkAuth, updateUser }),
		[user, isLoading, login, logout, checkAuth, updateUser]
	);

	return (
		<UserContext.Provider value={value}>
			{children}
		</UserContext.Provider>
	);
}

export function useUser() {
	const context = useContext(UserContext);
	if (context === undefined) {
		throw new Error("useUser must be used within a UserProvider");
	}
	return context;
}
