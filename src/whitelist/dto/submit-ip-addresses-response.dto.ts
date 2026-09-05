import { ApiProperty } from '@nestjs/swagger';

export class SubmitIpAddressesResponse {
  @ApiProperty({ example: 'wl_3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  requestId: string;

  @ApiProperty({ enum: ['queued'] })
  status: 'queued';

  @ApiProperty({
    example: '/api/whitelist/requests/wl_3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  statusUrl: string;
}
