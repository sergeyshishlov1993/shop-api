import { FeedbackService } from './feedback.service';

describe('FeedbackService.findAll', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const service = new FeedbackService({ feedback: { findMany, count } } as any, {} as any);

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(0);
  });

  it('returns only active feedback by default', async () => {
    await service.findAll();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
  });

  it('can list only soft-deleted feedback for the restore screen', async () => {
    await service.findAll(undefined, 1, 100, true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: { not: null } } }));
    expect(count).toHaveBeenCalledWith({ where: { deletedAt: { not: null } } });
  });
});
