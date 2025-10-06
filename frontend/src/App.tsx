// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "./UserContext";
import { CallProvider } from "./CallContext";
import { FloatingCallWindow } from "./components/FloatingCallWindow";
import Protected from "./Protected";
import Chats from "./Chats";
import Register from "./Register";
import Settings from "./Settings";

function App() {
	return (
		<UserProvider>
			<CallProvider>
				<BrowserRouter>
					<Routes>
						<Route
							path="/"
							element={
								<Protected>
									<Chats />
								</Protected>
							}
						/>
						<Route path="/register" element={<Register />} />
						<Route
							path="/settings"
							element={
								<Protected>
									<Settings />
								</Protected>
							}
						/>
					</Routes>
					<FloatingCallWindow />
				</BrowserRouter>
			</CallProvider>
		</UserProvider>
	);
}

export default App;
