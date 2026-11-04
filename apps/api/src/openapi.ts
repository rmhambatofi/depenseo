// Contrat OpenAPI généré depuis les décorateurs ; écrit dans apps/api/openapi.json par `pnpm openapi`.
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Depenseo API')
    .setDescription(
      'API de suivi des dépenses. Montants en centimes, dates calendaires AAAA-MM-JJ.',
    )
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function serializeOpenApi(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
