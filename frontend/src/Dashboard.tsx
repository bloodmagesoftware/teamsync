// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { useUser } from "./UserContext";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";

export default function Dashboard() {
	const { user, logout } = useUser();
	const navigate = useNavigate();

	const handleLogout = () => {
		logout();
		navigate("/");
	};

	return (
		<div className="min-h-screen bg-ctp-base text-ctp-text p-8">
			<div className="flex justify-between items-center mb-8">
				<div className="flex items-center gap-4">
					<Avatar size="lg" />
					<div>
						<h1 className="text-3xl font-bold">Dashboard</h1>
						{user && (
							<p className="mt-2 text-ctp-subtext0">Welcome, {user.username}</p>
						)}
					</div>
				</div>
				<button
					onClick={handleLogout}
					className="px-4 py-2 bg-ctp-red text-ctp-base rounded hover:bg-ctp-maroon transition-colors"
				>
					Logout
				</button>
			</div>
			<p className="text-ctp-subtext0">Welcome to TeamSync</p>
		</div>
	);
}
