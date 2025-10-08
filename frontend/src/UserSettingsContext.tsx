// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { fetchChatSettings } from "./chatApi";
import { useUser } from "./UserContext";

interface UserSettings {
	enterSendsMessage: boolean;
	markdownEnabled: boolean;
}

interface UserSettingsContextType {
	settings: UserSettings | null;
	isLoading: boolean;
	refreshSettings: () => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export function UserSettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = useState<UserSettings | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const { user } = useUser();

	const loadSettings = useCallback(async () => {
		// Only load settings if user is authenticated
		if (!user) {
			setIsLoading(false);
			return;
		}
		
		setIsLoading(true);
		try {
			const data = await fetchChatSettings();
			setSettings(data);
		} catch (error) {
			console.error("Failed to fetch user settings:", error);
			setSettings(null);
		} finally {
			setIsLoading(false);
		}
	}, [user]);

	const refreshSettings = useCallback(async () => {
		await loadSettings();
	}, [loadSettings]);

	useEffect(() => {
		loadSettings();
	}, [loadSettings]);

	const value = useMemo(
		() => ({ settings, isLoading, refreshSettings }),
		[settings, isLoading, refreshSettings]
	);

	return (
		<UserSettingsContext.Provider value={value}>
			{children}
		</UserSettingsContext.Provider>
	);
}

export function useUserSettings() {
	const context = useContext(UserSettingsContext);
	if (context === undefined) {
		throw new Error("useUserSettings must be used within a UserSettingsProvider");
	}
	return context;
}
