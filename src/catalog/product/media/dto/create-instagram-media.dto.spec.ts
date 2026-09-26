import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInstagramMediaDto } from './create-instagram-media.dto';

const errs = async (url: string) =>
  (await validate(plainToInstance(CreateInstagramMediaDto, { url }))).map((e) => e.property);

describe('CreateInstagramMediaDto url', () => {
  it.each([
    'https://www.instagram.com/p/AbC_1-x/',
    'https://instagram.com/reel/XYZ123',
    'http://www.instagram.com/reels/abc/?igsh=1',
    'https://instagram.com/tv/abc',
  ])('accepts %s', async (url) => expect(await errs(url)).toEqual([]));

  it.each([
    'https://evil.com/p/abc',
    'https://instagram.com.evil.com/p/abc',
    'https://www.instagram.com/stories/abc',
    'https://www.instagram.com/someuser/',
    'ftp://instagram.com/p/abc',
    'instagram.com/p/abc',
  ])('rejects %s', async (url) => expect(await errs(url)).toEqual(['url']));
});
