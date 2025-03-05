import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { instanceToPlain } from 'class-transformer';
import { AdditionalInfoDto } from './dto/additional-info.dto';

@Injectable()
export class GroupsService {
    constructor(private readonly prisma: PrismaService) { }

    async create(createGroupDto: CreateGroupDto) {
        const additionalInfo = createGroupDto.additionalInfo ? instanceToPlain<AdditionalInfoDto>(createGroupDto.additionalInfo) : undefined;
        const coordinator = createGroupDto.coordinatorId ? { connect: { id: createGroupDto.coordinatorId } } : undefined;
        const group = await this.prisma.groups.create({
            data: {
                name: createGroupDto.name,
                configEndHour: createGroupDto.configEndHour,
                configMax: createGroupDto.configMax,
                configMin: createGroupDto.configMin,
                configStartHour: createGroupDto.configStartHour,
                configWeekday: createGroupDto.configWeekday,
                additionalInfo: additionalInfo,
                coordinator: coordinator,
                status: createGroupDto.status,
                type: createGroupDto.type,
            },
        });

        return this.findOne(group.id);
    }

    async findAll() {
        const groups = await this.prisma.groups.findMany({
            include: {
                participantsGroup: true,
            }
        });

        return groups.map(group => {
            const { participantsGroup, ...groupData } = group;
            return {
                ...groupData,
                participants: participantsGroup.length
            }
        }
        );
    }

    async findOne(id: string) {
        const group = await this.prisma.groups.findUnique({
            where: { id },
            include: {
                participantsGroup: true
            }
        });
        if (!group) {
            throw new NotFoundException(`Group with ID ${id} not found`);
        }
        const { participantsGroup, ...groupData } = group;
        return {
            ...groupData,
            participants: participantsGroup.length
        }
    }

    // UPDATE
    async update(id: string, updateGroupDto: UpdateGroupDto) {
        // Verifica se existe antes de atualizar
        await this.findOne(id);
        const additionalInfo = updateGroupDto.additionalInfo ? instanceToPlain<AdditionalInfoDto>(updateGroupDto.additionalInfo) : undefined;
        const coordinator = updateGroupDto.coordinatorId ? { connect: { id: updateGroupDto.coordinatorId } } : undefined;
        await this.prisma.groups.update({
            where: { id },
            data: {
                name: updateGroupDto.name,
                configEndHour: updateGroupDto.configEndHour,
                configMax: updateGroupDto.configMax,
                configMin: updateGroupDto.configMin,
                configStartHour: updateGroupDto.configStartHour,
                configWeekday: updateGroupDto.configWeekday,
                additionalInfo: additionalInfo,
                coordinator: coordinator,
                status: updateGroupDto.status,
                type: updateGroupDto.type,
            },
        });

        return this.findOne(id);
    }

    // DELETE
    async remove(id: string) {
        // Verifica se existe antes de remover
        await this.findOne(id);
        // fazer delete cascade

        return this.prisma.groups.delete({
            where: { id },
        });
    }
}
