// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import type { ReactNode } from "react";
import { useUser } from "./UserContext";
import Login from "./Login";

interface ProtectedProps {
	children: ReactNode;
}

export default function Protected({ children }: ProtectedProps) {
	const { user, isLoading } = useUser();

	if (isLoading) {
		return null;
	}

	if (!user) {
		return <Login />;
	}

	return <>{children}</>;
}
