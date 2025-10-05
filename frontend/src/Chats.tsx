// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { useUser } from "./UserContext";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import { ArrowLeft } from "react-feather";

export default function Chats() {
	const { user } = useUser();
	const navigate = useNavigate();
	const [selectedChatId, setSelectedChatId] = useState<number | null>(null);

	const mockChats = [
		{ id: 1, name: "General", lastMessage: "Hello team!" },
		{ id: 2, name: "Development", lastMessage: "New PR is ready" },
		{ id: 3, name: "Random", lastMessage: "Anyone up for coffee?" },
	];

	return (
		<div className="flex h-screen bg-ctp-base text-ctp-text">
			<aside
				className={`${selectedChatId ? "hidden md:flex" : "flex"} w-full md:w-60 bg-ctp-mantle flex-col`}
			>
				<div className="p-4 md:hidden flex items-center justify-between border-b border-ctp-surface0">
					<h1 className="text-xl font-bold">TeamSync</h1>
					<button
						onClick={() => navigate("/settings")}
						className="p-2 hover:bg-ctp-surface0 rounded transition-colors"
					>
						<Avatar size="sm" />
					</button>
				</div>

				<div className="hidden md:block p-4 border-b border-ctp-surface0">
					<h1 className="text-xl font-bold">TeamSync</h1>
				</div>

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

				<div className="hidden md:flex p-2 bg-ctp-surface0 items-center justify-between">
					<div className="flex items-center gap-2 flex-1 min-w-0">
						<Avatar size="sm" />
						<span className="text-sm font-medium truncate">
							{user?.username}
						</span>
					</div>
					<button
						onClick={() => navigate("/settings")}
						className="p-2 hover:bg-ctp-surface1 rounded transition-colors"
						title="Settings"
					>
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
							/>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
					</button>
				</div>
			</aside>

			<main
				className={`${selectedChatId ? "flex" : "hidden md:flex"} flex-1 bg-ctp-base flex-col`}
			>
				{selectedChatId ? (
					<>
						<div className="p-4 md:hidden border-b border-ctp-surface0 flex items-center gap-3">
							<button
								onClick={() => setSelectedChatId(null)}
								className="p-2 hover:bg-ctp-surface0 rounded transition-colors"
							>
								<ArrowLeft className="w-5 h-5" />
							</button>
							<h2 className="text-lg font-semibold">
								{mockChats.find((c) => c.id === selectedChatId)?.name}
							</h2>
						</div>
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
