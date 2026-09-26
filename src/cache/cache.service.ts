import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? (JSON.parse(data) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  async invalidateProduct(slug?: string): Promise<void> {
    await this.delByPattern('catalog:*');
    await this.delByPattern('filters:*');
    if (slug) {
      await this.del(`product:${slug}`);
    } else {
      await this.delByPattern('product:*');
    }
    await this.delByPattern('related:*');
  }

  async invalidateCategory(): Promise<void> {
    await this.del('categories');
    await this.delByPattern('catalog:*');
    await this.delByPattern('filters:*');
  }

  async invalidateHomepage(): Promise<void> {
    await this.del('homepage:hero-slides');
    await this.delByPattern('homepage:promo-blocks:*');
  }

  async invalidateHeroSlides(): Promise<void> {
    await this.del('homepage:hero-slides');
  }

  async invalidatePromoBlocks(): Promise<void> {
    await this.delByPattern('homepage:promo-blocks:*');
  }

  async invalidateRelated(): Promise<void> {
    await this.delByPattern('related:*');
  }
}
