import { ErrorAlerter } from './error-alert.filter';

describe('ErrorAlerter', () => {
  it('sends the same error once per 5 minutes, different errors separately', () => {
    const telegram = { sendErrorAlert: jest.fn().mockResolvedValue(undefined) };
    const alerter = new ErrorAlerter(telegram as any);

    alerter.alert('500 GET /x', new Error('boom'));
    alerter.alert('500 GET /x', new Error('boom'));
    alerter.alert('500 GET /y', new Error('boom'));

    expect(telegram.sendErrorAlert).toHaveBeenCalledTimes(2);
    expect(telegram.sendErrorAlert.mock.calls[0][0]).toMatchObject({ title: '500 GET /x' });
  });
});
