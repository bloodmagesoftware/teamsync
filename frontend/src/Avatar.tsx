import { useUser } from "./UserContext";

interface AvatarProps {
	size?: "sm" | "md" | "lg";
	className?: string;
	imageUrl?: string | null;
	username?: string;
}

export default function Avatar({
	size = "md",
	className = "",
	imageUrl,
	username,
}: AvatarProps) {
	const { user } = useUser();

	const sizeClasses = {
		sm: "w-8 h-8 text-sm",
		md: "w-12 h-12 text-lg",
		lg: "w-16 h-16 text-2xl",
	};

	const sizeClass = sizeClasses[size];

	const displayImageUrl = imageUrl !== undefined ? imageUrl : user?.profileImageUrl;
	const displayUsername = username || user?.username || "?";

	if (displayImageUrl) {
		return (
			<img
				src={displayImageUrl}
				alt={displayUsername}
				className={`${sizeClass} rounded-full object-cover ${className}`}
			/>
		);
	}

	return (
		<div
			className={`${sizeClass} rounded-full bg-ctp-surface1 flex items-center justify-center font-bold ${className}`}
		>
			{displayUsername.charAt(0).toUpperCase()}
		</div>
	);
}
