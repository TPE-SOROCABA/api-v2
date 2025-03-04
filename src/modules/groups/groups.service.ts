import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { instanceToPlain } from 'class-transformer';
import { AdditionalInfoDto } from './dto/additional-info.dto';

@Injectable()
export class GroupsService {
    constructor(private readonly prisma: PrismaService) { }

    // CREATE
    async create(createGroupDto: CreateGroupDto) {
        const additionalInfo = createGroupDto.additionalInfo ? instanceToPlain<AdditionalInfoDto>(createGroupDto.additionalInfo) : undefined;
        const coordinator = createGroupDto.coordinatorId ? { connect: { id: createGroupDto.coordinatorId } } : undefined;
        return this.prisma.groups.create({
            data: {
                name: createGroupDto.name,
                config_end_hour: createGroupDto.config_end_hour,
                config_max: createGroupDto.config_max,
                config_min: createGroupDto.config_min,
                config_start_hour: createGroupDto.config_start_hour,
                config_weekday: createGroupDto.config_weekday,
                additionalInfo: additionalInfo,
                coordinator: coordinator,
            },
        });
    }

    // READ ALL
    async findAll() {
        return this.prisma.groups.findMany();
    }

    // READ ONE
    async findOne(id: string) {
        const group = await this.prisma.groups.findUnique({
            where: { id },
        });
        if (!group) {
            throw new NotFoundException(`Group with ID ${id} not found`);
        }
        return group;
    }

    // UPDATE
    async update(id: string, updateGroupDto: UpdateGroupDto) {
        // Verifica se existe antes de atualizar
        await this.findOne(id);
        const additionalInfo = updateGroupDto.additionalInfo ? instanceToPlain<AdditionalInfoDto>(updateGroupDto.additionalInfo) : undefined;
        const coordinator = updateGroupDto.coordinatorId ? { connect: { id: updateGroupDto.coordinatorId } } : undefined;
        return this.prisma.groups.update({
            where: { id },
            data: {
                name: updateGroupDto.name,
                config_end_hour: updateGroupDto.config_end_hour,
                config_max: updateGroupDto.config_max,
                config_min: updateGroupDto.config_min,
                config_start_hour: updateGroupDto.config_start_hour,
                config_weekday: updateGroupDto.config_weekday,
                additionalInfo: additionalInfo,
                coordinator: coordinator,
            },
        });
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
