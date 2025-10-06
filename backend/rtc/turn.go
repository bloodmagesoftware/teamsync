// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

package rtc

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/bloodmagesoftware/teamsync/db"
	"github.com/pion/ice/v2"
	"github.com/pion/stun/v2"
	"github.com/pion/turn/v4"
)

const (
	defaultRealm          = "teamsync"
	defaultUsernamePrefix = "teamsync:"
	defaultListenAddress  = ":3478"
	turnAuthTimeout       = 2 * time.Second
)

// Config controls the embedded TURN/STUN server behaviour.
type Config struct {
	ListenAddress  string
	Realm          string
	UsernamePrefix string
	RelayAddress   net.IP
}

// Server hosts TURN (and by extension STUN) services for the application.
type Server struct {
	turnServer *turn.Server
	logger     *log.Logger
	closeOnce  sync.Once
	config     Config
}

// NewServer creates and starts a TURN server that shares credentials with the
// HTTP API. The caller is responsible for calling Close when shutting down.
func NewServer(queries *db.Queries, cfg Config, logger *log.Logger) (*Server, error) {
	if queries == nil {
		return nil, errors.New("turn: queries must not be nil")
	}

	if logger == nil {
		logger = log.Default()
	}

	listenAddress := cfg.ListenAddress
	if listenAddress == "" {
		listenAddress = defaultListenAddress
	}

	realm := cfg.Realm
	if realm == "" {
		realm = defaultRealm
	}

	usernamePrefix := cfg.UsernamePrefix
	if usernamePrefix == "" {
		usernamePrefix = defaultUsernamePrefix
	}

	relayIP, err := resolveRelayIP(cfg.RelayAddress)
	if err != nil {
		return nil, fmt.Errorf("turn: resolve relay IP: %w", err)
	}

	udpAddr, err := net.ResolveUDPAddr("udp", listenAddress)
	if err != nil {
		return nil, fmt.Errorf("turn: resolve udp listen address: %w", err)
	}

	tcpAddr, err := net.ResolveTCPAddr("tcp", listenAddress)
	if err != nil {
		return nil, fmt.Errorf("turn: resolve tcp listen address: %w", err)
	}

	packetConn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return nil, fmt.Errorf("turn: udp listen failed: %w", err)
	}

	listener, err := net.ListenTCP("tcp", tcpAddr)
	if err != nil {
		packetConn.Close()
		return nil, fmt.Errorf("turn: tcp listen failed: %w", err)
	}

	relayGenerator := &turn.RelayAddressGeneratorStatic{
		RelayAddress: relayIP,
		Address: func() string {
			if udpAddr.IP == nil || udpAddr.IP.IsUnspecified() {
				if relayIP.To4() != nil {
					return "0.0.0.0"
				}
				return "::"
			}
			return udpAddr.IP.String()
		}(),
	}

	authHandler := func(username, realmParam string, srcAddr net.Addr) ([]byte, bool) {
		if realmParam != realm {
			logger.Printf("TURN auth rejected for %s: unexpected realm %s", srcAddr, realmParam)
			return nil, false
		}

		if !strings.HasPrefix(username, usernamePrefix) {
			logger.Printf("TURN auth rejected for %s: username missing prefix", srcAddr)
			return nil, false
		}

		token := strings.TrimPrefix(username, usernamePrefix)
		if token == "" {
			logger.Printf("TURN auth rejected for %s: empty token", srcAddr)
			return nil, false
		}

		ctx, cancel := context.WithTimeout(context.Background(), turnAuthTimeout)
		defer cancel()

		oauthToken, err := queries.GetTokenByAccessToken(ctx, token)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				logger.Printf("TURN auth rejected for %s: token not found", srcAddr)
			} else {
				logger.Printf("TURN auth lookup error for %s: %v", srcAddr, err)
			}
			return nil, false
		}

		if time.Now().After(oauthToken.AccessTokenExpiresAt) {
			logger.Printf("TURN auth rejected for %s: token expired for user %d", srcAddr, oauthToken.UserID)
			return nil, false
		}

		key := turn.GenerateAuthKey(username, realm, token)
		return key, true
	}

	turnServer, err := turn.NewServer(turn.ServerConfig{
		Realm:       realm,
		AuthHandler: authHandler,
		PacketConnConfigs: []turn.PacketConnConfig{
			{
				PacketConn:            packetConn,
				RelayAddressGenerator: relayGenerator,
			},
		},
		ListenerConfigs: []turn.ListenerConfig{
			{
				Listener:              listener,
				RelayAddressGenerator: relayGenerator,
			},
		},
	})
	if err != nil {
		listener.Close()
		packetConn.Close()
		return nil, fmt.Errorf("turn: create server: %w", err)
	}

	ipFamily := relayIP.To4()
	var networkType ice.NetworkType
	if ipFamily != nil {
		networkType = ice.NetworkTypeUDP4
	} else {
		networkType = ice.NetworkTypeUDP6
	}

	transactionID := stun.NewTransactionID()
	logger.Printf(
		"TURN server ready on %s (realm=%s, relay=%s, network=%s, tid=%x)",
		listenAddress,
		realm,
		relayIP.String(),
		networkType.String(),
		transactionID,
	)

	return &Server{turnServer: turnServer, logger: logger, config: Config{
		ListenAddress:  listenAddress,
		Realm:          realm,
		UsernamePrefix: usernamePrefix,
		RelayAddress:   relayIP,
	}}, nil
}

// Close stops the TURN server and releases listeners.
func (s *Server) Close() error {
	var closeErr error
	s.closeOnce.Do(func() {
		if s.turnServer != nil {
			closeErr = s.turnServer.Close()
		}
	})
	return closeErr
}

// Config returns the effective TURN/STUN configuration in use.
func (s *Server) Config() Config {
	return s.config
}

func resolveRelayIP(provided net.IP) (net.IP, error) {
	if provided != nil {
		return provided, nil
	}

	if envIP := strings.TrimSpace(os.Getenv("TURN_RELAY_IP")); envIP != "" {
		ip := net.ParseIP(envIP)
		if ip == nil {
			return nil, fmt.Errorf("invalid TURN_RELAY_IP value: %q", envIP)
		}
		return ip, nil
	}

	var ipv6Candidate net.IP
	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if (iface.Flags&net.FlagUp) == 0 || (iface.Flags&net.FlagLoopback) != 0 {
				continue
			}
			addrs, addrsErr := iface.Addrs()
			if addrsErr != nil {
				continue
			}
			for _, addr := range addrs {
				var ip net.IP
				switch v := addr.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}
				if ip == nil || ip.IsLoopback() {
					continue
				}
				if ipv4 := ip.To4(); ipv4 != nil {
					return ipv4, nil
				}
				if ipv6Candidate == nil {
					ipv6Candidate = ip
				}
			}
		}
	}

	if ipv6Candidate != nil {
		return ipv6Candidate, nil
	}

	return net.ParseIP("127.0.0.1"), nil
}
