import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { createTypeOrmOptions } from './database/typeorm-options.js';
import { WhitelistModule } from './whitelist/whitelist.module.js';

@Module({
  imports: [TypeOrmModule.forRoot(createTypeOrmOptions()), WhitelistModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
