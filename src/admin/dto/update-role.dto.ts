import { IsIn } from 'class-validator';
import type { Role } from '../../generated/prisma/enums.js';

export class UpdateRoleDto {
  @IsIn(['PLAYER', 'ORGANIZER', 'ADMIN'])
  role!: Role;
}
