import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';

interface NovaPoshtaResponse {
    success: boolean;
    data: Array<{ Description: string }>;
}

interface NovaPoshtaTrackingResponse {
    success: boolean;
    data: Array<{
        Number: string;
        StatusCode: string;
        Status: string;
    }>;
}

export interface SelectOption {
    value: string;
    label: string;
}

export interface TrackingInfo {
    ttn: string;
    statusCode: string;
    statusDescription: string;
}

@Injectable()
export class DeliveryService {
    private readonly envApiKey: string;
    private readonly apiUrl = 'https://api.novaposhta.ua/v2.0/json/';

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        this.envApiKey = this.configService.get<string>('NOVA_POSHTA_API_KEY', '');
    }

    private async getApiKey(): Promise<string> {
        const settings = await this.prisma.storeSettings.findUnique({
            where: { id: 1 },
            select: { novaPoshtaApiKey: true },
        });

        return settings?.novaPoshtaApiKey?.trim() || this.envApiKey;
    }

    async searchCities(search: string): Promise<SelectOption[]> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: await this.getApiKey(),
                modelName: 'Address',
                calledMethod: 'getCities',
                methodProperties: {
                    FindByString: search,
                    Limit: '20',
                },
            }),
        });

        const result: NovaPoshtaResponse = await response.json();

        if (!result.success) return [];

        return result.data.map((item) => ({
            value: item.Description,
            label: item.Description,
        }));
    }

    async searchWarehouses(city: string, search?: string): Promise<SelectOption[]> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: await this.getApiKey(),
                modelName: 'Address',
                calledMethod: 'getWarehouses',
                methodProperties: {
                    CityName: city,
                    FindByString: search || '',
                    Limit: '30',
                },
            }),
        });

        const result: NovaPoshtaResponse = await response.json();

        if (!result.success) return [];

        return result.data.map((item) => ({
            value: item.Description,
            label: item.Description,
        }));
    }

    async getTrackingInfo(ttn: string): Promise<TrackingInfo | null> {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: await this.getApiKey(),
                    modelName: 'TrackingDocument',
                    calledMethod: 'getStatusDocuments',
                    methodProperties: {
                        Documents: [{ DocumentNumber: String(ttn).trim() }],
                    },
                }),
            });

            const result: NovaPoshtaTrackingResponse = await response.json();

            if (result.success && result.data.length > 0) {
                const data = result.data[0];
                return {
                    ttn: data.Number,
                    statusCode: data.StatusCode,
                    statusDescription: data.Status,
                };
            }

            return null;
        } catch (error) {
            console.error('[NovaPoshta] Error tracking:', error);
            return null;
        }
    }

    async getMultipleTrackingInfo(ttnList: string[]): Promise<TrackingInfo[]> {
        if (!ttnList || ttnList.length === 0) {
            return [];
        }

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: await this.getApiKey(),
                    modelName: 'TrackingDocument',
                    calledMethod: 'getStatusDocuments',
                    methodProperties: {
                        Documents: ttnList.map((ttn) => ({ DocumentNumber: String(ttn).trim() })),
                    },
                }),
            });

            const result: NovaPoshtaTrackingResponse = await response.json();

            return result.success
                ? result.data.map((data) => ({
                    ttn: data.Number,
                    statusCode: data.StatusCode,
                    statusDescription: data.Status,
                }))
                : [];
        } catch (error) {
            console.error('[NovaPoshta] Error multiple tracking:', error);
            return [];
        }
    }

    mapNovaPoshtaStatusToOrderStatus(npStatusCode: string): 'SHIPPED' | 'DELIVERED' | 'RETURNED' | null {
        const code = String(npStatusCode);

        if (['4', '41', '5', '6', '7', '8'].includes(code)) {
            return 'SHIPPED';
        }

        if (['9', '10', '11'].includes(code)) {
            return 'DELIVERED';
        }

        if (['102', '103', '108'].includes(code)) {
            return 'RETURNED';
        }

        return null;
    }

    // ─── Создание ТТН (InternetDocument) ───

    private async npCall<T = unknown>(
        apiKey: string,
        modelName: string,
        calledMethod: string,
        methodProperties: Record<string, unknown>,
    ): Promise<{ success: boolean; data: T[]; errors: string[] }> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
        });
        return response.json() as Promise<{ success: boolean; data: T[]; errors: string[] }>;
    }

    private async resolveCityRef(apiKey: string, cityName: string): Promise<string> {
        const res = await this.npCall<{ Ref: string }>(apiKey, 'Address', 'getCities', {
            FindByString: cityName,
            Limit: '1',
        });
        const ref = res.data?.[0]?.Ref;
        if (!ref) throw new BadRequestException(`Не знайдено місто Nova Poshta: ${cityName}`);
        return ref;
    }

    private async resolveWarehouseRef(apiKey: string, cityRef: string, warehouseName: string): Promise<string> {
        const res = await this.npCall<{ Ref: string; Description: string }>(apiKey, 'Address', 'getWarehouses', {
            CityRef: cityRef,
            FindByString: warehouseName,
            Limit: '50',
        });
        const match = res.data?.find((w) => w.Description === warehouseName) ?? res.data?.[0];
        if (!match?.Ref) throw new BadRequestException(`Не знайдено відділення Nova Poshta: ${warehouseName}`);
        return match.Ref;
    }

    /**
     * Создаёт экспресс-накладную (ТТН) для заказа и возвращает её номер.
     * Требует заполненных реквизитов отправителя в Настройках (кабинет NP).
     */
    async createInternetDocument(params: {
        recipientName: string;
        recipientPhone: string;
        cityName: string;
        warehouseName: string;
        cost: number;
        description: string;
        weightKg?: number;
    }): Promise<{ ttn: string }> {
        const settings = await this.prisma.storeSettings.findUnique({
            where: { id: 1 },
            select: {
                novaPoshtaApiKey: true,
                npSenderRef: true,
                npSenderContactRef: true,
                npSenderCityRef: true,
                npSenderWarehouseRef: true,
                npSenderPhone: true,
            },
        });
        const apiKey = settings?.novaPoshtaApiKey?.trim() || this.envApiKey;
        if (!apiKey) throw new BadRequestException('Не налаштовано Nova Poshta API key.');
        if (
            !settings?.npSenderRef ||
            !settings.npSenderContactRef ||
            !settings.npSenderCityRef ||
            !settings.npSenderWarehouseRef ||
            !settings.npSenderPhone
        ) {
            throw new BadRequestException('Не налаштовано відправника Nova Poshta (реквізити в Налаштуваннях).');
        }

        const [firstName, ...rest] = params.recipientName.trim().split(/\s+/);
        const lastName = rest.join(' ') || firstName;

        // 1) Получатель — приватное лицо (создаём контрагента + контакт).
        const recipientCity = await this.resolveCityRef(apiKey, params.cityName);
        const recipientWarehouse = await this.resolveWarehouseRef(apiKey, recipientCity, params.warehouseName);

        const cp = await this.npCall<{ Ref: string; ContactPerson: { data: Array<{ Ref: string }> } }>(
            apiKey,
            'Counterparty',
            'save',
            {
                FirstName: firstName,
                LastName: lastName,
                Phone: params.recipientPhone,
                CounterpartyType: 'PrivatePerson',
                CounterpartyProperty: 'Recipient',
            },
        );
        if (!cp.success || !cp.data?.[0]) {
            throw new BadRequestException(`Nova Poshta: ${cp.errors?.join(', ') || 'не вдалося створити отримувача'}`);
        }
        const recipientRef = cp.data[0].Ref;
        const recipientContactRef = cp.data[0].ContactPerson?.data?.[0]?.Ref;

        // 2) Экспресс-накладная.
        const doc = await this.npCall<{ IntDocNumber: string }>(apiKey, 'InternetDocument', 'save', {
            PayerType: 'Recipient',
            PaymentMethod: 'Cash',
            CargoType: 'Parcel',
            Weight: String(params.weightKg ?? 0.5),
            ServiceType: 'WarehouseWarehouse',
            SeatsAmount: '1',
            Description: params.description,
            Cost: String(Math.round(params.cost)),
            CitySender: settings.npSenderCityRef,
            Sender: settings.npSenderRef,
            SenderAddress: settings.npSenderWarehouseRef,
            ContactSender: settings.npSenderContactRef,
            SendersPhone: settings.npSenderPhone,
            CityRecipient: recipientCity,
            Recipient: recipientRef,
            RecipientAddress: recipientWarehouse,
            ContactRecipient: recipientContactRef,
            RecipientsPhone: params.recipientPhone,
        });
        if (!doc.success || !doc.data?.[0]?.IntDocNumber) {
            throw new BadRequestException(`Nova Poshta: ${doc.errors?.join(', ') || 'не вдалося створити ТТН'}`);
        }

        return { ttn: doc.data[0].IntDocNumber };
    }
}
