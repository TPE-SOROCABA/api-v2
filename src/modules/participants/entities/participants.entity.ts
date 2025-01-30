import { PetitionStatus } from "@prisma/client";
import { TransactionLogger } from "src/infra/transaction.logger";

interface CreateParticipant {
    name: string;
    sex: string;
    phone: string;
    email: string;
    petitionId: string;
    birthDate?: Date;
    civilStatus?: string;
    languages?: string[];
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    congregationId?: number;
    baptismDate?: Date;
    attributions?: string[];
    hasMinorChild?: boolean;
    spouseParticipant?: boolean;
    availability?: any[];
    profilePhoto?: string;
}

export class Participant {
    logger = new TransactionLogger(Participant.name);
    // Pessoal
    private constructor(
        public name: string,
        public sex: string,
        public phone: string,
        public email: string,
        public petitionId: string,
        public birthDate?: Date,
        public civilStatus?: string,
        public languages?: string[],
        public address?: string,
        public city?: string,
        public state?: string,
        public zipCode?: string,

        // Espiritual
        public congregationId?: number,
        public baptismDate?: Date,
        public attributions?: string[],

        // Outros
        public hasMinorChild?: boolean,
        public spouseParticipant?: boolean,
        public availability?: any[],
        public profilePhoto?: string,
    ) {
        this.logger.log(`Criando participante `, name);
    }

    get registrationStatus(): PetitionStatus {
        const requiredFields = ['name', 'sex', 'phone', 'email', 'petitionId', 'birthDate', 'congregationId', 'baptismDate', 'attributions'];
        const hasAllRequiredFields = requiredFields.every(field => {
            this.logger.debug(`Verificando campo ${field} com valor ${this[field]}`);
            return this[field];
        });

        return hasAllRequiredFields ? PetitionStatus.WAITING : PetitionStatus.WAITING_INFORMATION;
    }

    static build(participant: CreateParticipant): Participant {
        const {
            name,
            sex,
            phone,
            email,
            petitionId,
            birthDate,
            civilStatus,
            languages,
            address,
            city,
            state,
            zipCode,
            congregationId,
            baptismDate,
            attributions,
            hasMinorChild,
            spouseParticipant,
            availability,
            profilePhoto
        } = participant;
        return new Participant(
            name,
            sex,
            phone,
            email,
            petitionId,
            birthDate ?? null,
            civilStatus ?? null,
            languages ?? null,
            address ?? null,
            city ?? null,
            state ?? null,
            zipCode ?? null,
            congregationId ?? null,
            baptismDate ?? null,
            attributions ?? null,
            hasMinorChild ?? null,
            spouseParticipant ?? null,
            availability ?? null,
            profilePhoto ?? null
        );
    }
}
