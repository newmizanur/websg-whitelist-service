import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { configFactories, databaseConfig } from './config/index.js';
import { validate } from './config/environment-variables.js';
import { createTypeOrmOptions } from './database/typeorm-options.js';
import { WhitelistModule } from './whitelist/whitelist.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: configFactories,
    }),
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: createTypeOrmOptions,
    }),
    WhitelistModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
