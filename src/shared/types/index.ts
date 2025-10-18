// Re-export dos tipos JWT para facilitar imports
export * from './jwt.types';

// Tipos auxiliares para autenticação
export type UserProfile = 'COORDINATOR' | 'ASSISTANT_COORDINATOR' | 'CAPTAIN' | 'ASSISTANT_CAPTAIN' | 'PARTICIPANT' | 'ADMIN_ANALYST';

export type AdminProfiles = 'COORDINATOR' | 'ADMIN_ANALYST';
export type CaptainProfiles = 'CAPTAIN' | 'ASSISTANT_CAPTAIN';

// Helper functions para verificar perfis
export const isAdminProfile = (profile: UserProfile): profile is AdminProfiles => {
    return profile === 'COORDINATOR' || profile === 'ADMIN_ANALYST';
};

export const isCaptainProfile = (profile: UserProfile): profile is CaptainProfiles => {
    return profile === 'CAPTAIN' || profile === 'ASSISTANT_CAPTAIN';
};