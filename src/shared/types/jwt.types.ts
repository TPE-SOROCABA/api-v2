export interface JwtPayload {
    id: string; // ID do participante
    name: string;
    cpf?: string;
    profile: 'COORDINATOR' | 'ASSISTANT_COORDINATOR' | 'CAPTAIN' | 'ASSISTANT_CAPTAIN' | 'PARTICIPANT' | 'ADMIN_ANALYST';
    profile_photo?: string;
    groupId?: string;
    designation?: {
        id: string;
        expiration: string;
        name: string;
    };
    iat: number; // issued at
    exp: number; // expiration
}

export interface AuthenticatedRequest {
    user: JwtPayload;
}