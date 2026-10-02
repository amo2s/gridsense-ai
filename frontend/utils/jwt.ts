import { jwtDecode } from "jwt-decode";

export interface JWTPayload {
  email: string;
  role: string;
  name?: string;
  exp: number;
  [key: string]: any;
}

export function decodeOperatorToken(token: string): JWTPayload | null {
  try {
    if (!token) return null;
    const decoded = jwtDecode<JWTPayload>(token);
    
    // Fallback if name is missing
    if (!decoded.name && decoded.email) {
      decoded.name = decoded.email.split("@")[0];
    }
    
    return decoded;
  } catch (error) {
    console.error("Failed to parse JWT payload:", error);
    return null;
  }
}
