// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useUser } from "./UserContext";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import { LogOut, Settings } from "react-feather";

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
		<div className="flex h-screen bg-ctp-base text-ctp-text">
			<aside className="w-60 bg-ctp-mantle flex flex-col">
				<div className="flex-1 overflow-y-auto p-2">
					{mockChats.map((chat) => (
						<div
							key={chat.id}
							className="p-2 mb-1 rounded hover:bg-ctp-surface0 transition-colors cursor-pointer"
						>
							<div className="font-semibold text-ctp-text">{chat.name}</div>
							<div className="text-xs text-ctp-subtext0 truncate">
								{chat.lastMessage}
							</div>
						</div>
					))}
				</div>
				<div className="p-2 bg-ctp-surface0 flex items-center justify-between">
					<div className="flex items-center gap-2 flex-1 min-w-0">
						<Avatar size="sm" />
						<span className="text-sm font-medium truncate">
							{user?.username}
						</span>
					</div>
					<div className="flex gap-1">
						<button
							onClick={() => navigate("/settings")}
							className="p-2 hover:bg-ctp-surface1 rounded transition-colors"
							title="Settings"
						>
							<Settings />
						</button>
						<button
							onClick={handleLogout}
							className="p-2 hover:bg-ctp-surface1 rounded transition-colors"
							title="Logout"
						>
							<LogOut />
						</button>
					</div>
				</div>
			</aside>
			<main className="flex-1 bg-ctp-base"></main>
		</div>
	);
}
