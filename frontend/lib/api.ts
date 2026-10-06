import type { ConversationDetail, ConversationPreview, MessagePage, Participant, UserSummary } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface AuthUser {
  id: number;
  username: string;
  phone_number: string | null;
  display_name: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface RegisterPayload {
  username: string;
  phone_number?: string | null;
  display_name: string;
  password: string;
  avatar_url?: string | null;
}

export interface OtpRequestPayload {
  username?: string;
  phone_number?: string;
}

export interface OtpRequestResult {
  message: string;
  /** Disclosed development mock — not a real sent code. */
  dev_otp: string;
}

export interface RegisterWithOtpPayload extends RegisterPayload {
  otp: string;
}

export interface LoginPayload {
  username?: string;
  phone_number?: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Fired on a 401 from an AUTHENTICATED call (one that sent an Authorization
// header) — never for /auth/login's own 401, which means "wrong password,"
// not "your session died." AuthProvider registers the real handler; this
// module has no React context of its own to react to it directly.
type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;
export function setUnauthorizedListener(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

function extractErrorMessage(status: number, body: unknown, isAuthenticatedCall: boolean): string {
  // 422 bodies are a list of Pydantic validation errors — not something to
  // show a user directly, so always use a generic message for those.
  if (status === 422) return "Please check the information you entered.";
  if (status === 401) {
    return isAuthenticatedCall ? "Your session has expired. Please sign in again." : "Invalid credentials.";
  }

  // The backend writes specific, user-presentable detail strings (e.g. "Admin
  // privileges required," "Cannot remove the last remaining admin") — prefer
  // those over a generic fallback when present.
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail.length > 0) return detail;

  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return "This item is no longer available.";
  if (status === 409) return "This already exists.";
  if (status >= 500) return "Something went wrong on our end. Please try again.";
  return "Something went wrong. Please try again.";
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isAuthenticatedCall = Boolean((options.headers as Record<string, string> | undefined)?.Authorization);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // fetch() itself threw — offline, DNS failure, CORS, server down, etc.
    // No Response to inspect at all, so this is handled before the ok-check.
    throw new ApiError(0, "Unable to connect. Please try again.");
  }

  if (!res.ok) {
    const body = await safeJson(res);
    if (res.status === 401 && isAuthenticatedCall) unauthorizedListener?.();
    throw new ApiError(res.status, extractErrorMessage(res.status, body, isAuthenticatedCall));
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export const api = {
  register(payload: RegisterPayload): Promise<AuthUser> {
    return request<AuthUser>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  // Mock OTP registration flow (assignment-permitted fixed verification
  // code) — a separate pair of endpoints from register() above, which
  // remains available unchanged for anything that doesn't go through OTP.
  requestRegistrationOtp(payload: OtpRequestPayload): Promise<OtpRequestResult> {
    return request<OtpRequestResult>("/auth/register/request-otp", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  verifyRegistrationOtp(payload: RegisterWithOtpPayload): Promise<AuthUser> {
    return request<AuthUser>("/auth/register/verify-otp", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  login(payload: LoginPayload): Promise<TokenResponse> {
    return request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  me(token: string): Promise<AuthUser> {
    return request<AuthUser>("/auth/me", { headers: authHeaders(token) });
  },

  getContacts(token: string): Promise<UserSummary[]> {
    return request<UserSummary[]>("/contacts", { headers: authHeaders(token) });
  },
  searchUsers(token: string, query: string): Promise<UserSummary[]> {
    return request<UserSummary[]>(`/users/search?q=${encodeURIComponent(query)}`, {
      headers: authHeaders(token),
    });
  },
  addContact(token: string, userId: number): Promise<UserSummary> {
    return request<UserSummary>(`/contacts/${userId}`, { method: "POST", headers: authHeaders(token) });
  },
  removeContact(token: string, userId: number): Promise<void> {
    return request<void>(`/contacts/${userId}`, { method: "DELETE", headers: authHeaders(token) });
  },

  getConversations(token: string): Promise<ConversationPreview[]> {
    return request<ConversationPreview[]>("/conversations", { headers: authHeaders(token) });
  },
  getConversation(token: string, conversationId: number): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/conversations/${conversationId}`, { headers: authHeaders(token) });
  },
  createDirectConversation(token: string, userId: number): Promise<ConversationPreview> {
    // Backend returns 201 (new) or 200 (already existed) — both carry the
    // same body shape, so the caller doesn't need to branch on status.
    return request<ConversationPreview>("/conversations/direct", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ user_id: userId }),
    });
  },
  createGroupConversation(token: string, name: string, memberIds: number[]): Promise<ConversationPreview> {
    return request<ConversationPreview>("/conversations/group", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name, member_ids: memberIds }),
    });
  },

  getMessages(
    token: string,
    conversationId: number,
    params: { limit?: number; beforeId?: number } = {},
  ): Promise<MessagePage> {
    const query = new URLSearchParams();
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.beforeId != null) query.set("before_id", String(params.beforeId));
    const qs = query.toString();
    return request<MessagePage>(`/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`, {
      headers: authHeaders(token),
    });
  },

  addGroupMember(token: string, conversationId: number, userId: number): Promise<Participant> {
    return request<Participant>(`/conversations/${conversationId}/members`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ user_id: userId }),
    });
  },
  removeGroupMember(token: string, conversationId: number, userId: number): Promise<void> {
    return request<void>(`/conversations/${conversationId}/members/${userId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },
  updateMemberRole(token: string, conversationId: number, userId: number, role: "member" | "admin"): Promise<Participant> {
    return request<Participant>(`/conversations/${conversationId}/members/${userId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ role }),
    });
  },
  updateConversation(
    token: string,
    conversationId: number,
    payload: { name?: string; avatar_url?: string },
  ): Promise<ConversationDetail> {
    return request<ConversationDetail>(`/conversations/${conversationId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
  },
};
