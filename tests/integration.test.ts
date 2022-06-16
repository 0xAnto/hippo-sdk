import { AptosAccount, AptosClient, FaucetClient } from 'aptos';
import { CONFIGS, getParserRepo, HippoSwapClient, HippoWalletClient } from '../src';
import { printResource } from '../src/utils';
import { AptosParserRepo } from '@manahippo/aptos-tsgen';
import { sendPayloadTx } from '../src/tools/utils';

const { localhost: HIPPO_CONF } = CONFIGS;


describe('Integration Tests', () => {
  let client: AptosClient, account: AptosAccount, swapClient: HippoSwapClient, walletClient: HippoWalletClient;
  let repo: AptosParserRepo;

  it('create dependency', async () => {
    client = new AptosClient(HIPPO_CONF.fullNodeUrl);
    account = new AptosAccount();
    const faucetClient = new FaucetClient(HIPPO_CONF.fullNodeUrl, HIPPO_CONF.faucetUrl);
    await faucetClient.fundAccount(account.address(), 100000);
    repo = getParserRepo();
    swapClient = await HippoSwapClient.createInOneCall(HIPPO_CONF, client, getParserRepo());
    walletClient = await HippoWalletClient.createInTwoCalls(HIPPO_CONF, client, repo, account.address());

  });

  it('get quotes of USDC -> DAI', async () => {
    const result = await swapClient.getBestQuoteBySymbols('USDC', 'DAI', 10, 3);
    const { bestQuote } = result!;
    printResource(bestQuote);
  });

  it('get quotes of BTC -> USDT', async () => {
    // CP Swap Pool
    const result = await swapClient.getBestQuoteBySymbols('USDT', 'BTC',10, 3);
    const { bestQuote } = result!;
    printResource(bestQuote);
  });

  it('faucet mint coins for account', async () => {
    await sendPayloadTx(client, account, await walletClient.makeFaucetMintToPayload(100, 'BTC'));
    await sendPayloadTx(client, account, await walletClient.makeFaucetMintToPayload(1000, 'USDT'));
    await sendPayloadTx(client, account, await walletClient.makeFaucetMintToPayload(1000, 'USDC'));
    await sendPayloadTx(client, account, await walletClient.makeFaucetMintToPayload(1000, 'DAI'));
    await walletClient.refreshStores();
    walletClient.debugPrint();
  });

  it('get direct pool', async () => {
    let pools = await swapClient.getDirectPoolsBySymbols('USDT', 'BTC');
    printResource(pools.map(pool => pool.lpTokenInfo.name));
    pools = await swapClient.getDirectPoolsBySymbols('USDC', 'DAI');
    printResource(pools.map(pool => pool.lpTokenInfo.name));
  });


});
