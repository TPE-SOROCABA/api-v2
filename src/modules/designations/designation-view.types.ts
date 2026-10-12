import { DesignationStatus, GroupType, ParticipantGroupProfile, ParticipantSex, Weekday } from '@prisma/client';

/**
 * Shape de uma designação como o front já consome hoje (vem de `Designation.toJson()`
 * na legacy). O nome dos campos — snake_case, `total.vacancies`, `publication_carts` —
 * é contrato com o `admin-tpe`; não "limpar" isso aqui.
 */
export interface DesignationViewIncident {
  id: string;
  reason: string;
  status: string;
}

export interface DesignationViewParticipant {
  id: string;
  name: string;
  cpf: string | null;
  phone: string;
  profile_photo: string;
  sex: ParticipantSex;
  /** Só quem tem falta ABERTA aparece aqui; nos demais fica sempre `null` (ver `separateIncidents`). */
  incident_history: DesignationViewIncident | null;
  /**
   * Cargo no grupo (`CAPTAIN`, `ASSISTANT_CAPTAIN`, ...), não o perfil global.
   *
   * Opcional de propósito: quando o participante escalado não tem linha em
   * `participants_groups` para aquele grupo, a legacy deixava `undefined` e o
   * `JSON.stringify` simplesmente omitia a chave. Um default aqui mudaria o payload.
   */
  profile?: ParticipantGroupProfile;
}

export interface DesignationViewAssignment {
  id: string;
  point: {
    id: string;
    name: string;
    status: boolean;
  };
  publication_carts: { id: string; name: string }[];
  participants: DesignationViewParticipant[];
  config: {
    min: number;
    max: number;
  };
  error?: string;
}

export interface DesignationView {
  id: string;
  group: {
    id: string;
    name: string;
    /** `null` quando o grupo não tem WhatsApp configurado (não ausente — ver `toDesignationView`). */
    whatsappId?: string | null;
    type: GroupType;
    config: {
      endHour: string;
      startHour: string;
      weekday: Weekday;
      minParticipants: number;
      maxParticipants: number;
    };
  };
  status: DesignationStatus;
  assignments: DesignationViewAssignment[];
  /** Membros do grupo que ainda NÃO estão em nenhum ponto. */
  participants: DesignationViewParticipant[];
  createdAt: Date;
  updatedAt: Date;
  /** Removidos de `participants`/das designações por terem falta aberta. */
  incidents: DesignationViewParticipant[];
  /** Só preenchido quando a leitura vem com `?filter`. */
  assignmentsFiltered: DesignationViewAssignment[];
  cancellationJustification: string;
  mandatoryPresence: boolean;
  total: {
    participants: number;
    vacancies: number;
  };
}

/** Entrada de `GET /designations/:id/participants` e `GET /designations/:id/participants/:pid`. */
export interface DesignationEventEntry {
  event: string;
  createdAt: Date;
  updatedAt: Date;
  expirationDate: Date;
  point: string;
  participants: { name: string; profile_photo: string }[] | { name: string; profile_photo: string };
  publication_carts: string[];
  status: DesignationStatus;
  incident_history?: DesignationViewIncident | null;
}
