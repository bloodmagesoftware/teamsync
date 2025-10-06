// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect, useRef } from "react";
import { X } from "react-feather";
import Avatar from "../Avatar";
import { searchUsers, type UserSearchResult } from "../chatApi";

export function NewConversationDialog({
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
				const data = await searchUsers(searchQuery);
				setSearchResults(data);
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
