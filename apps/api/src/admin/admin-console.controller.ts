// Pages du back-office (§8.5, F-ADM-01/03, ADR-044) : `/admin/login` est la seule page publique ;
// `/admin/` et `/admin/assets/*` passent par `AdminGuard` (404 sans session admin, accès tracé).
// L'application React-admin utilise un routeur par fragment (`/admin/#/users`) : aucune autre URL.
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { ADMIN_AREA } from '../auth/access-token.guard.js';
import { AdminGuard, AdminLogin } from './admin.guard.js';
import {
  ADMIN_CONSOLE,
  type AdminConsole,
  CONSOLE_CSP,
  type ConsoleFile,
  type ConsoleZone,
} from './admin-console.js';

@Controller('admin')
@SetMetadata(ADMIN_AREA, true)
@UseGuards(AdminGuard)
@ApiExcludeController()
export class AdminConsoleController {
  constructor(@Inject(ADMIN_CONSOLE) private readonly console: AdminConsole | null) {}

  @Get('login')
  @AdminLogin()
  loginPage(@Res() res: Response): void {
    this.send(res, this.file('login'));
  }

  @Get('login/assets/:file')
  @AdminLogin()
  loginAsset(@Param('file') file: string, @Res() res: Response): void {
    this.send(res, this.file('login', file));
  }

  @Get()
  appPage(@Res() res: Response): void {
    this.send(res, this.file('app'));
  }

  @Get('assets/:file')
  appAsset(@Param('file') file: string, @Res() res: Response): void {
    this.send(res, this.file('app', file));
  }

  private file(zone: ConsoleZone, asset?: string): ConsoleFile {
    const found = asset === undefined ? this.console?.page(zone) : this.console?.asset(zone, asset);
    if (!found) throw new NotFoundException();
    return found;
  }

  private send(res: Response, file: ConsoleFile): void {
    res
      .status(200)
      .set({
        'Content-Type': file.contentType,
        // Session de 30 min et code d'administration : rien en cache, ni partagé ni local.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': CONSOLE_CSP,
        'Referrer-Policy': 'no-referrer',
      })
      .end(file.body);
  }
}
