// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect, useRef } from "react";
import { messageCache } from "./messageCache";
import { eventManager, type Event } from "./eventManager";
import { ConversationList } from "./components/ConversationList";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { NewConversationDialog } from "./components/NewConversationDialog";
import {
	type Conversation,
	type Message,
	checkShouldScroll,
	scrollToBottom,
	sortConversationsByLastMessage,
	updateConversationUnreadCount,
	updateConversationLastMessage,
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
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(true);
	const [showNewConversation, setShowNewConversation] = useState(false);
	const [hasOlderMessages, setHasOlderMessages] = useState(true);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const shouldScrollToBottom = useRef(false);

	useEffect(() => {
		const initializeApp = async () => {
			await messageCache.init();
			await messageCache.cleanupOldMessages();
			await loadConversations();
			eventManager.start();
		};

		initializeApp();

		return () => {
			eventManager.stop();
		};
	}, []);

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
			if (event.type === "message.new") {
				const msg = event.data as Message;
				await messageCache.saveMessages([msg]);

				if (msg.conversationId === selectedChatId) {
					const container = messagesContainerRef.current;
					if (container) {
						shouldScrollToBottom.current = checkShouldScroll(container);
					}
					setMessages((prev) => [...prev, msg]);
					await handleUpdateReadState(msg.conversationId, msg.seq);
				} else {
					setConversations((prev) => {
						const conv = prev.find((c) => c.id === msg.conversationId);
						const newUnreadCount = (conv?.unreadCount ?? 0) + 1;
						return updateConversationUnreadCount(
							prev,
							msg.conversationId,
							newUnreadCount,
						);
					});
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

	const loadConversations = async () => {
		try {
			const data = await apiFetchConversations();
			setConversations(data);
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

			const newMessages = await fetchMessages(conversationId, lastSync);
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
				await handleUpdateReadState(conversationId, lastMessage.seq);
			}
		} catch (error) {
			console.error("Failed to load messages:", error);
		}
	};

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
				const reversedOlder = olderMessages.reverse();
				setMessages((prev) => [...reversedOlder, ...prev]);
			}
		} catch (error) {
			console.error("Failed to load older messages:", error);
		} finally {
			setLoadingOlder(false);
		}
	};

	const handleUpdateReadState = async (
		conversationId: number,
		lastReadSeq: number,
	) => {
		try {
			await markAsRead(conversationId, lastReadSeq);
			setConversations((prev) =>
				updateConversationUnreadCount(prev, conversationId, 0),
			);
		} catch (error) {
			console.error("Failed to update read state:", error);
		}
	};

	const handleSendMessage = async (body: string) => {
		if (!selectedChatId) return;

		try {
			const newMessage = await sendMessage(selectedChatId, body);
			await messageCache.saveMessages([newMessage]);
			await messageCache.updateConversationMeta(selectedChatId, {
				lastSyncTimestamp: newMessage.createdAt,
			});

			const container = messagesContainerRef.current;
			if (container) {
				shouldScrollToBottom.current = checkShouldScroll(container);
			}
			setMessages((prev) => [...prev, newMessage]);

			setConversations((prev) =>
				sortConversationsByLastMessage(
					updateConversationLastMessage(prev, selectedChatId, newMessage.seq),
				),
			);

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

			const existingConv = conversations.find((c) => c.id === conversation.id);
			if (!existingConv) {
				setConversations((prev) => [conversation, ...prev]);
			}

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
			console.error("Failed to start call:", error);
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
