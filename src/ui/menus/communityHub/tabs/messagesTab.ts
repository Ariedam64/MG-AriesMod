import { style, ensureSharedStyles, formatRelativeTimeShort, formatMessageTime, CH_EVENTS, createKeyBlocker, createPlayerBadges } from "../shared";
import {
  getCachedFriendConversations,
  getCachedFriendConversationMessages,
  getCachedGroupConversations,
  getCachedGroupConversationMessages,
  getCurrentPlayerId,
  onWelcome,
  markFriendConversationAsRead,
  markGroupConversationAsRead,
  addMessageToFriendConversationCache,
  addMessageToGroupConversationCache,
  updatePendingFriendMessage,
  updatePendingGroupMessage,
  getTotalFriendUnreadCount,
  getTotalGroupUnreadCount,
  getWelcomeCache,
  updateFriendConversationsCache,
  getCachedFriendsWithViews,
  ensureGroupConversationExists,
} from "../../../../ariesModAPI";
import { sendMessage, markMessagesRead } from "../../../../ariesModAPI/endpoints/messages";
import { sendGroupMessage, markGroupMessagesAsRead } from "../../../../ariesModAPI/endpoints/groups";
import type { CachedFriendConversation, CachedGroupConversation, CachedDirectMessage, CachedGroupMessage } from "../../../../ariesModAPI";
import type { DirectMessage, GroupMessage } from "../../../../ariesModAPI/types";
import { createImportButton, createAttachmentState, parseGemTokens, createTokenCardsContainer, createTeamSelectionView, buildTeamToken } from "./chatImporter";
import { isDiscordSurface } from "../../../../utils/api";
import { isGroupMuted, toggleGroupMute } from "../notificationSound";

declare const GM_openInTab:
  | ((url: string, opts?: { active?: boolean; insert?: boolean; setParent?: boolean }) => void)
  | undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function createMessagesTab() {
  ensureSharedStyles();

  const root = document.createElement("div");
  style(root, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  });

  type SubTab = "friends" | "groups";
  let activeSubTab: SubTab = "friends";
  // For friends: conversationId string; for groups: groupId as string
  let selectedId: string | null = null;
  let currentDetailView: HTMLElement | null = null;

  // ── Sub-tabs header ──────────────────────────────────────────────────────

  const tabsHeader = document.createElement("div");
  style(tabsHeader, {
    display: "flex",
    gap: "8px",
    padding: "0 0 12px 0",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    marginBottom: "0",
    flexShrink: "0",
  });

  const friendsBtn = createSubTabButton("Friends", true);
  const groupsBtn = createSubTabButton("Groups", false);
  tabsHeader.append(friendsBtn, groupsBtn);

  // ── Chat area (conversation list + thread) ───────────────────────────────

  const chatArea = document.createElement("div");
  style(chatArea, {
    display: "grid",
    gridTemplateColumns: "220px 1fr",
    flex: "1",
    minHeight: "0",
    overflow: "hidden",
  });

  // ── Left: conversation list ──────────────────────────────────────────────

  const listPanel = document.createElement("div");
  style(listPanel, {
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
  });

  // Search
  const searchWrap = document.createElement("div");
  style(searchWrap, {
    padding: "12px 10px 8px",
    flexShrink: "0",
  });

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search...";
  style(searchInput, {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "12px",
    outline: "none",
    transition: "border-color 150ms ease",
  });
  searchInput.onfocus = () => style(searchInput, { borderColor: "rgba(94,234,212,0.35)" });
  searchInput.onblur = () => style(searchInput, { borderColor: "rgba(255,255,255,0.1)" });

  searchWrap.appendChild(searchInput);

  // Conversation list
  const convList = document.createElement("div");
  convList.className = "qws-ch-scrollable-narrow";
  style(convList, {
    flex: "1",
    overflow: "auto",
    padding: "4px 6px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  });

  listPanel.append(searchWrap, convList);

  // ── Right: thread panel ──────────────────────────────────────────────────

  const threadPanel = document.createElement("div");
  style(threadPanel, {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: "0",
  });

  // Thread header
  const threadHeader = document.createElement("div");
  style(threadHeader, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: "0",
    minHeight: "48px",
  });

  const threadAvatar = document.createElement("div");
  style(threadAvatar, {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, rgba(94,234,212,0.25), rgba(59,130,246,0.25))",
    flexShrink: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: "700",
    color: "#dbe7f5",
  });

  const threadInfo = document.createElement("div");
  style(threadInfo, {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    minWidth: "0",
  });

  const threadNameRow = document.createElement("div");
  style(threadNameRow, { display: "flex", alignItems: "center", gap: "6px", minWidth: "0" });

  const threadName = document.createElement("div");
  style(threadName, {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  threadName.textContent = "Select a conversation";

  const threadBadgesContainer = document.createElement("div");
  style(threadBadgesContainer, { flexShrink: "0", display: "none" });

  threadNameRow.append(threadName, threadBadgesContainer);

  const threadStatus = document.createElement("div");
  style(threadStatus, {
    fontSize: "11px",
    color: "rgba(226,232,240,0.5)",
  });

  threadInfo.append(threadNameRow, threadStatus);

  // SVG icons for mute button (Lucide style, stroke-based)
  const BELL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
  const BELL_OFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.7 3A6 6 0 0 1 18 8c0 2.1.5 3.8 1.1 5.2"/><path d="M3.7 3.7 2 2"/><path d="m22 22-1.7-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 12.3c0 1 .2 1.9.5 2.7H3s3-2 3-9a5.97 5.97 0 0 1 .8-3"/></svg>`;

  // Mute button (visible only for group threads)
  const muteBtn = document.createElement("button");
  muteBtn.title = "Mute notifications";
  style(muteBtn, {
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    width: "30px",
    height: "30px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.03)",
    cursor: "pointer",
    marginLeft: "auto",
    flexShrink: "0",
    transition: "all 150ms ease",
    color: "rgba(226,232,240,0.5)",
    padding: "0",
    outline: "none",
  });
  muteBtn.innerHTML = BELL_SVG;
  muteBtn.onmouseenter = () => {
    muteBtn.style.background = "rgba(255,255,255,0.08)";
    muteBtn.style.borderColor = "rgba(255,255,255,0.12)";
  };
  muteBtn.onmouseleave = () => {
    const muted = muteBtn.dataset.muted === "true";
    muteBtn.style.background = muted ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.03)";
    muteBtn.style.borderColor = muted ? "rgba(94,234,212,0.2)" : "rgba(255,255,255,0.06)";
  };

  threadHeader.append(threadAvatar, threadInfo, muteBtn);

  // Thread body (messages)
  const threadBody = document.createElement("div");
  threadBody.className = "qws-ch-scrollable-narrow";
  style(threadBody, {
    flex: "1",
    overflow: "auto",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minHeight: "0",
  });

  // Empty state
  const emptyState = document.createElement("div");
  style(emptyState, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: "1",
    gap: "12px",
    color: "rgba(226,232,240,0.4)",
  });
  const emptyIcon = document.createElement("div");
  style(emptyIcon, { fontSize: "32px", opacity: "0.5" });
  emptyIcon.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  const emptyText = document.createElement("div");
  style(emptyText, { fontSize: "13px" });
  emptyText.textContent = "Select a conversation to start chatting";
  emptyState.append(emptyIcon, emptyText);
  threadBody.appendChild(emptyState);

  // Input bar
  const inputBar = document.createElement("div");
  style(inputBar, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    flexShrink: "0",
  });

  // Input wrapper (relative container for emoji button overlay)
  const inputWrapper = document.createElement("div");
  style(inputWrapper, {
    flex: "1",
    position: "relative",
    display: "flex",
    alignItems: "center",
  });

  const msgInput = document.createElement("input");
  msgInput.type = "text";
  msgInput.placeholder = "Select a conversation...";
  msgInput.disabled = true;
  msgInput.maxLength = 1000;
  style(msgInput, {
    flex: "1",
    padding: "10px 40px 10px 12px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "13px",
    outline: "none",
    opacity: "0.4",
    cursor: "not-allowed",
    transition: "border-color 150ms ease, opacity 150ms ease",
  });
  msgInput.onfocus = () => { if (!msgInput.disabled) style(msgInput, { borderColor: "rgba(94,234,212,0.35)" }); };
  msgInput.onblur = () => style(msgInput, { borderColor: "rgba(255,255,255,0.1)" });

  // ── Emoji button + picker ────────────────────────────────────────────────
  const emojiWrap = document.createElement("div");
  style(emojiWrap, {
    position: "absolute",
    right: "6px",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: "1",
  });

  const emojiBtn = document.createElement("button");
  emojiBtn.type = "button";
  emojiBtn.textContent = "\u{1F60A}";
  style(emojiBtn, {
    width: "30px",
    height: "30px",
    borderRadius: "6px",
    border: "none",
    background: "transparent",
    color: "#e7eef7",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    opacity: "0.5",
    transition: "opacity 150ms ease, background 150ms ease",
    padding: "0",
  });
  emojiBtn.onmouseenter = () => { if (!msgInput.disabled) style(emojiBtn, { opacity: "1" }); };
  emojiBtn.onmouseleave = () => { if (!emojiBtn.dataset.active) style(emojiBtn, { opacity: "0.5" }); };

  const emojiPickerWrap = document.createElement("div");
  style(emojiPickerWrap, {
    position: "absolute",
    right: "0",
    bottom: "38px",
    zIndex: "10",
    display: "none",
  });

  let emojiPickerInstance: HTMLElement | null = null;

  async function loadEmojiPicker(): Promise<void> {
    if (emojiPickerInstance) return;
    try {
      const { Picker } = await import("emoji-picker-element");
      const picker = new Picker({
        locale: "en",
        dataSource: "https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/emojibase/data.json",
      });

      picker.style.cssText = `
        --background: #0f141e;
        --border-color: rgba(255,255,255,0.1);
        --indicator-color: #5eead4;
        --input-border-color: rgba(255,255,255,0.12);
        --input-font-color: #e7eef7;
        --input-placeholder-color: rgba(226,232,240,0.4);
        --outline-color: #5eead4;
        --category-emoji-size: 1.125rem;
        --emoji-size: 1.25rem;
        --num-columns: 8;
        --category-font-color: rgba(226,232,240,0.5);
        --button-active-background: rgba(94,234,212,0.15);
        --button-hover-background: rgba(94,234,212,0.1);
        --input-border-radius: 8px;
        --input-padding: 0.4rem 0.6rem;
        --category-font-size: 0.9rem;
        width: 320px;
        height: 350px;
        border-radius: 12px;
        border: 1px solid rgba(94,234,212,0.2);
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      `;

      picker.addEventListener("emoji-click", (event: unknown) => {
        const detail = (event as CustomEvent).detail;
        const emoji: string = detail.unicode || detail.emoji?.unicode || "";
        if (!emoji) return;
        insertEmojiIntoInput(emoji);
        closeEmojiPicker();
      });

      emojiPickerInstance = picker;
      emojiPickerWrap.appendChild(picker);
    } catch (err) {
      console.error("[messagesTab] Failed to load emoji picker:", err);
    }
  }

  function insertEmojiIntoInput(emoji: string): void {
    const start = msgInput.selectionStart || 0;
    const end = msgInput.selectionEnd || 0;
    const text = msgInput.value;
    msgInput.value = text.substring(0, start) + emoji + text.substring(end);
    msgInput.selectionStart = msgInput.selectionEnd = start + emoji.length;
    msgInput.focus();
  }

  function closeEmojiPicker(): void {
    style(emojiPickerWrap, { display: "none" });
    delete emojiBtn.dataset.active;
    style(emojiBtn, { opacity: "0.5", background: "transparent" });
    document.removeEventListener("click", onClickOutsideEmoji);
  }

  function onClickOutsideEmoji(e: MouseEvent): void {
    if (!emojiWrap.contains(e.target as Node)) {
      closeEmojiPicker();
    }
  }

  emojiBtn.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    if (msgInput.disabled) return;
    const isVisible = emojiPickerWrap.style.display !== "none";
    if (isVisible) {
      closeEmojiPicker();
    } else {
      void loadEmojiPicker();
      style(emojiPickerWrap, { display: "block" });
      emojiBtn.dataset.active = "1";
      style(emojiBtn, { opacity: "1", background: "rgba(94,234,212,0.15)" });
      setTimeout(() => document.addEventListener("click", onClickOutsideEmoji), 0);
    }
  };

  emojiWrap.append(emojiBtn, emojiPickerWrap);
  inputWrapper.append(msgInput, emojiWrap);

  // ── Attachment state + import "+" button ─────────────────────────────────────
  const attachments = createAttachmentState();

  const importBtn = createImportButton({
    onAttach: (token) => {
      if (msgInput.disabled) return;
      attachments.add(token);
      msgInput.focus();
    },
    onShowTeamSelection: async () => {
      // Hide main chat UI
      style(tabsHeader, { display: "none" });
      style(chatArea, { display: "none" });

      // Show team selection view
      const teamView = await createTeamSelectionView({
        onTeamSelected: (team, pets) => {
          // Build token and add it
          const token = buildTeamToken(team, pets);
          if (token && !msgInput.disabled) {
            attachments.add(token);
            msgInput.focus();
          }
          // Go back to chat
          if (currentDetailView) {
            currentDetailView.remove();
            currentDetailView = null;
          }
          style(tabsHeader, { display: "flex" });
          style(chatArea, { display: "grid" });
        },
        onBack: () => {
          // Go back to chat
          if (currentDetailView) {
            currentDetailView.remove();
            currentDetailView = null;
          }
          style(tabsHeader, { display: "flex" });
          style(chatArea, { display: "grid" });
        },
      });

      currentDetailView = teamView;
      root.appendChild(teamView);
    },
  });

  const sendBtn = document.createElement("button");
  style(sendBtn, {
    padding: "9px 16px",
    border: "1px solid rgba(94,234,212,0.35)",
    borderRadius: "10px",
    background: "rgba(94,234,212,0.15)",
    color: "#5eead4",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "not-allowed",
    opacity: "0.4",
    flexShrink: "0",
    transition: "all 120ms ease",
  });
  sendBtn.textContent = "Send";

  let isSending = false;

  function setInputEnabled(enabled: boolean): void {
    msgInput.disabled = !enabled;
    msgInput.placeholder = enabled ? "Type a message..." : "Select a conversation...";
    style(msgInput, {
      opacity: enabled ? "1" : "0.4",
      cursor: enabled ? "text" : "not-allowed",
    });
    style(sendBtn, {
      opacity: enabled ? "1" : "0.4",
      cursor: enabled ? "pointer" : "not-allowed",
      pointerEvents: enabled ? "auto" : "none",
    });
  }

  async function handleSend(): Promise<void> {
    const rawText = msgInput.value.trim();
    const tokensSuffix = attachments.buildTokensString();
    // Combine text + attachment tokens
    const text = tokensSuffix
      ? (rawText ? rawText + " " + tokensSuffix : tokensSuffix)
      : rawText;
    if (!text || !selectedId || isSending) return;

    isSending = true;
    style(sendBtn, { opacity: "0.5", pointerEvents: "none" });
    msgInput.value = "";
    attachments.clear();

    const currentPlayerId = getCurrentPlayerId();
    const tempId = -Date.now(); // Negative temporary ID

    try {
      if (activeSubTab === "friends") {
        const conv = getCachedFriendConversations().find((c) => c.conversationId === selectedId);
        if (!conv) return;

        // Add optimistic pending message
        const pendingMsg: DirectMessage = {
          id: tempId,
          conversationId: selectedId,
          senderId: currentPlayerId || "",
          recipientId: conv.otherPlayerId,
          body: text,
          createdAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString(),
          readAt: null,
        };
        addMessageToFriendConversationCache(selectedId, pendingMsg, "pending");
        renderConversationList(searchInput.value);
        renderThread();

        // Send to server
        const result = await sendMessage({ toPlayerId: conv.otherPlayerId, text });
        if (result) {
          updatePendingFriendMessage(selectedId, tempId, result);
        }
      } else {
        const groupId = Number(selectedId);

        // Add optimistic pending message
        const pendingMsg: GroupMessage = {
          id: tempId,
          groupId: selectedId,
          senderId: currentPlayerId || "",
          body: text,
          createdAt: new Date().toISOString(),
        };
        addMessageToGroupConversationCache(groupId, pendingMsg, "pending");
        renderConversationList(searchInput.value);
        renderThread();

        // Send to server
        const result = await sendGroupMessage({ groupId: selectedId, text });
        if (result) {
          // Server returns { groupId, message: { id, senderId, body, createdAt } }
          const msg = (result as Record<string, unknown>).message as Record<string, unknown> | undefined;
          const groupMsg: GroupMessage = {
            id: (msg?.id as number) ?? (result.id || 0),
            groupId: selectedId,
            senderId: (msg?.senderId as string) ?? (result.senderId || ""),
            body: (msg?.body as string) ?? (result.body || result.text || ""),
            createdAt: (msg?.createdAt as string) ?? (result.createdAt || new Date().toISOString()),
          };
          updatePendingGroupMessage(groupId, tempId, groupMsg);
        }
      }
    } catch (err) {
      console.error("[messages] send failed:", err);
    } finally {
      isSending = false;
      if (selectedId) {
        style(sendBtn, { opacity: "1", pointerEvents: "auto" });
      }
    }
  }

  sendBtn.onclick = () => void handleSend();
  inputBar.append(importBtn.element, inputWrapper, sendBtn);
  threadPanel.append(threadHeader, threadBody, attachments.barElement, inputBar);
  chatArea.append(listPanel, threadPanel);
  root.append(tabsHeader, chatArea);

  // ── Enter key handler (BEFORE keyBlocker, in capture phase) ───────────────

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (document.activeElement === msgInput && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation(); // Stop propagation so keyBlocker doesn't interfere
      void handleSend();
    }
  }, true); // capture phase - executes BEFORE keyBlocker

  // ── Key blocker ────────────────────────────────────────────────────────────

  const keyBlocker = createKeyBlocker(() =>
    document.activeElement === searchInput
    || document.activeElement === msgInput
    || (emojiPickerInstance !== null && document.activeElement === emojiPickerInstance),
  );
  keyBlocker.attach();

  // ── Render logic — Friends ─────────────────────────────────────────────────

  function renderFriendConversationList(filter: string = ""): void {
    convList.innerHTML = "";
    const conversations = getCachedFriendConversations();
    const query = filter.toLowerCase();
    const filtered = query
      ? conversations.filter((c) => (c.otherPlayerName || "").toLowerCase().includes(query))
      : conversations;

    if (filtered.length === 0) {
      convList.appendChild(createEmptyListItem(query));
      return;
    }

    filtered.sort(conversationSortComparator);

    for (const conv of filtered) {
      convList.appendChild(createFriendConversationRow(conv));
    }
  }

  function createFriendConversationRow(conv: CachedFriendConversation): HTMLElement {
    const row = document.createElement("div");
    const isActive = conv.conversationId === selectedId;
    const hasUnread = (conv.unreadCount ?? 0) > 0;
    const newest = getNewestMessage(conv.messages);

    applyRowStyle(row, isActive);
    row.onmouseenter = () => { if (conv.conversationId !== selectedId) style(row, { background: "rgba(255,255,255,0.04)" }); };
    row.onmouseleave = () => { if (conv.conversationId !== selectedId) style(row, { background: "transparent", border: "1px solid transparent" }); };

    // Avatar
    const avatarEl = createAvatarEl(conv.otherPlayerAvatarUrl, conv.otherPlayerName, false);

    // Meta
    const meta = createRowMeta(
      conv.otherPlayerName || "Unknown",
      parseGemTokens(newest?.body ?? "").text || "Shared an attachment",
      newest?.createdAt,
      hasUnread,
      conv.unreadCount,
    );

    row.append(avatarEl, meta);
    row.onclick = () => selectConversation(conv.conversationId);
    return row;
  }

  function renderFriendThread(): void {
    threadBody.innerHTML = "";
    if (!selectedId) { showEmptyThread(); return; }

    const conv = getCachedFriendConversations().find((c) => c.conversationId === selectedId);
    if (!conv) return;

    // Header — look up friend badges from cache
    const friendData = getCachedFriendsWithViews().find((f) => f.playerId === conv.otherPlayerId);
    updateThreadHeader(conv.otherPlayerAvatarUrl, conv.otherPlayerName || "Unknown", null, false, friendData?.badges);

    const messages = sortChronological(getCachedFriendConversationMessages(selectedId));
    const currentPlayerId = getCurrentPlayerId();

    if (messages.length === 0) { showNoMessages(); return; }

    // Find last outgoing message ID
    let lastOutgoingId = 0;
    for (const msg of messages) {
      if (msg.senderId === currentPlayerId && msg.id > lastOutgoingId) {
        lastOutgoingId = msg.id;
      }
    }

    // Check if the very last message in the conversation is incoming
    // If so, don't show status on our last outgoing message (they've obviously seen it)
    const lastMessage = messages[messages.length - 1];
    const lastMessageIsIncoming = lastMessage && lastMessage.senderId !== currentPlayerId;

    let lastDateLabel = "";
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const dateLabel = formatDateLabel(msg.createdAt);
      const hasDateSep = dateLabel !== "" && dateLabel !== lastDateLabel;
      if (hasDateSep) {
        threadBody.appendChild(createDateSeparator(dateLabel));
        lastDateLabel = dateLabel;
      }
      const prev = i > 0 ? messages[i - 1] : null;
      const next = i < messages.length - 1 ? messages[i + 1] : null;
      const nextDateLabel = next ? formatDateLabel(next.createdAt) : "";
      const isFirstInGroup = !prev || hasDateSep || !isSameMessageGroup(prev, msg);
      const isLastInGroup = !next || (nextDateLabel !== "" && nextDateLabel !== lastDateLabel) || !isSameMessageGroup(msg, next);
      const isOutgoing = msg.senderId === currentPlayerId;
      const isLastOutgoing = isOutgoing && msg.id === lastOutgoingId;
      threadBody.appendChild(createFriendMessageBubble(msg, isOutgoing, isLastOutgoing, lastMessageIsIncoming, conv, isFirstInGroup, isLastInGroup));
    }
    scrollToBottom();
  }

  function createFriendMessageBubble(msg: CachedDirectMessage, isOutgoing: boolean, isLastOutgoing: boolean, lastMessageIsIncoming: boolean, conv: CachedFriendConversation, isFirstInGroup: boolean, isLastInGroup: boolean): HTMLElement {
    const wrapper = document.createElement("div");
    style(wrapper, {
      display: "flex",
      gap: "8px",
      alignItems: "center",
      justifyContent: isOutgoing ? "flex-end" : "flex-start",
    });

    if (!isOutgoing) {
      if (isLastInGroup) {
        wrapper.appendChild(createSmallAvatar(conv.otherPlayerAvatarUrl, conv.otherPlayerName));
      } else {
        const spacer = document.createElement("div");
        style(spacer, { width: "28px", flexShrink: "0" });
        wrapper.appendChild(spacer);
      }
    }

    // Determine status for last outgoing message
    let status: "pending" | "sent" | "read" | undefined = undefined;
    if (isLastOutgoing && !lastMessageIsIncoming) {
      if (msg._status) {
        status = msg._status;
      } else {
        status = msg.readAt ? "read" : "sent";
      }
    }

    const bubble = createBubbleContent(msg.body, msg.createdAt, isOutgoing, status, isLastInGroup);
    wrapper.appendChild(bubble);
    if (!isFirstInGroup) style(wrapper, { marginTop: "-4px" });
    return wrapper;
  }

  // ── Render logic — Groups ──────────────────────────────────────────────────

  function renderGroupConversationList(filter: string = ""): void {
    convList.innerHTML = "";
    const groups = getCachedGroupConversations();
    const query = filter.toLowerCase();
    const filtered = query
      ? groups.filter((g) => (g.groupName || "").toLowerCase().includes(query))
      : groups;

    if (filtered.length === 0) {
      convList.appendChild(createEmptyListItem(query));
      return;
    }

    filtered.sort(conversationSortComparator);

    for (const g of filtered) {
      convList.appendChild(createGroupConversationRow(g));
    }
  }

  function createGroupConversationRow(group: CachedGroupConversation): HTMLElement {
    const row = document.createElement("div");
    const groupKey = String(group.groupId);
    const isActive = groupKey === selectedId;
    const hasUnread = (group.unreadCount ?? 0) > 0;
    const newest = getNewestMessage(group.messages);

    applyRowStyle(row, isActive);
    row.onmouseenter = () => { if (groupKey !== selectedId) style(row, { background: "rgba(255,255,255,0.04)" }); };
    row.onmouseleave = () => { if (groupKey !== selectedId) style(row, { background: "transparent", border: "1px solid transparent" }); };

    // Get full group info from welcome cache
    const welcome = getWelcomeCache();
    const fullGroup = welcome?.groups?.find((g) => String(g.id) === groupKey);
    const previewMembers = fullGroup?.previewMembers || [];
    const memberCount = fullGroup?.memberCount || 0;

    // Container for vertical layout
    const container = document.createElement("div");
    style(container, { display: "flex", flexDirection: "column", gap: "6px", flex: "1", minWidth: "0" });

    // Top row: group name + time + unread badge
    const topRow = document.createElement("div");
    style(topRow, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" });

    const nameEl = document.createElement("div");
    style(nameEl, {
      fontSize: "13px",
      fontWeight: hasUnread ? "700" : "500",
      color: hasUnread ? "#ecfdf5" : "#e7eef7",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      flex: "1",
      minWidth: "0",
    });
    nameEl.textContent = group.groupName || "Group";

    // Muted indicator in conversation list
    if (isGroupMuted(group.groupId)) {
      const mutedIcon = document.createElement("span");
      mutedIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.7 3A6 6 0 0 1 18 8c0 2.1.5 3.8 1.1 5.2"/><path d="M3.7 3.7 2 2"/><path d="m22 22-1.7-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 12.3c0 1 .2 1.9.5 2.7H3s3-2 3-9a5.97 5.97 0 0 1 .8-3"/></svg>`;
      style(mutedIcon, { display: "inline-flex", alignItems: "center", marginLeft: "4px", color: "rgba(94,234,212,0.45)", flexShrink: "0", verticalAlign: "middle" });
      nameEl.appendChild(mutedIcon);
    }

    const rightSection = document.createElement("div");
    style(rightSection, { display: "flex", alignItems: "center", gap: "6px", flexShrink: "0" });

    const time = document.createElement("div");
    style(time, {
      fontSize: "10px",
      color: hasUnread ? "#5eead4" : "rgba(226,232,240,0.4)",
      fontWeight: hasUnread ? "600" : "400",
    });
    if (newest?.createdAt) time.textContent = formatRelativeTimeShort(newest.createdAt);

    if (hasUnread && group.unreadCount > 0) {
      const badge = document.createElement("div");
      style(badge, {
        minWidth: "18px",
        height: "18px",
        padding: "0 5px",
        borderRadius: "999px",
        background: "#ef4444",
        color: "#fff",
        fontSize: "10px",
        fontWeight: "700",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      });
      badge.textContent = String(group.unreadCount);
      rightSection.append(time, badge);
    } else {
      rightSection.appendChild(time);
    }

    topRow.append(nameEl, rightSection);

    // Bottom row: preview avatars + member count
    const bottomRow = document.createElement("div");
    style(bottomRow, { display: "flex", alignItems: "center", gap: "6px" });

    const avatarsContainer = document.createElement("div");
    style(avatarsContainer, { display: "flex", marginLeft: "-4px" });

    for (let i = 0; i < Math.min(3, previewMembers.length); i++) {
      const member = previewMembers[i];
      const avatar = document.createElement("div");
      style(avatar, {
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        background: member.discordAvatarUrl
          ? `url(${member.discordAvatarUrl}) center/cover`
          : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
        border: "1.5px solid #0f141e",
        marginLeft: i > 0 ? "-6px" : "0",
        flexShrink: "0",
      });
      avatarsContainer.appendChild(avatar);
    }

    // Member count
    const memberCountEl = document.createElement("div");
    style(memberCountEl, {
      fontSize: "10px",
      color: "rgba(226,232,240,0.45)",
      marginLeft: "4px",
    });
    memberCountEl.textContent = `${memberCount} member${memberCount !== 1 ? 's' : ''}`;

    // Message preview (if no avatars)
    if (previewMembers.length === 0) {
      const preview = document.createElement("div");
      style(preview, {
        fontSize: "11px",
        color: "rgba(226,232,240,0.45)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: "1",
      });
      preview.textContent = parseGemTokens((newest?.body || newest?.text) ?? "").text || "Shared an attachment";
      bottomRow.appendChild(preview);
    } else {
      bottomRow.append(avatarsContainer, memberCountEl);
    }

    container.append(topRow, bottomRow);
    row.appendChild(container);
    row.onclick = () => selectConversation(groupKey);
    return row;
  }

  function renderGroupThread(): void {
    threadBody.innerHTML = "";
    if (!selectedId) { showEmptyThread(); return; }

    const groupId = Number(selectedId);
    const group = getCachedGroupConversations().find((g) => g.groupId === groupId);
    if (!group) return;

    // Header
    updateThreadHeader(null, group.groupName || "Group", null, true);

    const allMessages = sortChronological(getCachedGroupConversationMessages(groupId));
    const currentPlayerId = getCurrentPlayerId();

    // Deduplicate messages by ID (keep first occurrence of each unique positive ID)
    const seen = new Set<number>();
    const messages = allMessages.filter((msg) => {
      // Always keep pending messages (negative IDs)
      if (msg.id < 0) return true;
      // For real IDs, only keep if not seen before
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });

    if (messages.length === 0) { showNoMessages(); return; }

    // Find last outgoing message ID
    let lastOutgoingId = 0;
    for (const msg of messages) {
      if (msg.senderId === currentPlayerId && msg.id > lastOutgoingId) {
        lastOutgoingId = msg.id;
      }
    }

    // Check if the very last message in the conversation is incoming
    // If so, don't show status on our last outgoing message (they've obviously seen it)
    const lastMessage = messages[messages.length - 1];
    const lastMessageIsIncoming = lastMessage && lastMessage.senderId !== currentPlayerId;

    let lastDateLabel = "";
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const dateLabel = formatDateLabel(msg.createdAt);
      const hasDateSep = dateLabel !== "" && dateLabel !== lastDateLabel;
      if (hasDateSep) {
        threadBody.appendChild(createDateSeparator(dateLabel));
        lastDateLabel = dateLabel;
      }
      const prev = i > 0 ? messages[i - 1] : null;
      const next = i < messages.length - 1 ? messages[i + 1] : null;
      const nextDateLabel = next ? formatDateLabel(next.createdAt) : "";
      const isFirstInGroup = !prev || hasDateSep || !isSameMessageGroup(prev, msg);
      const isLastInGroup = !next || (nextDateLabel !== "" && nextDateLabel !== lastDateLabel) || !isSameMessageGroup(msg, next);
      const isOutgoing = msg.senderId === currentPlayerId;
      const isLastOutgoing = isOutgoing && msg.id === lastOutgoingId;
      threadBody.appendChild(createGroupMessageBubble(msg, isOutgoing, isLastOutgoing, lastMessageIsIncoming, isFirstInGroup, isLastInGroup));
    }
    scrollToBottom();
  }

  function createGroupMessageBubble(
    msg: CachedGroupMessage,
    isOutgoing: boolean,
    isLastOutgoing: boolean,
    lastMessageIsIncoming: boolean,
    isFirstInGroup: boolean,
    isLastInGroup: boolean,
  ): HTMLElement {
    const senderName = msg.senderName || msg.senderId;
    const senderAvatarUrl = msg.senderAvatarUrl;

    const wrapper = document.createElement("div");
    style(wrapper, {
      display: "flex",
      gap: "8px",
      alignItems: "center",
      justifyContent: isOutgoing ? "flex-end" : "flex-start",
    });

    if (!isOutgoing) {
      if (isLastInGroup) {
        wrapper.appendChild(createSmallAvatar(senderAvatarUrl, senderName));
      } else {
        const spacer = document.createElement("div");
        style(spacer, { width: "28px", flexShrink: "0" });
        wrapper.appendChild(spacer);
      }
    }

    let status: "pending" | "sent" | "read" | undefined = undefined;
    if (isLastOutgoing && !lastMessageIsIncoming) {
      if (msg._status) {
        status = msg._status;
      } else {
        status = msg.readAt ? "read" : "sent";
      }
    }

    const bubble = createBubbleContent(msg.body || msg.text || "", msg.createdAt, isOutgoing, status, isLastInGroup);
    wrapper.appendChild(bubble);

    // For incoming messages, show sender name above the first message in a group
    if (!isOutgoing && isFirstInGroup && senderName) {
      const container = document.createElement("div");
      style(container, {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        alignItems: "flex-start",
      });

      const senderLabel = document.createElement("div");
      style(senderLabel, {
        fontSize: "10px",
        color: "rgba(226,232,240,0.5)",
        fontWeight: "600",
        marginLeft: "36px",
      });
      senderLabel.textContent = senderName;

      container.append(senderLabel, wrapper);
      return container;
    }

    if (!isFirstInGroup) style(wrapper, { marginTop: "-4px" });
    return wrapper;
  }

  // ── Shared render helpers ──────────────────────────────────────────────────

  function renderConversationList(filter: string = ""): void {
    if (activeSubTab === "friends") {
      renderFriendConversationList(filter);
    } else {
      renderGroupConversationList(filter);
    }
  }

  function renderThread(): void {
    if (activeSubTab === "friends") {
      renderFriendThread();
    } else {
      renderGroupThread();
    }
  }

  function selectConversation(id: string): void {
    selectedId = id;
    setInputEnabled(true);
    renderConversationList(searchInput.value);
    renderThread();
    markConversationAsRead(id);
  }

  function markConversationAsRead(id: string): void {
    const currentPlayerId = getCurrentPlayerId();
    if (activeSubTab === "friends") {
      const conv = getCachedFriendConversations().find((c) => c.conversationId === id);
      if (!conv || conv.messages.length === 0) return;
      // Check if there are unread incoming messages OR unreadCount > 0
      const hasUnreadIncoming = conv.messages.some((m) => m.senderId !== currentPlayerId && !m.readAt);
      if (!hasUnreadIncoming && conv.unreadCount <= 0) return;
      // Find the highest message id (messages may be in any order)
      const maxId = conv.messages.reduce((max, m) => Math.max(max, m.id), 0);
      // Update cache immediately for instant UI feedback
      markFriendConversationAsRead(id, maxId, new Date().toISOString(), currentPlayerId || "");
      renderConversationList(searchInput.value);
      // POST to server (fire-and-forget)
      markMessagesRead({ otherPlayerId: conv.otherPlayerId, upToId: maxId });
    } else {
      const groupId = Number(id);
      const group = getCachedGroupConversations().find((g) => g.groupId === groupId);
      if (!group || group.unreadCount <= 0 || group.messages.length === 0) return;
      const maxId = group.messages.reduce((max, m) => Math.max(max, m.id), 0);
      // Update cache immediately for instant UI feedback
      markGroupConversationAsRead(groupId);
      renderConversationList(searchInput.value);
      // POST to server (fire-and-forget)
      markGroupMessagesAsRead({ groupId: id, messageId: maxId });
    }
  }

  function showEmptyThread(): void {
    threadBody.innerHTML = "";
    threadBody.appendChild(emptyState);
    style(threadAvatar, { display: "none" });
    style(muteBtn, { display: "none" });
    threadName.textContent = "Select a conversation";
    threadStatus.textContent = "";
    setInputEnabled(false);
  }

  function showNoMessages(): void {
    const noMsg = document.createElement("div");
    style(noMsg, { margin: "auto", color: "rgba(226,232,240,0.4)", fontSize: "12px" });
    noMsg.textContent = "No messages yet";
    threadBody.appendChild(noMsg);
  }

  function scrollToBottom(): void {
    requestAnimationFrame(() => { threadBody.scrollTop = threadBody.scrollHeight; });
  }

  function updateMuteButton(groupId: number): void {
    const muted = isGroupMuted(groupId);
    muteBtn.innerHTML = muted ? BELL_OFF_SVG : BELL_SVG;
    muteBtn.title = muted ? "Unmute notifications" : "Mute notifications";
    muteBtn.dataset.muted = String(muted);
    style(muteBtn, {
      color: muted ? "#5eead4" : "rgba(226,232,240,0.5)",
      background: muted ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.03)",
      border: muted ? "1px solid rgba(94,234,212,0.2)" : "1px solid rgba(255,255,255,0.06)",
    });
    // Update status text to show muted explanation
    threadStatus.textContent = muted ? "Notifications muted for this group" : "";
    style(threadStatus, {
      color: muted ? "rgba(94,234,212,0.5)" : "rgba(226,232,240,0.5)",
    });
  }

  function updateThreadHeader(avatarUrl: string | null | undefined, displayName: string, statusText: string | null, isGroup: boolean, badges?: string[] | null): void {
    // Hide avatar for groups
    if (isGroup) {
      style(threadAvatar, { display: "none" });
    } else if (avatarUrl) {
      style(threadAvatar, { display: "flex", background: `url(${avatarUrl}) center/cover` });
      threadAvatar.textContent = "";
    } else {
      style(threadAvatar, {
        display: "flex",
        background: "linear-gradient(135deg, rgba(94,234,212,0.25), rgba(59,130,246,0.25))",
      });
      threadAvatar.textContent = displayName.charAt(0).toUpperCase();
    }
    threadName.textContent = displayName;
    threadStatus.textContent = statusText || "";

    // Show mute button for groups
    if (isGroup && selectedId) {
      const groupId = Number(selectedId);
      style(muteBtn, { display: "flex" });
      updateMuteButton(groupId);
      muteBtn.onclick = () => {
        toggleGroupMute(groupId);
        updateMuteButton(groupId);
      };
    } else {
      style(muteBtn, { display: "none" });
      muteBtn.onclick = null;
    }

    // Update badges
    threadBadgesContainer.innerHTML = "";
    const badgesEl = badges && !isGroup ? createPlayerBadges(badges) : null;
    if (badgesEl) {
      threadBadgesContainer.appendChild(badgesEl);
      style(threadBadgesContainer, { display: "block" });
    } else {
      style(threadBadgesContainer, { display: "none" });
    }
  }

  function createEmptyListItem(query: string): HTMLElement {
    const empty = document.createElement("div");
    style(empty, { padding: "24px 8px", textAlign: "center", color: "rgba(226,232,240,0.4)", fontSize: "12px" });
    empty.textContent = query ? "No conversations found" : "No conversations yet";
    return empty;
  }

  function applyRowStyle(row: HTMLElement, isActive: boolean): void {
    style(row, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "10px 10px",
      borderRadius: "10px",
      cursor: "pointer",
      transition: "all 100ms ease",
      background: isActive ? "rgba(94,234,212,0.12)" : "transparent",
      border: isActive ? "1px solid rgba(94,234,212,0.25)" : "1px solid transparent",
    });
  }

  function createAvatarEl(avatarUrl: string | null | undefined, displayName: string | null, isGroup: boolean): HTMLElement {
    const wrap = document.createElement("div");
    style(wrap, { position: "relative", flexShrink: "0" });

    const avatar = document.createElement("div");
    const fallbackGradient = isGroup
      ? "linear-gradient(135deg, rgba(251,191,36,0.3), rgba(234,88,12,0.3))"
      : "linear-gradient(135deg, rgba(94,234,212,0.25), rgba(59,130,246,0.25))";
    style(avatar, {
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      background: avatarUrl ? `url(${avatarUrl}) center/cover` : fallbackGradient,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "14px",
      fontWeight: "600",
      color: "#dbe7f5",
      border: "1.5px solid rgba(255,255,255,0.08)",
    });
    if (!avatarUrl) {
      avatar.textContent = isGroup ? "#" : (displayName || "?").charAt(0).toUpperCase();
    }
    wrap.appendChild(avatar);
    return wrap;
  }

  function createRowMeta(name: string, previewText: string, lastDate: string | undefined, hasUnread: boolean, unreadCount: number): HTMLElement {
    const meta = document.createElement("div");
    style(meta, { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0", overflow: "hidden" });

    const topRow = document.createElement("div");
    style(topRow, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" });

    const nameEl = document.createElement("div");
    style(nameEl, {
      fontSize: "13px",
      fontWeight: hasUnread ? "700" : "500",
      color: hasUnread ? "#ecfdf5" : "#e7eef7",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1", minWidth: "0",
    });
    nameEl.textContent = name;

    const time = document.createElement("div");
    style(time, { fontSize: "10px", color: hasUnread ? "#5eead4" : "rgba(226,232,240,0.4)", flexShrink: "0", fontWeight: hasUnread ? "600" : "400" });
    if (lastDate) time.textContent = formatRelativeTimeShort(lastDate);

    topRow.append(nameEl, time);

    const bottomRow = document.createElement("div");
    style(bottomRow, { display: "flex", alignItems: "center", gap: "6px" });

    const preview = document.createElement("div");
    style(preview, { fontSize: "11px", color: "rgba(226,232,240,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1", minWidth: "0" });
    preview.textContent = previewText;
    bottomRow.appendChild(preview);

    if (hasUnread && unreadCount > 0) {
      const badge = document.createElement("div");
      style(badge, {
        minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "999px",
        background: "#ef4444", color: "#fff", fontSize: "10px", fontWeight: "700",
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: "0",
      });
      badge.textContent = String(unreadCount);
      bottomRow.appendChild(badge);
    }

    meta.append(topRow, bottomRow);
    return meta;
  }

  function createSmallAvatar(avatarUrl: string | null | undefined, fallbackName: string | null): HTMLElement {
    const avatar = document.createElement("div");
    if (avatarUrl) {
      style(avatar, {
        width: "28px", height: "28px", borderRadius: "50%",
        background: `url(${avatarUrl}) center/cover`,
        flexShrink: "0", border: "1px solid rgba(255,255,255,0.06)",
      });
    } else {
      style(avatar, {
        width: "28px", height: "28px", borderRadius: "50%",
        background: "linear-gradient(135deg, rgba(94,234,212,0.2), rgba(59,130,246,0.2))",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "11px", fontWeight: "600", color: "#dbe7f5",
        flexShrink: "0", border: "1px solid rgba(255,255,255,0.06)",
      });
      avatar.textContent = (fallbackName || "?").charAt(0).toUpperCase();
    }
    return avatar;
  }

  // ── Link detection & rendering ──────────────────────────────────────────────

  const URL_RE = /https?:\/\/[^\s<>)"'\]]+/gi;

  function shortenUrl(raw: string): string {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "");
      const path = u.pathname === "/" ? "" : u.pathname;
      const short = host + path;
      return short.length > 40 ? short.slice(0, 37) + "..." : short;
    } catch {
      return raw.length > 40 ? raw.slice(0, 37) + "..." : raw;
    }
  }

  function openLink(url: string): void {
    if (isDiscordSurface() && typeof GM_openInTab === "function") {
      try {
        GM_openInTab(url, { active: true, insert: true });
        return;
      } catch { /* fallback below */ }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function linkifyInto(text: string, container: HTMLElement): void {
    URL_RE.lastIndex = 0;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = URL_RE.exec(text)) !== null) {
      // Text before the URL
      if (match.index > lastIdx) {
        container.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
      }

      const href = match[0];
      const link = document.createElement("a");
      link.textContent = shortenUrl(href);
      link.title = href;
      link.href = href;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      Object.assign(link.style, {
        color: "#5eead4",
        textDecoration: "underline",
        textDecorationColor: "rgba(94,234,212,0.4)",
        cursor: "pointer",
        wordBreak: "break-all",
      });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLink(href);
      });

      container.appendChild(link);
      lastIdx = URL_RE.lastIndex;
    }

    // Remaining text after last URL
    if (lastIdx < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
  }

  function createBubbleContent(body: string, createdAt: string, isOutgoing: boolean, status?: "pending" | "sent" | "read", showMeta: boolean = true): HTMLElement {
    const bubble = document.createElement("div");
    style(bubble, { maxWidth: "70%", display: "flex", flexDirection: "column", gap: showMeta ? "4px" : "0" });

    // Parse gem tokens from the message body
    const { text: cleanText, tokens } = parseGemTokens(body);

    const content = document.createElement("div");
    style(content, {
      padding: "8px 12px",
      borderRadius: isOutgoing ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
      fontSize: "14px", lineHeight: "1.5", wordBreak: "break-word", whiteSpace: "pre-wrap",
      background: isOutgoing ? "rgba(94,234,212,0.14)" : "rgba(255,255,255,0.06)",
      border: isOutgoing ? "1px solid rgba(94,234,212,0.22)" : "1px solid rgba(255,255,255,0.06)",
      color: isOutgoing ? "#d1fae5" : "#e7eef7",
    });

    // Show clean text (without tokens) or hide bubble if only tokens
    if (cleanText) {
      linkifyInto(cleanText, content);
      bubble.appendChild(content);
    } else if (tokens.length === 0) {
      // No tokens and no text — show original body
      linkifyInto(body, content);
      bubble.appendChild(content);
    }

    // Render token cards below the bubble text
    if (tokens.length > 0) {
      bubble.appendChild(createTokenCardsContainer(tokens, isOutgoing));
    }

    if (showMeta) {
      const timestampRow = document.createElement("div");
      style(timestampRow, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        justifyContent: isOutgoing ? "flex-end" : "flex-start",
      });

      if (isOutgoing && status) {
        const statusIcon = document.createElement("span");
        style(statusIcon, {
          fontSize: "11px",
          color: status === "read" ? "#5eead4" : "rgba(226,232,240,0.4)",
          lineHeight: "1",
        });
        if (status === "pending") {
          statusIcon.textContent = "\u25CB";
        } else if (status === "sent") {
          statusIcon.textContent = "\u2713";
        } else if (status === "read") {
          statusIcon.textContent = "\u2713\u2713";
        }
        timestampRow.appendChild(statusIcon);
      }

      const timestamp = document.createElement("div");
      style(timestamp, {
        fontSize: "10px", color: "rgba(226,232,240,0.35)",
      });
      timestamp.textContent = formatMessageTime(createdAt);

      timestampRow.appendChild(timestamp);
      bubble.appendChild(timestampRow);
    }

    return bubble;
  }

  // ── Sub-tab switching ────────────────────────────────────────────────────

  function switchSubTab(tab: SubTab): void {
    if (activeSubTab === tab) return;
    activeSubTab = tab;
    selectedId = null;

    setSubTabActive(friendsBtn, tab === "friends");
    setSubTabActive(groupsBtn, tab === "groups");

    searchInput.value = "";
    renderConversationList();
    renderThread();
  }

  friendsBtn.onclick = () => switchSubTab("friends");
  groupsBtn.onclick = () => switchSubTab("groups");

  // ── Search ─────────────────────────────────────────────────────────────────

  searchInput.oninput = () => renderConversationList(searchInput.value);

  // ── Refresh on data changes ────────────────────────────────────────────────

  const onConversationsRefresh = () => {
    // If the selected conversation was removed (e.g. kicked from group, group deleted), deselect
    if (selectedId) {
      const stillExists = activeSubTab === "friends"
        ? getCachedFriendConversations().some((c) => c.conversationId === selectedId)
        : getCachedGroupConversations().some((g) => g.groupId === Number(selectedId));
      if (!stillExists) {
        selectedId = null;
        setInputEnabled(false);
      }
    }

    renderConversationList(searchInput.value);
    if (selectedId) {
      renderThread();
      // Auto-mark as read if we're currently viewing this conversation
      autoMarkAsReadIfActive();
    } else {
      showEmptyThread();
    }
  };

  function isTabVisible(): boolean {
    // Tab must be active (not hidden) AND overlay panel must be open
    if (root.style.display === "none") return false;
    const panel = root.closest(".qws-ch-panel");
    return panel ? panel.classList.contains("open") : false;
  }

  function autoMarkAsReadIfActive(): void {
    if (!selectedId || !isTabVisible()) return;
    const currentPlayerId = getCurrentPlayerId();

    if (activeSubTab === "friends") {
      const conv = getCachedFriendConversations().find((c) => c.conversationId === selectedId);
      if (!conv || conv.messages.length === 0) return;

      // Find unread incoming messages (not sent by us and not read yet)
      const unreadIncoming = conv.messages.filter(
        (m) => m.senderId !== currentPlayerId && !m.readAt
      );

      if (unreadIncoming.length > 0) {
        const maxId = Math.max(...unreadIncoming.map((m) => m.id));
        // Mark as read locally
        markFriendConversationAsRead(selectedId, maxId, new Date().toISOString(), currentPlayerId || "");
        renderConversationList(searchInput.value);
        // Notify server
        markMessagesRead({ otherPlayerId: conv.otherPlayerId, upToId: maxId });
      }
    } else {
      const groupId = Number(selectedId);
      const group = getCachedGroupConversations().find((g) => g.groupId === groupId);
      if (!group || group.messages.length === 0) return;

      // For groups, just check if there are any messages with higher ID than last read
      // Since groups don't have individual readAt on messages, we use unreadCount
      if (group.unreadCount > 0) {
        const maxId = Math.max(...group.messages.map((m) => m.id));
        // Mark as read locally
        markGroupConversationAsRead(groupId);
        renderConversationList(searchInput.value);
        // Notify server
        markGroupMessagesAsRead({ groupId: selectedId, messageId: maxId });
      }
    }
  }

  window.addEventListener(CH_EVENTS.CONVERSATIONS_REFRESH, onConversationsRefresh);

  // When the overlay opens, check if we need to mark unread messages as read
  // (e.g. messages arrived while overlay was closed but conversation was selected)
  const onOverlayOpen = () => {
    // Small delay: the panel needs a rAF to get the .open class
    setTimeout(() => autoMarkAsReadIfActive(), 60);
  };
  window.addEventListener(CH_EVENTS.OPEN, onOverlayOpen);

  // Open specific friend chat
  const onOpenFriendChat = (e: Event) => {
    const customEvent = e as CustomEvent<{ playerId: string }>;
    const { playerId } = customEvent.detail;

    // Switch to friends subtab
    if (activeSubTab !== "friends") {
      switchSubTab("friends");
    }

    // Find conversation with this friend
    const conversations = getCachedFriendConversations();
    const conversation = conversations.find((c) => c.otherPlayerId === playerId);

    if (conversation) {
      // Select existing conversation
      selectConversation(conversation.conversationId);
    } else {
      // No existing conversation - create one in cache
      const friends = getCachedFriendsWithViews();
      const friend = friends.find((f) => f.playerId === playerId);

      if (friend) {
        // Create new conversation entry
        const newConversation: CachedFriendConversation = {
          conversationId: playerId,
          otherPlayerId: playerId,
          otherPlayerName: friend.playerName,
          otherPlayerAvatarUrl: friend.avatarUrl,
          messages: [],
          unreadCount: 0,
        };

        // Add to cache
        const updatedConversations = [...conversations, newConversation];
        updateFriendConversationsCache(updatedConversations);

        // Refresh the conversation list to show the new conversation
        renderConversationList(searchInput.value);

        // Select the new conversation
        selectConversation(playerId);
      } else {
        // Friend not found in cache - show error state
        selectedId = null;
        setInputEnabled(false);
        renderConversationList(searchInput.value);
        threadBody.innerHTML = "";

        const errorState = document.createElement("div");
        style(errorState, {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "12px",
          color: "rgba(226,232,240,0.6)",
          fontSize: "13px",
          textAlign: "center",
          padding: "20px",
        });
        errorState.innerHTML = `
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>Unable to start conversation<br/>Friend not found</div>
        `;
        threadBody.appendChild(errorState);
      }
    }
  };
  window.addEventListener(CH_EVENTS.OPEN_FRIEND_CHAT, onOpenFriendChat as EventListener);

  // Open specific group chat
  const onOpenGroupChat = (e: Event) => {
    const customEvent = e as CustomEvent<{ groupId: string; groupName?: string }>;
    const { groupId, groupName } = customEvent.detail;

    // Switch to groups subtab
    if (activeSubTab !== "groups") {
      switchSubTab("groups");
    }

    // Ensure the conversation exists in cache (may not exist for newly created groups)
    const numericId = Number(groupId);
    const resolvedName = groupName
      || getWelcomeCache()?.groups?.find((g) => g.id === numericId)?.name
      || "Group";
    ensureGroupConversationExists(numericId, resolvedName);

    // Select the group conversation (groupId as string key)
    selectConversation(groupId);
  };
  window.addEventListener(CH_EVENTS.OPEN_GROUP_CHAT, onOpenGroupChat as EventListener);

  // Subscribe to welcome event (same pattern as myProfileTab)
  const cacheExistedBeforeSubscribe = getCachedFriendConversations().length > 0 || getCachedGroupConversations().length > 0;
  let isFirstWelcomeCall = true;
  const unsubscribeWelcome = onWelcome(() => {
    if (isFirstWelcomeCall && cacheExistedBeforeSubscribe) {
      isFirstWelcomeCall = false;
      return;
    }
    isFirstWelcomeCall = false;
    onConversationsRefresh();
  });

  // ── Initial render ─────────────────────────────────────────────────────────
  renderConversationList();

  return {
    id: "messages" as const,
    root,
    show: () => {
      style(root, { display: "flex" });
      // Re-check unreads when switching to this tab
      setTimeout(() => autoMarkAsReadIfActive(), 0);
    },
    hide: () => style(root, { display: "none" }),
    destroy: () => {
      window.removeEventListener(CH_EVENTS.CONVERSATIONS_REFRESH, onConversationsRefresh);
      window.removeEventListener(CH_EVENTS.OPEN, onOverlayOpen);
      window.removeEventListener(CH_EVENTS.OPEN_FRIEND_CHAT, onOpenFriendChat as EventListener);
      window.removeEventListener(CH_EVENTS.OPEN_GROUP_CHAT, onOpenGroupChat as EventListener);
      document.removeEventListener("click", onClickOutsideEmoji);
      importBtn.cleanup();
      unsubscribeWelcome();
      keyBlocker.detach();
      root.remove();
    },
    getTotalUnread: () => getTotalFriendUnreadCount() + getTotalGroupUnreadCount(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (module-level)
// ─────────────────────────────────────────────────────────────────────────────

/** Find the newest message in an array (by createdAt) regardless of order. */
function getNewestMessage<T extends { createdAt: string }>(messages: T[]): T | undefined {
  if (messages.length === 0) return undefined;
  return messages.reduce((best, m) => (m.createdAt > best.createdAt ? m : best), messages[0]);
}

/** Sort messages chronologically (oldest → newest) in place and return. */
function sortChronological<T extends { createdAt: string }>(messages: T[]): T[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Conversation sort comparator: unread first, then most recent on top. */
function conversationSortComparator<T extends { unreadCount: number; messages: { createdAt: string }[] }>(a: T, b: T): number {
  const aUnread = (a.unreadCount ?? 0) > 0 ? 1 : 0;
  const bUnread = (b.unreadCount ?? 0) > 0 ? 1 : 0;
  if (aUnread !== bUnread) return bUnread - aUnread;
  const aNewest = getNewestMessage(a.messages)?.createdAt || "";
  const bNewest = getNewestMessage(b.messages)?.createdAt || "";
  return bNewest.localeCompare(aNewest);
}

/** Format a date as a separator label ("Today", "Yesterday", "Feb 12"). */
function formatDateLabel(iso: string): string {
  try {
    const date = new Date(iso);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/** Create a date separator element. */
function createDateSeparator(label: string): HTMLElement {
  const wrap = document.createElement("div");
  style(wrap, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    margin: "10px 0 6px",
  });

  const line = () => {
    const el = document.createElement("div");
    style(el, { flex: "1", height: "1px", background: "rgba(255,255,255,0.08)" });
    return el;
  };

  const text = document.createElement("div");
  style(text, {
    fontSize: "10px",
    fontWeight: "600",
    color: "rgba(226,232,240,0.4)",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });
  text.textContent = label;

  wrap.append(line(), text, line());
  return wrap;
}

/** Grouping threshold: consecutive messages from the same sender within this window are grouped. */
const MSG_GROUP_THRESHOLD_MS = 2 * 60 * 1000;

function isSameMessageGroup(
  a: { senderId: string; createdAt: string },
  b: { senderId: string; createdAt: string },
): boolean {
  if (a.senderId !== b.senderId) return false;
  try {
    return Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < MSG_GROUP_THRESHOLD_MS;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-tab button helpers
// ─────────────────────────────────────────────────────────────────────────────

function createSubTabButton(label: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  style(btn, {
    flex: "1",
    padding: "8px 16px",
    border: active ? "1px solid rgba(94,234,212,0.35)" : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    background: active ? "rgba(94,234,212,0.18)" : "transparent",
    color: active ? "#ecfdf5" : "#c9d4e6",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
  });

  btn.onmouseenter = () => {
    if (!btn.dataset.active) {
      style(btn, { background: "rgba(94,234,212,0.08)", color: "#e7eef7" });
    }
  };
  btn.onmouseleave = () => {
    if (!btn.dataset.active) {
      style(btn, { background: "transparent", color: "#c9d4e6" });
    }
  };

  if (active) btn.dataset.active = "1";
  return btn;
}

function setSubTabActive(btn: HTMLButtonElement, active: boolean): void {
  if (active) {
    btn.dataset.active = "1";
    style(btn, {
      background: "rgba(94,234,212,0.18)",
      borderColor: "rgba(94,234,212,0.35)",
      color: "#ecfdf5",
    });
  } else {
    delete btn.dataset.active;
    style(btn, {
      background: "transparent",
      borderColor: "rgba(255,255,255,0.08)",
      color: "#c9d4e6",
    });
  }
}
