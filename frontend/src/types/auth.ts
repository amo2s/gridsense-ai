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

export interface AuthResponse {
  message: string;
  access_token?: string;
  user?: User;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
}