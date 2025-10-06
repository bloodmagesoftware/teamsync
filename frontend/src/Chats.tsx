// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { useUser } from "./UserContext";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import { ArrowLeft, Plus, X } from "react-feather";
import { messageCache } from "./messageCache";
import { eventManager, type Event } from "./eventManager";

interface Conversation {
	id: number;
	type: string;
	name: string | null;
	lastMessageSeq: number;
	unreadCount: number;
	otherUser?: {
		id: number;
		username: string;
		displayName: string;
		profileImageUrl: string | null;
	};
}

interface Message {
	id: number;
	conversationId: number;
	seq: number;
	senderId: number;
	senderUsername: string;
	senderDisplayName: string;
	senderProfileImageUrl: string | null;
	createdAt: string;
	editedAt?: string;
	contentType: string;
	body: string;
	replyToId?: number;
}

export default function Chats() {
	const { user } = useUser();
	const navigate = useNavigate();
	const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(true);
	const [showNewConversation, setShowNewConversation] = useState(false);
	const [hasOlderMessages, setHasOlderMessages] = useState(true);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const messagesContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const initializeApp = async () => {
			await messageCache.init();
			await messageCache.cleanupOldMessages();
			await fetchConversations();
			eventManager.start();
		};

		initializeApp();

		return () => {
			eventManager.stop();
		};
	}, []);

	const shouldScrollToBottom = useRef(false);

	const checkShouldScroll = () => {
		const container = messagesContainerRef.current;
		if (!container) return false;

		const scrollThreshold = 32;
		const distanceFromBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight;

		return distanceFromBottom <= scrollThreshold;
	};

	const scrollToBottom = () => {
		const container = messagesContainerRef.current;
		if (!container) return;

		container.scrollTo({
			top: container.scrollHeight,
			behavior: "smooth",
		});
	};

	useEffect(() => {
		if (shouldScrollToBottom.current) {
			scrollToBottom();
			shouldScrollToBottom.current = false;
		} else if (messages.length > 0 && messagesContainerRef.current) {
			const container = messagesContainerRef.current;
			if (container.scrollTop === 0) {
				container.scrollTop = container.scrollHeight;
			}
		}
	}, [messages]);

	useEffect(() => {
		const handleEvent = async (event: Event) => {
			if (event.type === "message.new") {
				const msg = event.data as Message;
				await messageCache.saveMessages([msg]);

				if (msg.conversationId === selectedChatId) {
					shouldScrollToBottom.current = checkShouldScroll();
					setMessages((prev) => [...prev, msg]);
					await updateReadState(msg.conversationId, msg.seq);
				} else {
					setConversations((prev) =>
						prev.map((conv) =>
							conv.id === msg.conversationId
								? { ...conv, unreadCount: conv.unreadCount + 1 }
								: conv,
						),
					);
				}

				await messageCache.updateConversationMeta(msg.conversationId, {
					lastSyncTimestamp: msg.createdAt,
				});
			}
		};

		const unsubscribe = eventManager.addListener(handleEvent);
		return unsubscribe;
	}, [selectedChatId]);

	useEffect(() => {
		if (selectedChatId) {
			loadMessagesForConversation(selectedChatId);
			const container = messagesContainerRef.current;
			if (container) {
				container.scrollTop = container.scrollHeight;
			}
		}
	}, [selectedChatId]);

	const fetchConversations = async () => {
		try {
			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/conversations", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (response.ok) {
				const data = await response.json();
				setConversations(data || []);
			}
		} catch (error) {
			console.error("Failed to fetch conversations:", error);
		} finally {
			setLoading(false);
		}
	};

	const loadMessagesForConversation = async (conversationId: number) => {
		try {
			const cachedMessages = await messageCache.getMessages(conversationId);
			setMessages(cachedMessages);

			const meta = await messageCache.getConversationMeta(conversationId);
			const lastSync = meta?.lastSyncTimestamp || new Date(0).toISOString();

			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch(
				`/api/messages?conversationId=${conversationId}&since=${encodeURIComponent(lastSync)}`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				},
			);

			if (response.ok) {
				const newMessages = (await response.json()) || [];
				if (newMessages.length > 0) {
					await messageCache.saveMessages(newMessages);
					setMessages((prev) => [...prev, ...newMessages]);

					const lastMessage = newMessages[newMessages.length - 1];
					await messageCache.updateConversationMeta(conversationId, {
						lastSyncTimestamp: lastMessage.createdAt,
					});
				}

				if (cachedMessages.length > 0 || newMessages.length > 0) {
					const allMessages = [...cachedMessages, ...newMessages];
					const lastMessage = allMessages[allMessages.length - 1];
					await updateReadState(conversationId, lastMessage.seq);
				}
			}
		} catch (error) {
			console.error("Failed to load messages:", error);
		}
	};

	const loadOlderMessages = async () => {
		if (!selectedChatId || loadingOlder || !hasOlderMessages) return;

		setLoadingOlder(true);
		try {
			const oldestMessage = messages[0];
			if (!oldestMessage) {
				setHasOlderMessages(false);
				return;
			}

			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch(
				`/api/messages?conversationId=${selectedChatId}&before=${encodeURIComponent(oldestMessage.createdAt)}&limit=50`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				},
			);

			if (response.ok) {
				const olderMessages = (await response.json()) || [];
				if (olderMessages.length === 0) {
					setHasOlderMessages(false);
				} else {
					const reversedOlder = olderMessages.reverse();
					setMessages((prev) => [...reversedOlder, ...prev]);
				}
			}
		} catch (error) {
			console.error("Failed to load older messages:", error);
		} finally {
			setLoadingOlder(false);
		}
	};

	const updateReadState = async (
		conversationId: number,
		lastReadSeq: number,
	) => {
		try {
			const accessToken = localStorage.getItem("accessToken");
			await fetch("/api/messages/read", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					conversationId,
					lastReadSeq,
				}),
			});

			setConversations((prev) =>
				prev.map((conv) =>
					conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv,
				),
			);
		} catch (error) {
			console.error("Failed to update read state:", error);
		}
	};

	const handleSendMessage = async (body: string) => {
		if (!selectedChatId) return;

		try {
			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/messages/send", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					conversationId: selectedChatId,
					body,
				}),
			});

			if (response.ok) {
				const newMessage = await response.json();
				await messageCache.saveMessages([newMessage]);
				await messageCache.updateConversationMeta(selectedChatId, {
					lastSyncTimestamp: newMessage.createdAt,
				});

				shouldScrollToBottom.current = checkShouldScroll();
				setMessages((prev) => [...prev, newMessage]);

				setConversations((prev) => {
					const updated = prev.map((conv) =>
						conv.id === selectedChatId
							? { ...conv, lastMessageSeq: newMessage.seq, unreadCount: 0 }
							: conv,
					);
					return updated.sort((a, b) => b.lastMessageSeq - a.lastMessageSeq);
				});

				await updateReadState(selectedChatId, newMessage.seq);
			}
		} catch (error) {
			console.error("Failed to send message:", error);
		}
	};

	const selectedConversation = conversations.find(
		(c) => c.id === selectedChatId,
	);

	const getConversationName = (conv: Conversation) => {
		if (conv.type === "dm" && conv.otherUser) {
			return conv.otherUser.displayName || conv.otherUser.username;
		}
		return conv.name || "Unnamed conversation";
	};

	const formatMessageTime = (timestamp: string) => {
		const messageDate = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - messageDate.getTime();
		const diffHours = diffMs / (1000 * 60 * 60);

		if (diffHours < 24) {
			const diffMinutes = Math.floor(diffMs / (1000 * 60));

			if (diffMinutes < 1) {
				return "just now";
			} else if (diffMinutes < 60) {
				return `${diffMinutes}m ago`;
			} else {
				const hours = Math.floor(diffMinutes / 60);
				return `${hours}h ago`;
			}
		}

		return messageDate.toLocaleString();
	};

	const handleStartConversation = async (otherUserId: number) => {
		try {
			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/conversations/dm", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ otherUserId }),
			});

			if (response.ok) {
				const conversation = await response.json();
				setShowNewConversation(false);

				const existingConv = conversations.find(
					(c) => c.id === conversation.id,
				);
				if (!existingConv) {
					setConversations((prev) => [conversation, ...prev]);
				}

				setSelectedChatId(conversation.id);
			}
		} catch (error) {
			console.error("Failed to create conversation:", error);
		}
	};

	return (
		<div className="flex h-screen bg-ctp-base text-ctp-text">
			{showNewConversation && (
				<NewConversationDialog
					onClose={() => setShowNewConversation(false)}
					onSelectUser={handleStartConversation}
				/>
			)}
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
						onClick={() => setShowNewConversation(true)}
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
								onClick={() => setSelectedChatId(chat.id)}
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

			<main
				className={`${selectedChatId ? "flex" : "hidden md:flex"} flex-1 bg-ctp-base flex-col`}
			>
				{selectedChatId && selectedConversation ? (
					<>
						<div className="p-4 border-b border-ctp-surface0 flex items-center gap-3">
							<button
								onClick={() => setSelectedChatId(null)}
								className="md:hidden p-2 hover:bg-ctp-surface0 rounded transition-colors"
							>
								<ArrowLeft className="w-5 h-5" />
							</button>
							<h2 className="text-lg font-semibold">
								{getConversationName(selectedConversation)}
							</h2>
						</div>
						<div
							ref={messagesContainerRef}
							className="flex-1 overflow-y-auto p-4 space-y-4"
						>
							{hasOlderMessages && messages.length > 0 && (
								<div className="flex justify-center mb-4">
									<button
										onClick={loadOlderMessages}
										disabled={loadingOlder}
										className="px-4 py-2 text-sm bg-ctp-surface0 text-ctp-text rounded hover:bg-ctp-surface1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
									>
										{loadingOlder ? "Loading..." : "Load older messages"}
									</button>
								</div>
							)}
							{messages.map((msg) => (
								<div key={msg.id} className="flex gap-3">
									<Avatar size="sm" imageUrl={msg.senderProfileImageUrl} />
									<div className="flex-1">
										<div className="flex items-baseline gap-2">
											<span className="font-semibold text-ctp-text">
												{msg.senderDisplayName}
											</span>
											<span className="text-xs text-ctp-subtext0">
												{formatMessageTime(msg.createdAt)}
											</span>
										</div>
										<div className="text-ctp-text mt-1">{msg.body}</div>
									</div>
								</div>
							))}
						</div>
						<MessageInput onSend={handleSendMessage} />
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

function MessageInput({ onSend }: { onSend: (message: string) => void }) {
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

		onSend(message);
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
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
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

interface UserSearchResult {
	id: number;
	username: string;
	displayName: string;
	profileImageUrl: string | null;
}

function NewConversationDialog({
	onClose,
	onSelectUser,
}: {
	onClose: () => void;
	onSelectUser: (userId: number) => void;
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
	const [searching, setSearching] = useState(false);
	const timeoutRef = useRef<number | null>(null);

	useEffect(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		if (searchQuery.trim() === "") {
			setSearchResults([]);
			return;
		}

		setSearching(true);
		timeoutRef.current = setTimeout(async () => {
			try {
				const accessToken = localStorage.getItem("accessToken");
				const response = await fetch(
					`/api/users/search?q=${encodeURIComponent(searchQuery)}`,
					{
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					},
				);

				if (response.ok) {
					const data = await response.json();
					setSearchResults(data || []);
				}
			} catch (error) {
				console.error("Failed to search users:", error);
			} finally {
				setSearching(false);
			}
		}, 300);

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [searchQuery]);

	const handleUserClick = (userId: number) => {
		onSelectUser(userId);
	};

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div className="bg-ctp-mantle rounded-lg shadow-xl max-w-md w-full">
				<div className="flex items-center justify-between p-4 border-b border-ctp-surface0">
					<h2 className="text-lg font-semibold">Start a conversation</h2>
					<button
						onClick={onClose}
						className="p-1 hover:bg-ctp-surface0 rounded transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				<div className="p-4">
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search for users..."
						className="w-full px-3 py-2 bg-ctp-surface0 text-ctp-text rounded focus:outline-none focus:ring-2 focus:ring-ctp-blue"
						autoFocus
					/>

					<div className="mt-4">
						{searching && (
							<div className="text-center text-ctp-subtext0 py-4">
								Searching...
							</div>
						)}

						{!searching && searchQuery && searchResults.length === 0 && (
							<div className="text-center text-ctp-subtext0 py-4">
								No users found
							</div>
						)}

						{!searching && searchResults.length > 0 && (
							<div className="space-y-1">
								{searchResults.map((user) => (
									<button
										key={user.id}
										onClick={() => handleUserClick(user.id)}
										className="w-full flex items-center gap-3 p-2 hover:bg-ctp-surface0 rounded transition-colors"
									>
										<Avatar
											size="sm"
											imageUrl={user.profileImageUrl}
											username={user.username}
										/>
										<div className="flex-1 text-left">
											<div className="font-medium">{user.displayName}</div>
											{user.displayName !== user.username && (
												<div className="text-sm text-ctp-subtext0">
													@{user.username}
												</div>
											)}
										</div>
									</button>
								))}
							</div>
						)}

						{!searching && searchResults.length > 0 && (
							<div className="text-xs text-ctp-subtext0 mt-2 text-center">
								Showing up to 10 results
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
