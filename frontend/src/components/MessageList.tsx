// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { ArrowLeft, Video } from "react-feather";
import Avatar from "../Avatar";
import type { Conversation, Message } from "../chatUtils";
import { getConversationName, formatMessageTime } from "../chatUtils";
import { MessageContent } from "./MessageContent";

export function MessageList({
	conversation,
	messages,
	hasOlderMessages,
	loadingOlder,
	messagesContainerRef,
	onBack,
	onLoadOlder,
	onStartCall,
	onJoinCall,
}: {
	conversation: Conversation;
	messages: Message[];
	hasOlderMessages: boolean;
	loadingOlder: boolean;
	messagesContainerRef: React.RefObject<HTMLDivElement | null>;
	onBack: () => void;
	onLoadOlder: () => void;
	onStartCall?: () => void;
	onJoinCall?: (messageId: number) => void;
}) {
	return (
		<>
			<div className="p-4 border-b border-ctp-surface0 flex items-center gap-3">
				<button
					onClick={onBack}
					className="md:hidden p-2 hover:bg-ctp-surface0 rounded transition-colors"
				>
					<ArrowLeft className="w-5 h-5" />
				</button>
				<h2 className="text-lg font-semibold flex-1">
					{getConversationName(conversation)}
				</h2>
				{conversation.type === "dm" && onStartCall && (
					<button
						onClick={onStartCall}
						className="p-2 hover:bg-ctp-surface0 rounded transition-colors"
						title="Start video call"
					>
						<Video className="w-5 h-5" />
					</button>
				)}
			</div>
			<div
				ref={messagesContainerRef}
				className="flex-1 overflow-y-auto p-4 space-y-4"
			>
				{hasOlderMessages && messages.length > 0 && (
					<div className="flex justify-center mb-4">
						<button
							onClick={onLoadOlder}
							disabled={loadingOlder}
							className="px-4 py-2 text-sm bg-ctp-surface0 text-ctp-text rounded hover:bg-ctp-surface1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							{loadingOlder ? "Loading..." : "Load older messages"}
						</button>
					</div>
				)}
				{messages.map((msg) => (
					<div
						key={msg.id}
						className="grid grid-cols-[auto_1fr] grid-rows-[auto_auto] gap-x-2"
					>
						<Avatar
							size="sm"
							className="row-span-2 mt-1"
							imageUrl={msg.senderProfileImageUrl}
							username={msg.senderUsername}
						/>
						<div>
							<span className="font-semibold text-ctp-text mr-2 leading-none">
								{msg.senderUsername}
							</span>
							<span className="text-xs text-ctp-subtext0">
								{formatMessageTime(msg.createdAt)}
							</span>
						</div>
						<div className="col-start-2 max-w-full overflow-auto">
							<MessageContent
								body={msg.body}
								contentType={msg.contentType}
								messageId={msg.id}
								editedAt={msg.editedAt}
								onJoinCall={msg.contentType === "application/call" ? () => onJoinCall?.(msg.id) : undefined}
							/>
						</div>
					</div>
				))}
			</div>
		</>
	);
}
