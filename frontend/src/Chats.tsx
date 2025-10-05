// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useUser } from "./UserContext";
import { useNavigate } from "react-router-dom";

export default function Chats() {
	const { user, logout } = useUser();
	const navigate = useNavigate();

	const handleLogout = () => {
		logout();
		navigate("/");
	};

	const mockChats = [
		{ id: 1, name: "General", lastMessage: "Hello team!" },
		{ id: 2, name: "Development", lastMessage: "New PR is ready" },
		{ id: 3, name: "Random", lastMessage: "Anyone up for coffee?" },
	];

	return (
		<div className="min-h-screen bg-ctp-base text-ctp-text p-8">
			<div className="flex justify-between items-center mb-8">
				<div>
					<h1 className="text-3xl font-bold">TeamSync</h1>
					{user && (
						<p className="mt-2 text-ctp-subtext0">Welcome, {user.username}</p>
					)}
				</div>
				<button
					onClick={handleLogout}
					className="px-4 py-2 bg-ctp-red text-ctp-base rounded hover:bg-ctp-maroon transition-colors"
				>
					Logout
				</button>
			</div>
			<div className="max-w-2xl">
				<h2 className="text-xl font-semibold mb-4">Chats</h2>
				<div className="space-y-2">
					{mockChats.map((chat) => (
						<div
							key={chat.id}
							className="p-4 bg-ctp-mantle rounded-lg hover:bg-ctp-surface0 transition-colors cursor-pointer"
						>
							<div className="font-semibold text-ctp-text">{chat.name}</div>
							<div className="text-sm text-ctp-subtext0">{chat.lastMessage}</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
