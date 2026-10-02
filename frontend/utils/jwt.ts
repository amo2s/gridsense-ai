import { jwtDecode } from "jwt-decode";

export interface JWTPayload {
  email: string;
  role: string;
  full_name?: string;
  name?: string;
  exp: number;
  [key: string]: any;
}

export function decodeOperatorToken(token: string): JWTPayload | null {
  try {
    if (!token) return null;
    const decoded = jwtDecode<JWTPayload>(token);
    
    // Fallback if full_name is missing
    if (!decoded.full_name && decoded.email) {
      decoded.full_name = decoded.email.split("@")[0];
    }
    
    // Map to name for backward compatibility with layout props
    decoded.name = decoded.full_name;
    
    return decoded;
  } catch (error) {
    console.error("Failed to parse JWT payload:", error);
    return null;
  }
}
