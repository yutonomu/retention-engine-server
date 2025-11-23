import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const defaultOrigins = ['http://localhost:3000', 'http://localhost:3001'];
  const corsOrigins =
    config
      .get<string>('CORS_ORIGIN')
      ?.split(',')
      .map((o) => o.trim()) ?? defaultOrigins;

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  const port = config.get<number>('PORT') ?? (Number(process.env.PORT) || 8080);
  await app.listen(port, '0.0.0.0');
}
bootstrap().catch((error) => {
  console.error('Failed to bootstrap application', error);
  process.exit(1);
});
