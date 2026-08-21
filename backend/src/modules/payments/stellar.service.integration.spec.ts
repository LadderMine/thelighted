// Real-network integration test: loads a freshly-funded testnet account
// through StellarService and reads its balances against the actual Horizon
// testnet (issue #312 acceptance criterion). This makes a live network call
// and is NOT part of the fast, hermetic unit suite CI gates on — it only
// runs when explicitly opted into, e.g.:
//
//   RUN_STELLAR_INTEGRATION_TESTS=true npm run test -- stellar.service.integration
//
import { Keypair } from '@stellar/stellar-sdk';
import { ConfigService } from '@nestjs/config';
import { StellarService } from './stellar.service';

const runIntegration = process.env.RUN_STELLAR_INTEGRATION_TESTS === 'true';
const describeIfEnabled = runIntegration ? describe : describe.skip;

describeIfEnabled('StellarService (real Horizon testnet)', () => {
  jest.setTimeout(30_000);

  it('loads a freshly-funded testnet account and reads its balances', async () => {
    const config = new ConfigService({
      STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      STELLAR_NETWORK: 'testnet',
    });
    const service = new StellarService(config);
    service.onModuleInit();

    const keypair = Keypair.random();

    const friendbotResponse = await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(keypair.publicKey())}`,
    );
    expect(friendbotResponse.ok).toBe(true);

    const account = await service.loadAccount(keypair.publicKey());

    expect(account.accountId()).toBe(keypair.publicKey());
    expect(account.balances.length).toBeGreaterThan(0);
    expect(account.balances.some((b) => b.asset_type === 'native')).toBe(true);
  });
});
