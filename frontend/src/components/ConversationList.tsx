// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { Plus } from "react-feather";
import { useNavigate } from "react-router-dom";
import { useUser } from "../UserContext";
import Avatar from "../Avatar";
import type { Conversation } from "../chatUtils";
import { getConversationName } from "../chatUtils";

export function ConversationList({
	conversations,
	selectedChatId,
	loading,
	onSelectChat,
	onNewConversation,
}: {
	conversations: Conversation[];
	selectedChatId: number | null;
	loading: boolean;
	onSelectChat: (id: number) => void;
	onNewConversation: () => void;
}) {
	const { user } = useUser();
	const navigate = useNavigate();

	return (
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

			<div className="p-2 border-b border-ctp-surface0">
				<button
					onClick={onNewConversation}
					className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-ctp-blue text-ctp-base rounded hover:bg-ctp-sapphire transition-colors"
				>
					<Plus className="w-4 h-4" />
					<span>Start a conversation</span>
				</button>
			</div>

			<div className="flex-1 overflow-y-auto p-2">
				{loading ? (
					<div className="text-center text-ctp-subtext0 p-4">Loading...</div>
				) : conversations.length === 0 ? (
					<div className="text-center text-ctp-subtext0 p-4">
						No conversations yet
					</div>
				) : (
					conversations.map((chat) => (
						<div
							key={chat.id}
							onClick={() => onSelectChat(chat.id)}
							className={`p-2 mb-1 rounded hover:bg-ctp-surface0 transition-colors cursor-pointer ${
								selectedChatId === chat.id ? "bg-ctp-surface0" : ""
							}`}
						>
							<div className="flex items-center gap-2">
								{chat.type === "dm" && chat.otherUser && (
									<Avatar
										size="sm"
										imageUrl={chat.otherUser.profileImageUrl}
									/>
								)}
								<div className="flex-1 min-w-0">
									<div className="font-semibold text-ctp-text truncate">
										{getConversationName(chat)}
									</div>
									{chat.unreadCount > 0 && (
										<div className="text-xs text-ctp-blue">
											{chat.unreadCount} unread
										</div>
									)}
								</div>
							</div>
						</div>
					))
				)}
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
	);
}
