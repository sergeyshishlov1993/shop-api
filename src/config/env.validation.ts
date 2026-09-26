import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    PORT: Joi.number().default(3000),
    API_PREFIX: Joi.string().default('api'),

    DATABASE_URL: Joi.string().required(),

    REDIS_HOST: Joi.string().default('localhost'),
    REDIS_PORT: Joi.number().default(6379),

    JWT_ACCESS_SECRET: Joi.string().required(),
    JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
    JWT_REFRESH_SECRET: Joi.string().required(),
    JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

    S3_ENDPOINT: Joi.string().required(),
    S3_REGION: Joi.string().default('us-east-1'),
    S3_ACCESS_KEY: Joi.string().required(),
    S3_SECRET_KEY: Joi.string().required(),
    S3_BUCKET: Joi.string().default('shop'),

    GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
    GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
    GOOGLE_CALLBACK_URL: Joi.string().allow('').default(''),

    RESEND_API_KEY: Joi.string().allow('').default(''),
    RESEND_FROM_EMAIL: Joi.string().default('noreply@example.com'),

    TELEGRAM_BOT_TOKEN: Joi.string().allow('').default(''),
    TELEGRAM_ADMIN_CHAT_ID: Joi.string().allow('').default(''),

    NOVA_POSHTA_API_KEY: Joi.string().allow('').default(''),

    // Хард-гейт онлайн-оплаты. Даже при 'true' витрина покажет её только если
    // включён и мягкий тумблер StoreSettings.onlinePaymentEnabled.
    PAYMENTS_ENABLED: Joi.string().valid('true', 'false').default('false'),

    FRONTEND_URL: Joi.string().default('http://localhost:3001'),

    ADMIN_EMAIL: Joi.string().email().default('admin@example.com'),
    ADMIN_PASSWORD: Joi.string().default('changeme'),
});