// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

package api

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
)

type callICEConfig struct {
	Urls []string `json:"urls"`
}

type callConfigResponse struct {
	ICEServers     []callICEConfig `json:"iceServers"`
	UsernamePrefix string          `json:"usernamePrefix"`
	Realm          string          `json:"realm"`
	RelayAddress   string          `json:"relayAddress"`
	Port           string          `json:"port"`
}

func (s *Server) handleCallConfig(w http.ResponseWriter, r *http.Request) {
	config := s.turnConfig

	host := hostFromRequest(r)
	if ip := config.RelayAddress; ip != nil {
		host = ip.String()
	}

	port := portFromListenAddress(config.ListenAddress)

	formattedHost := host
	if strings.Contains(formattedHost, ":") && !strings.HasPrefix(formattedHost, "[") {
		formattedHost = "[" + formattedHost + "]"
	}

	stunURL := "stun:" + formattedHost + ":" + port
	turnUDPURL := "turn:" + formattedHost + ":" + port + "?transport=udp"
	turnTCPURL := "turn:" + formattedHost + ":" + port + "?transport=tcp"

	response := callConfigResponse{
		ICEServers: []callICEConfig{
			{Urls: []string{stunURL}},
			{Urls: []string{turnUDPURL, turnTCPURL}},
		},
		UsernamePrefix: config.UsernamePrefix,
		Realm:          config.Realm,
		RelayAddress:   host,
		Port:           port,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func hostFromRequest(r *http.Request) string {
	hostPort := r.Host
	if hostPort == "" {
		hostPort = r.URL.Host
	}
	if hostPort == "" {
		return "localhost"
	}

	if strings.HasPrefix(hostPort, "[") {
		return strings.Trim(hostPort, "[]")
	}

	host, _, err := net.SplitHostPort(hostPort)
	if err == nil && host != "" {
		return host
	}

	return hostPort
}

func portFromListenAddress(listenAddress string) string {
	const fallbackPort = "3478"
	if listenAddress == "" {
		return fallbackPort
	}

	if strings.HasPrefix(listenAddress, ":") {
		port := strings.TrimPrefix(listenAddress, ":")
		if port != "" {
			return port
		}
		return fallbackPort
	}

	_, port, err := net.SplitHostPort(listenAddress)
	if err == nil && port != "" {
		return port
	}

	return fallbackPort
}
