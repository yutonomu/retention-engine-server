import { Global, Module } from '@nestjs/common';
import { createAdminSupabaseClient } from './adminClient';

@Global()
@Module({
  providers: [
    {
      provide: 'SUPABASE_ADMIN_CLIENT',
      useFactory: () => createAdminSupabaseClient(),
    },
  ],
  exports: ['SUPABASE_ADMIN_CLIENT'],
})
export class SupabaseModule {}
