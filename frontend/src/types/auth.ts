export type UserRole = "Admin" | "Manager" | "Staff";
export type AccountStatus = "Pending" | "Approved" | "Rejected";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  created_at?: string;
  updated_at?: string;
}

// Matches the actual envelope returned by shared.RespondSuccess on the Go backend:
// { "status": "success", "data": { "access_token": "...", "user": {...} } }
export interface AuthResponse {
  status: string;
  data: {
    access_token: string;
    user: User;
  };
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
}