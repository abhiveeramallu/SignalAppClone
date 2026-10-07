import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { ChatsIcon } from "@/components/ui/icons";
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
    <section className={`${hidden ? "hidden" : "flex"} min-w-0 flex-1 flex-col bg-background md:flex`}>
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
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-primary">
        <ChatsIcon active className="h-9 w-9" />
      </div>
      <p className="text-lg font-bold text-foreground">Welcome to Signal</p>
      <p className="max-w-xs text-sm text-muted-foreground">Choose a chat from the list to start messaging.</p>
    </div>
  );
}
