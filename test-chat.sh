#!/bin/bash
# Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

set -e

BASE_URL="http://localhost:8080"

echo "Creating test users and starting a chat..."
echo ""

echo "1. Registering user1..."
USER1_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "password": "password123",
    "invitationCode": "test-invite-1"
  }')

USER1_TOKEN=$(echo "$USER1_RESPONSE" | jq -r '.accessToken')
USER1_ID=$(echo "$USER1_RESPONSE" | jq -r '.userId')
echo "User1 (alice) created with ID: $USER1_ID"

echo ""
echo "2. Registering user2..."
USER2_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "bob",
    "password": "password123",
    "invitationCode": "test-invite-2"
  }')

USER2_TOKEN=$(echo "$USER2_RESPONSE" | jq -r '.accessToken')
USER2_ID=$(echo "$USER2_RESPONSE" | jq -r '.userId')
echo "User2 (bob) created with ID: $USER2_ID"

echo ""
echo "3. User1 (alice) sending message to User2 (bob)..."
MSG1_RESPONSE=$(curl -s -X POST "$BASE_URL/api/messages/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -d "{
    \"otherUserId\": $USER2_ID,
    \"body\": \"Hello Bob! How are you?\"
  }")

CONV_ID=$(echo "$MSG1_RESPONSE" | jq -r '.conversationId')
echo "Message sent, conversation ID: $CONV_ID"

echo ""
echo "4. User2 (bob) replying..."
curl -s -X POST "$BASE_URL/api/messages/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER2_TOKEN" \
  -d "{
    \"conversationId\": $CONV_ID,
    \"body\": \"Hi Alice! I'm doing great, thanks for asking!\"
  }" | jq

echo ""
echo "5. User1 (alice) sending another message..."
curl -s -X POST "$BASE_URL/api/messages/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -d "{
    \"conversationId\": $CONV_ID,
    \"body\": \"That's wonderful! Want to grab coffee later?\"
  }" | jq

echo ""
echo "6. Fetching conversations for User1 (alice)..."
curl -s "$BASE_URL/api/conversations" \
  -H "Authorization: Bearer $USER1_TOKEN" | jq

echo ""
echo "7. Fetching messages for conversation $CONV_ID..."
curl -s "$BASE_URL/api/messages?conversationId=$CONV_ID" \
  -H "Authorization: Bearer $USER1_TOKEN" | jq

echo ""
echo "8. Testing user search for 'bob'..."
curl -s "$BASE_URL/api/users/search?q=bob" \
  -H "Authorization: Bearer $USER1_TOKEN" | jq

echo ""
echo "9. Testing get-or-create DM conversation..."
curl -s -X POST "$BASE_URL/api/conversations/dm" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -d "{
    \"otherUserId\": $USER2_ID
  }" | jq

echo ""
echo "Test complete!"
echo "You can now log in with:"
echo "  Username: alice, Password: password123"
echo "  Username: bob, Password: password123"
echo ""
echo "Try the 'Start a conversation' button to search for and message other users!"
