// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "./UserContext";

interface LoginRequest {
	username: string;
	password: string;
}

interface AuthResponse {
	success: boolean;
	message?: string;
	userId?: number;
	username?: string;
	accessToken?: string;
	refreshToken?: string;
}

const loginUser = async (credentials: LoginRequest): Promise<AuthResponse> => {
	const response = await fetch("/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(credentials),
	});
	return response.json();
};

export default function Login() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const { login } = useUser();

	const loginMutation = useMutation({
		mutationFn: loginUser,
		onSuccess: (data) => {
			if (data.success && data.accessToken && data.refreshToken && data.userId && data.username) {
				login(data.accessToken, data.refreshToken, {
					id: data.userId,
					username: data.username,
				});
			}
		},
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		loginMutation.mutate({ username, password });
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-ctp-base">
			<div className="w-full max-w-md p-8 bg-ctp-mantle rounded-lg">
				<h1 className="text-3xl font-bold text-ctp-text mb-6">Login</h1>
				<form onSubmit={handleSubmit}>
					<div className="mb-4">
						<label className="block text-ctp-subtext0 mb-2">Username</label>
						<input
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							className="w-full px-4 py-2 bg-ctp-surface0 text-ctp-text rounded border border-ctp-surface1 focus:border-ctp-lavender focus:outline-none"
							required
						/>
					</div>
					<div className="mb-6">
						<label className="block text-ctp-subtext0 mb-2">Password</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full px-4 py-2 bg-ctp-surface0 text-ctp-text rounded border border-ctp-surface1 focus:border-ctp-lavender focus:outline-none"
							required
						/>
					</div>
					{!loginMutation.data?.success && loginMutation.data?.message && (
						<div className="mb-4 text-ctp-red">{loginMutation.data.message}</div>
					)}
					{loginMutation.isError && (
						<div className="mb-4 text-ctp-red">Network error</div>
					)}
					<button
						type="submit"
						disabled={loginMutation.isPending}
						className="w-full px-4 py-2 bg-ctp-lavender text-ctp-base rounded hover:bg-ctp-mauve transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{loginMutation.isPending ? "Logging in..." : "Login"}
					</button>
				</form>
			</div>
		</div>
	);
}
