// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "./UserContext";

interface RegisterRequest {
	username: string;
	password: string;
	invitationCode: string;
}

interface AuthResponse {
	success: boolean;
	message?: string;
	userId?: number;
	username?: string;
	accessToken?: string;
	refreshToken?: string;
}

const registerUser = async (data: RegisterRequest): Promise<AuthResponse> => {
	const response = await fetch("/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
	return response.json();
};

export default function Register() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { login } = useUser();
	const invitationCode = searchParams.get("invite");

	useEffect(() => {
		if (!invitationCode) {
			setError("Invalid invitation link");
		}
	}, [invitationCode]);

	const registerMutation = useMutation({
		mutationFn: registerUser,
		onSuccess: (data) => {
			if (
				data.success &&
				data.accessToken &&
				data.refreshToken &&
				data.userId &&
				data.username
			) {
				login(data.accessToken, data.refreshToken, {
					id: data.userId,
					username: data.username,
				});
				navigate("/");
			}
		},
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!invitationCode) {
			setError("Invalid invitation link");
			return;
		}

		registerMutation.mutate({ username, password, invitationCode });
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-ctp-base">
			<div className="w-full max-w-md p-8 bg-ctp-mantle rounded-lg">
				<h1 className="text-3xl font-bold text-ctp-text mb-6">Register</h1>
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
					{error && <div className="mb-4 text-ctp-red">{error}</div>}
					{!registerMutation.data?.success &&
						registerMutation.data?.message && (
						<div className="mb-4 text-ctp-red">
							{registerMutation.data.message}
						</div>
					)}
					{registerMutation.isError && (
						<div className="mb-4 text-ctp-red">Network error</div>
					)}
					<button
						type="submit"
						disabled={registerMutation.isPending || !invitationCode}
						className="w-full px-4 py-2 bg-ctp-lavender text-ctp-base rounded hover:bg-ctp-mauve transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{registerMutation.isPending ? "Registering..." : "Register"}
					</button>
				</form>
			</div>
		</div>
	);
}
