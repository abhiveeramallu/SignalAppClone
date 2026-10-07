// Mirrors backend/app/schemas/{users,conversations,messages}.py — kept in
// sync by hand since frontend and backend are separate projects.

export interface UserSummary {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
}

export type ConversationType = "direct" | "group";

export type MessageType = "text" | "file";

export interface LastMessagePreview {
  content: string;
  message_type: MessageType;
  attachment_filename: string | null;
  created_at: string;
}

export interface ConversationPreview {
  id: number;
  type: ConversationType;
  name: string | null;
  avatar_url: string | null;
  other_user: UserSummary | null; // direct only
  member_count: number | null; // group only
  last_message: LastMessagePreview | null;
  unread_count: number;
}

export interface Participant {
  user: UserSummary;
  role: "member" | "admin";
}

export interface ConversationDetail {
  id: number;
  type: ConversationType;
  name: string | null;
  avatar_url: string | null;
  other_user: UserSummary | null; // direct only
  participants: Participant[] | null; // group only
  member_count: number | null; // group only
  created_at: string;
}

export type MessageStatusValue = "sent" | "delivered" | "read";

export interface MessageSender {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender: MessageSender;
  content: string;
  message_type: MessageType;
  attachment_filename: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
  attachment_url: string | null;
  created_at: string;
  status: MessageStatusValue;
}

export interface PendingAttachment {
  attachment_filename: string;
  attachment_path: string;
  attachment_mime_type: string;
  attachment_size: number;
}

export interface MessagePage {
  messages: Message[];
  has_more: boolean;
  next_cursor: number | null;
}
