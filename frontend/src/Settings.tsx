// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "./UserContext";
import { ArrowLeft } from "react-feather";

type SettingsCategory = "profile" | "invitations" | "chat" | null;

export default function Settings() {
	const navigate = useNavigate();
	const { logout } = useUser();
	const [selectedCategory, setSelectedCategory] =
		useState<SettingsCategory>(null);

	const categories = [
		{ id: "profile" as const, label: "Profile" },
		{ id: "invitations" as const, label: "Invitations" },
		{ id: "chat" as const, label: "Chat" },
	];

	const handleLogout = () => {
		logout();
		navigate("/");
	};

	const renderCategoryContent = () => {
		switch (selectedCategory) {
			case "profile":
				return <ProfileSettings />;
			case "invitations":
				return <InvitationsSettings />;
			case "chat":
				return <ChatSettings />;
			default:
				return (
					<div className="hidden md:flex items-center justify-center h-full text-ctp-subtext0">
						Select a category from the sidebar
					</div>
				);
		}

		function ChatSettings() {
			const [enterSendsMessage, setEnterSendsMessage] = useState(false);
			const [loading, setLoading] = useState(true);
			const [saving, setSaving] = useState(false);

			useEffect(() => {
				fetchSettings();
			}, []);

			const fetchSettings = async () => {
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
				} finally {
					setLoading(false);
				}
			};

			const updateSettings = async (value: boolean) => {
				setSaving(true);
				try {
					const accessToken = localStorage.getItem("accessToken");
					const response = await fetch("/api/settings/chat", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ enterSendsMessage: value }),
					});

					if (response.ok) {
						const data = await response.json();
						setEnterSendsMessage(data.enterSendsMessage);
					}
				} catch (error) {
					console.error("Failed to update chat settings:", error);
				} finally {
					setSaving(false);
				}
			};

			const handleToggle = () => {
				const newValue = !enterSendsMessage;
				setEnterSendsMessage(newValue);
				updateSettings(newValue);
			};

			if (loading) {
				return <div>Loading...</div>;
			}

			return (
				<div>
					<h2 className="text-2xl font-bold mb-4">Chat Settings</h2>

					<div className="space-y-4">
						<label className="flex items-start justify-between p-4 bg-ctp-surface0 rounded">
							<div className="flex-1">
								<h3 className="font-semibold mb-2">Enter Key Behavior</h3>
								<p className="text-sm text-ctp-subtext0 mb-2">
									{enterSendsMessage ? (
										<>
											When active: pressing{" "}
											<kbd className="px-1 py-0.5 bg-ctp-surface1 rounded text-xs">
												Enter
											</kbd>{" "}
											will send your message and pressing{" "}
											<kbd className="px-1 py-0.5 bg-ctp-surface1 rounded text-xs">
												Shift+Enter
											</kbd>{" "}
											will write a newline.
										</>
									) : (
										<>
											When inactive: pressing{" "}
											<kbd className="px-1 py-0.5 bg-ctp-surface1 rounded text-xs">
												Enter
											</kbd>{" "}
											will write a newline and{" "}
											<kbd className="px-1 py-0.5 bg-ctp-surface1 rounded text-xs">
												Ctrl+Enter
											</kbd>{" "}
											will send the message.
										</>
									)}
								</p>
								<p className="text-xs text-ctp-subtext1">
									Note: On touch devices (like smartphones), Enter will never
									send.
								</p>
							</div>
							<button
								onClick={handleToggle}
								disabled={saving}
								className={`ml-4 relative w-12 h-6 rounded-full transition-colors ${
									enterSendsMessage ? "bg-ctp-blue" : "bg-ctp-surface2"
								} ${saving ? "opacity-50" : ""}`}
							>
								<div
									className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
										enterSendsMessage ? "translate-x-6" : ""
									}`}
								/>
							</button>
						</label>
					</div>
				</div>
			);
		}
	};

	return (
		<div className="flex h-screen">
			<aside
				className={`${selectedCategory ? "hidden md:block" : "block"} w-full md:w-64 bg-ctp-mantle p-4`}
			>
				<div className="flex items-center justify-left gap-2 mb-6">
					<button
						onClick={() => navigate("/")}
						className="px-3 py-1 bg-ctp-surface1 text-ctp-text rounded hover:bg-ctp-surface2 text-sm"
					>
						<ArrowLeft className="w-4 h-4" />
					</button>
					<h1 className="text-xl font-bold">Settings</h1>
				</div>
				<nav>
					<ul className="space-y-2">
						{categories.map((category) => (
							<li key={category.id}>
								<button
									onClick={() => setSelectedCategory(category.id)}
									className={`w-full text-left px-4 py-2 rounded ${
										selectedCategory === category.id
											? "bg-ctp-surface1 text-text"
											: "text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
									}`}
								>
									{category.label}
								</button>
							</li>
						))}
						<li>
							<button
								onClick={handleLogout}
								className="w-full text-left px-4 py-2 rounded text-ctp-red hover:bg-ctp-red hover:text-ctp-base"
							>
								Logout
							</button>
						</li>
					</ul>
				</nav>
			</aside>

			<main
				className={`${selectedCategory ? "block" : "hidden md:block"} flex-1 p-6 relative`}
			>
				{selectedCategory && (
					<button
						onClick={() => setSelectedCategory(null)}
						className="md:hidden mb-4 px-4 py-2 bg-ctp-surface0 rounded hover:bg-ctp-surface1 sticky top-0"
					>
						← Back
					</button>
				)}
				{renderCategoryContent()}
			</main>
		</div>
	);
}

function ProfileSettings() {
	const { user, checkAuth } = useUser();
	const [uploading, setUploading] = useState(false);

	const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith("image/")) {
			alert("Please select an image file");
			return;
		}

		setUploading(true);
		try {
			const formData = new FormData();
			formData.append("image", file);

			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/profile/image", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				body: formData,
			});

			if (response.ok) {
				await checkAuth();
			} else {
				const error = await response.json();
				alert(error.error || "Failed to upload image");
			}
		} catch (error) {
			console.error("Failed to upload profile image:", error);
			alert("Failed to upload image");
		} finally {
			setUploading(false);
		}
	};

	return (
		<div>
			<h2 className="text-2xl font-bold mb-4">Profile</h2>
			<p className="mb-4">Username: {user?.username}</p>

			<div className="mb-4">
				<h3 className="text-lg font-semibold mb-2">Profile Picture</h3>
				{user?.profileImageUrl ? (
					<img
						src={user.profileImageUrl}
						alt="Profile"
						className="w-32 h-32 rounded-full object-cover mb-4"
					/>
				) : (
					<div className="w-32 h-32 rounded-full bg-ctp-surface1 flex items-center justify-center text-4xl font-bold mb-4">
						{user?.username.charAt(0).toUpperCase()}
					</div>
				)}
				<label className="px-4 py-2 bg-ctp-blue text-ctp-base rounded hover:bg-ctp-sapphire cursor-pointer inline-block">
					{uploading ? "Uploading..." : "Upload New Picture"}
					<input
						type="file"
						accept="image/*"
						onChange={handleImageUpload}
						disabled={uploading}
						className="hidden"
					/>
				</label>
			</div>
		</div>
	);
}

interface Invitation {
	id: number;
	code: string;
	createdAt: string;
}

function InvitationsSettings() {
	const [invitations, setInvitations] = useState<Invitation[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		fetchInvitations();
	}, []);

	const fetchInvitations = async () => {
		setLoading(true);
		try {
			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/invitations", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (response.ok) {
				const data = await response.json();
				setInvitations(data);
			}
		} catch (error) {
			console.error("Failed to fetch invitations:", error);
		} finally {
			setLoading(false);
		}
	};

	const createInvitation = async () => {
		try {
			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/invitations", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (response.ok) {
				const newInvitation = await response.json();
				setInvitations([newInvitation, ...invitations]);
			}
		} catch (error) {
			console.error("Failed to create invitation:", error);
		}
	};

	const deleteInvitation = async (id: number) => {
		try {
			const accessToken = localStorage.getItem("accessToken");
			const response = await fetch("/api/invitations/delete", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ id }),
			});

			if (response.ok) {
				setInvitations(invitations.filter((inv) => inv.id !== id));
			}
		} catch (error) {
			console.error("Failed to delete invitation:", error);
		}
	};

	return (
		<div>
			<h2 className="text-2xl font-bold mb-4">Invitations</h2>
			<button
				onClick={createInvitation}
				className="mb-4 px-4 py-2 bg-ctp-blue text-ctp-base rounded hover:bg-ctp-sapphire hover:text-ctp-base"
			>
				Create Invitation
			</button>
			{loading ? (
				<p>Loading...</p>
			) : (
				<div className="space-y-2">
					{invitations.length === 0 ? (
						<p className="text-ctp-subtext0">No invitations yet</p>
					) : (
						invitations.map((invitation) => {
							const url = new URL(`/register`, window.location.href);
							url.searchParams.set("invite", invitation.code);
							const urlString = url.toString();

							return (
								<div
									key={invitation.id}
									className="flex justify-between items-center p-4 bg-ctp-surface0 rounded hover:bg-ctp-surface0"
								>
									<div>
										<a
											className="font-mono text-ctp-blue underline"
											href={urlString}
										>
											{urlString}
										</a>
										<p className="text-xs text-ctp-subtext0">
											{new Date(invitation.createdAt).toLocaleString()}
										</p>
									</div>
									<button
										onClick={() => deleteInvitation(invitation.id)}
										className="px-3 py-1 bg-ctp-red text-ctp-base rounded hover:bg-ctp-red hover:text-ctp-base"
									>
										Delete
									</button>
								</div>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}
