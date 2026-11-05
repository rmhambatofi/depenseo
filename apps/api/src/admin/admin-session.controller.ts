// Session du back-office (F-ADM-01, ADR-042) : connexion TOTP, session courante, déconnexion.
import { Body, Delete, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AdminController, AdminLogin, CurrentAdmin } from './admin.guard.js';
import { AdminLoginService } from './admin-login.service.js';
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_PATH,
  ADMIN_SESSION_TTL_S,
  type AdminSession,
} from './admin-session-token.js';

/** §8.5 : `HttpOnly; Secure; SameSite=Strict; Path=/admin`, distinct du cookie web. */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: ADMIN_COOKIE_PATH,
} as const;

@AdminController('session')
export class AdminSessionController {
  constructor(private readonly login: AdminLoginService) {}

  @Post()
  @AdminLogin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async create(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<void> {
    const { token } = await this.login.login(body);
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(ADMIN_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: ADMIN_SESSION_TTL_S * 1000 });
  }

  @Get()
  current(@CurrentAdmin() session: AdminSession): { userId: string; expiresAt: string } {
    return { userId: session.userId, expiresAt: session.expiresAt.toISOString() };
  }

  /** Efface le cookie ; le jeton sans état expire de lui-même (30 min au plus, ADR-042). */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(ADMIN_COOKIE, COOKIE_OPTIONS);
  }
}
