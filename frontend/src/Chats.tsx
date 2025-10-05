// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { useUser } from "./UserContext";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import { LogOut, Settings } from "react-feather";

export default function Chats() {
	const { user, logout } = useUser();
	const navigate = useNavigate();
	const [selectedChatId, setSelectedChatId] = useState<number | null>(null);

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
							onClick={() => setSelectedChatId(chat.id)}
							className={`p-2 mb-1 rounded hover:bg-ctp-surface0 transition-colors cursor-pointer ${
								selectedChatId === chat.id ? "bg-ctp-surface0" : ""
							}`}
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
							<Settings className="w-4 h-4" />
						</button>
						<button
							onClick={handleLogout}
							className="p-2 hover:bg-ctp-surface1 rounded transition-colors"
							title="Logout"
						>
							<LogOut className="w-4 h-4" />
						</button>
					</div>
				</div>
			</aside>
			<main className="flex-1 bg-ctp-base flex flex-col">
				{selectedChatId ? (
					<>
						<div className="flex-1 overflow-y-auto p-4"></div>
						<MessageInput />
					</>
				) : (
					<div className="flex items-center justify-center h-full text-ctp-subtext0">
						Select a chat to start messaging
					</div>
				)}
			</main>
		</div>
	);
}

function MessageInput() {
	const [message, setMessage] = useState("");
	const [enterSendsMessage, setEnterSendsMessage] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		fetchChatSettings();
	}, []);

	const fetchChatSettings = async () => {
		try {
			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/settings/chat", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (response.ok) {
				const data = await response.json();
				setEnterSendsMessage(data.enterSendsMessage);
			}
		} catch (error) {
			console.error("Failed to fetch chat settings:", error);
		}
	};

	const sendMessage = () => {
		if (!message.trim()) return;

		console.log("Sending message:", message);
		setMessage("");

		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		const isTouchDevice =
			"ontouchstart" in window || navigator.maxTouchPoints > 0;

		if (isTouchDevice) {
			return;
		}

		if (enterSendsMessage) {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		} else {
			if (e.key === "Enter" && e.ctrlKey) {
				e.preventDefault();
				sendMessage();
			}
		}
	};

	const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
		const target = e.target as HTMLTextAreaElement;
		setMessage(target.value);

		target.style.height = "auto";
		target.style.height = Math.min(target.scrollHeight, 200) + "px";
	};

	return (
		<div className="border-t border-ctp-surface0 p-4">
			<div className="flex gap-2">
				<textarea
					ref={textareaRef}
					value={message}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					placeholder="Type a message..."
					className="flex-1 resize-none bg-ctp-surface0 text-ctp-text rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ctp-blue min-h-[40px] max-h-[200px]"
					rows={1}
				/>
				<button
					onClick={sendMessage}
					disabled={!message.trim()}
					className="px-4 py-2 bg-ctp-blue text-ctp-base rounded hover:bg-ctp-sapphire disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Send
				</button>
			</div>
		</div>
	);
}
