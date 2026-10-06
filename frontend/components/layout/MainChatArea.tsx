import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import type { ConnectionState, TypingUser } from "@/lib/ws";
import type { ConversationPreview, Message } from "@/lib/types";

interface MainChatAreaProps {
  conversation: ConversationPreview | null;
  currentUserId: number;
  messages: Message[];
  messagesInitialLoading: boolean;
  messagesError: string | null;
  hasMoreMessages: boolean;
  loadingOlderMessages: boolean;
  onLoadOlderMessages: () => void;
  typingUsers: TypingUser[];
  onTypingStart: () => void;
  onTypingStop: () => void;
  onSend: (text: string) => boolean;
  composerDisabled: boolean;
  connectionState: ConnectionState;
  onBack: () => void;
  onNotImplemented: (feature: string) => void;
  onOpenGroupDetails: () => void;
  hidden?: boolean;
}

export function MainChatArea({
  conversation,
  currentUserId,
  messages,
  messagesInitialLoading,
  messagesError,
  hasMoreMessages,
  loadingOlderMessages,
  onLoadOlderMessages,
  typingUsers,
  onTypingStart,
  onTypingStop,
  onSend,
  composerDisabled,
  connectionState,
  onBack,
  onNotImplemented,
  onOpenGroupDetails,
  hidden,
}: MainChatAreaProps) {
  return (
    <section className={`${hidden ? "hidden" : "flex"} min-w-0 flex-1 flex-col md:flex`}>
      {conversation ? (
        <>
          <ChatHeader
            conversation={conversation}
            onBack={onBack}
            onNotImplemented={onNotImplemented}
            onOpenGroupDetails={onOpenGroupDetails}
          />
          <MessageList
            messages={messages}
            isGroup={conversation.type === "group"}
            currentUserId={currentUserId}
            initialLoading={messagesInitialLoading}
            error={messagesError}
            hasMore={hasMoreMessages}
            loadingOlder={loadingOlderMessages}
            onLoadOlder={onLoadOlderMessages}
          />
          <TypingIndicator users={typingUsers} />
          <MessageComposer
            key={conversation.id}
            onSend={onSend}
            onAttachClick={() => onNotImplemented("Attachments")}
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
            disabled={composerDisabled}
            connectionState={connectionState}
          />
        </>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-neutral-50 px-6 text-center">
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-semibold text-white shadow-sm">
        S
      </div>
      <p className="text-base font-semibold text-neutral-900">Select a conversation</p>
      <p className="max-w-xs text-sm text-neutral-500">Choose a chat from the list to start messaging.</p>
    </div>
  );
}
