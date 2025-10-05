// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useState, useEffect } from "react";
import { useUser } from "./UserContext";

type SettingsCategory = "profile" | "invitations" | null;

export default function Settings() {
	const [selectedCategory, setSelectedCategory] =
		useState<SettingsCategory>(null);

	const categories = [
		{ id: "profile" as const, label: "Profile" },
		{ id: "invitations" as const, label: "Invitations" },
	];

	const renderCategoryContent = () => {
		switch (selectedCategory) {
			case "profile":
				return <ProfileSettings />;
			case "invitations":
				return <InvitationsSettings />;
			default:
				return (
					<div className="hidden md:flex items-center justify-center h-full text-ctp-subtext0">
						Select a category from the sidebar
					</div>
				);
		}
	};

	return (
		<div className="flex h-screen">
			<aside
				className={`${selectedCategory ? "hidden md:block" : "block"} w-full md:w-64 bg-ctp-surface0 border-r border-surface1 p-4`}
			>
				<h1 className="text-xl font-bold mb-6">Settings</h1>
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
	const { user } = useUser();

	return (
		<div>
			<h2 className="text-2xl font-bold mb-4">Profile</h2>
			<p>Username: {user?.username}</p>
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
