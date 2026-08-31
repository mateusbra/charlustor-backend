import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(private readonly usersService: UsersService) {}

  async onModuleInit() {
    const email = process.env.SEED_ADMIN_EMAIL;
    if (!email) return;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.warn(
        `SEED_ADMIN_EMAIL is set to "${email}" but no user with that email exists yet — register the account, then restart the backend to promote it.`,
      );
      return;
    }

    if (user.role === 'ADMIN') return;

    await this.usersService.updateRole(user.id, 'ADMIN');
    this.logger.log(`Promoted ${email} to ADMIN via SEED_ADMIN_EMAIL.`);
  }
}
