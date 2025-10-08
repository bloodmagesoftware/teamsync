// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect, useRef, useCallback } from "react";
import { messageCache, type StoredConversation } from "./messageCache";
import { eventManager, type Event } from "./eventManager";
import { ConversationList } from "./components/ConversationList";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { NewConversationDialog } from "./components/NewConversationDialog";
import {
	type Message,
	checkShouldScroll,
	scrollToBottom,
	sortConversationsByLastMessage,
} from "./chatUtils";
import {
	fetchConversations as apiFetchConversations,
	fetchMessages,
	fetchOlderMessages,
	sendMessage,
	markAsRead,
	createDirectConversation,
} from "./chatApi";
import { useCall } from "./CallContext";

export default function Chats() {
	const { startCall, answerCall } = useCall();
	const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
	const [conversations, setConversations] = useState<StoredConversation[]>([]);
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(true);
	const [showNewConversation, setShowNewConversation] = useState(false);
	const [hasOlderMessages, setHasOlderMessages] = useState(true);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const shouldScrollToBottom = useRef(false);

	const refreshConversations = useCallback(async () => {
		try {
			const stored = await messageCache.getConversations();
			setConversations(sortConversationsByLastMessage(stored));
		} catch (error) {
			console.error("Failed to load conversations from cache:", error);
		}
	}, []);

	const refreshMessages = useCallback(async (conversationId: number) => {
		try {
			const cached = await messageCache.getMessages(conversationId);
			setMessages(cached);
			return cached;
		} catch (error) {
			console.error("Failed to load messages from cache:", error);
			return [];
		}
	}, []);

	const syncConversationsFromServer = useCallback(async () => {
		try {
			const data = await apiFetchConversations();
			await messageCache.saveConversations(data);
			await refreshConversations();
		} catch (error) {
			console.error("Failed to fetch conversations:", error);
		}
	}, [refreshConversations]);

	const handleUpdateReadState = useCallback(
		async (conversationId: number, lastReadSeq: number) => {
			try {
				await markAsRead(conversationId, lastReadSeq);
				await messageCache.updateConversationMeta(conversationId, {
					unreadCount: 0,
					lastMessageSeq: lastReadSeq,
				});
				await refreshConversations();
			} catch (error) {
				console.error("Failed to update read state:", error);
			}
		},
		[refreshConversations],
	);

	useEffect(() => {
		let isMounted = true;

		const initializeApp = async () => {
			try {
				await messageCache.init();
				await messageCache.cleanupOldMessages();
				if (!isMounted) return;

				eventManager.start(() => messageCache.getLastMessageId());

				await refreshConversations();
				if (!isMounted) return;

				await syncConversationsFromServer();
			} catch (error) {
				console.error("Failed to initialize chat view:", error);
			} finally {
				if (isMounted) {
					setLoading(false);
				}
			}
		};

		initializeApp();

		return () => {
			isMounted = false;
			eventManager.stop();
		};
	}, [refreshConversations, syncConversationsFromServer]);

	useEffect(() => {
		const container = messagesContainerRef.current;
		if (!container) return;

		if (shouldScrollToBottom.current) {
			scrollToBottom(container);
			shouldScrollToBottom.current = false;
		} else if (messages.length > 0 && container.scrollTop === 0) {
			container.scrollTop = container.scrollHeight;
		}
	}, [messages]);

	useEffect(() => {
		const handleEvent = async (event: Event) => {
			if (event.type !== "message.new") {
				return;
			}

			const msg = event.data as Message;

			try {
				const existing = await messageCache.getMessage(msg.id);
				await messageCache.saveMessages([msg]);
				const isUpdate = Boolean(existing);

				let shouldRefreshConversations = true;
				let conversation = await messageCache.getConversation(msg.conversationId);
				if (!conversation) {
					await syncConversationsFromServer();
					conversation = await messageCache.getConversation(msg.conversationId);
				}

				const isActiveConversation = msg.conversationId === selectedChatId;

				if (isActiveConversation) {
					const container = messagesContainerRef.current;
					if (container) {
						shouldScrollToBottom.current = checkShouldScroll(container);
					}

					await messageCache.updateConversationMeta(msg.conversationId, {
						lastSyncTimestamp: msg.createdAt,
						lastMessageSeq: msg.seq,
						unreadCount: 0,
					});
					await refreshMessages(msg.conversationId);
					if (!isUpdate) {
						await handleUpdateReadState(msg.conversationId, msg.seq);
						shouldRefreshConversations = false;
					}
				} else {
					if (isUpdate) {
						await messageCache.updateConversationMeta(msg.conversationId, {
							lastSyncTimestamp: msg.createdAt,
							lastMessageSeq: msg.seq,
						});
					} else {
						const unreadCount = (conversation?.unreadCount ?? 0) + 1;
						await messageCache.updateConversationMeta(msg.conversationId, {
							lastSyncTimestamp: msg.createdAt,
							lastMessageSeq: msg.seq,
							unreadCount,
						});
					}
				}
				if (shouldRefreshConversations) {
					await refreshConversations();
				}
			} catch (error) {
				console.error("Failed to process incoming message event:", error);
				return;
			}
		};

		const unsubscribe = eventManager.addListener(handleEvent);
		return unsubscribe;
	}, [
		handleUpdateReadState,
		refreshConversations,
		refreshMessages,
		selectedChatId,
		syncConversationsFromServer,
	]);

const loadMessagesForConversation = useCallback(
	async (conversationId: number) => {
		try {
			const cachedMessages = await refreshMessages(conversationId);

				const conversation = await messageCache.getConversation(conversationId);
				const lastSync =
					conversation?.lastSyncTimestamp ?? new Date(0).toISOString();

				const newMessages = await fetchMessages(conversationId, lastSync);
				if (newMessages.length > 0) {
					await messageCache.saveMessages(newMessages);
					const lastMessage = newMessages[newMessages.length - 1];
					await messageCache.updateConversationMeta(conversationId, {
						lastSyncTimestamp: lastMessage.createdAt,
						lastMessageSeq: lastMessage.seq,
					});
					await refreshMessages(conversationId);
					await refreshConversations();
					await handleUpdateReadState(conversationId, lastMessage.seq);
					return;
				}

				if (cachedMessages.length > 0) {
					const lastMessage = cachedMessages[cachedMessages.length - 1];
					await handleUpdateReadState(conversationId, lastMessage.seq);
				}
			} catch (error) {
				console.error("Failed to load messages:", error);
			}
	},
	[handleUpdateReadState, refreshConversations, refreshMessages],
);

useEffect(() => {
	if (!selectedChatId) {
		setMessages([]);
		return;
	}

	setHasOlderMessages(true);
	void loadMessagesForConversation(selectedChatId);

	const container = messagesContainerRef.current;
	if (container) {
		container.scrollTop = container.scrollHeight;
	}
}, [loadMessagesForConversation, selectedChatId]);

	const handleLoadOlderMessages = async () => {
		if (!selectedChatId || loadingOlder || !hasOlderMessages) return;

		setLoadingOlder(true);
		try {
			const oldestMessage = messages[0];
			if (!oldestMessage) {
				setHasOlderMessages(false);
				return;
			}

			const olderMessages = await fetchOlderMessages(
				selectedChatId,
				oldestMessage.createdAt,
			);
			if (olderMessages.length === 0) {
				setHasOlderMessages(false);
			} else {
				await messageCache.saveMessages(olderMessages);
				await refreshMessages(selectedChatId);
			}
		} catch (error) {
			console.error("Failed to load older messages:", error);
		} finally {
			setLoadingOlder(false);
		}
	};

	const handleSendMessage = async (body: string) => {
		if (!selectedChatId) return;

		try {
			const newMessage = await sendMessage(selectedChatId, body);
			await messageCache.saveMessages([newMessage]);
			await messageCache.updateConversationMeta(selectedChatId, {
				lastSyncTimestamp: newMessage.createdAt,
				lastMessageSeq: newMessage.seq,
			});

			const container = messagesContainerRef.current;
			if (container) {
				shouldScrollToBottom.current = checkShouldScroll(container);
			}
			await refreshMessages(selectedChatId);
			await refreshConversations();
			await handleUpdateReadState(selectedChatId, newMessage.seq);
		} catch (error) {
			console.error("Failed to send message:", error);
		}
	};

	const selectedConversation = conversations.find(
		(c) => c.id === selectedChatId,
	);

	const handleStartConversation = async (otherUserId: number) => {
		try {
			const conversation = await createDirectConversation(otherUserId);
			setShowNewConversation(false);

			await messageCache.saveConversations([conversation]);
			await refreshConversations();

			setSelectedChatId(conversation.id);
		} catch (error) {
			console.error("Failed to create conversation:", error);
		}
	};

	const handleStartCall = async () => {
		if (!selectedChatId || !selectedConversation?.otherUser) return;

		try {
			await startCall({
				conversationId: selectedChatId,
				username: selectedConversation.otherUser.username,
				profileImageUrl: selectedConversation.otherUser.profileImageUrl,
			});
		} catch (error) {
			console.error("Chats: Failed to start call:", error);
		}
	};

	const handleJoinCall = async (messageId: number) => {
		if (!selectedConversation?.otherUser) return;

		try {
			await answerCall({
				messageId,
				username: selectedConversation.otherUser.username,
				profileImageUrl: selectedConversation.otherUser.profileImageUrl,
			});
		} catch (error) {
			console.error("Failed to join call:", error);
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
			<ConversationList
				conversations={conversations}
				selectedChatId={selectedChatId}
				loading={loading}
				onSelectChat={setSelectedChatId}
				onNewConversation={() => setShowNewConversation(true)}
			/>
			<main
				className={`${selectedChatId ? "flex" : "hidden md:flex"} flex-1 bg-ctp-base flex-col`}
			>
				{selectedChatId && selectedConversation ? (
					<>
						<MessageList
							conversation={selectedConversation}
							messages={messages}
							hasOlderMessages={hasOlderMessages}
							loadingOlder={loadingOlder}
							messagesContainerRef={messagesContainerRef}
							onBack={() => setSelectedChatId(null)}
							onLoadOlder={handleLoadOlderMessages}
							onStartCall={
								selectedConversation.type === "dm" ? handleStartCall : undefined
							}
							onJoinCall={
								selectedConversation.type === "dm" ? handleJoinCall : undefined
							}
						/>
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
