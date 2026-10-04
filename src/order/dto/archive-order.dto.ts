import { IsBoolean } from 'class-validator';

export class ArchiveOrderDto {
    /** true — в архів, false — відновити */
    @IsBoolean()
    archived!: boolean;
}
