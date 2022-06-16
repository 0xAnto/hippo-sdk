import { AptosParserRepo, AptosVectorU8, getTypeTagFullname, StructTag } from "@manahippo/aptos-tsgen";
import { AptosClient, HexString, Types } from "aptos";
import bigInt from "big-integer";
import { Command } from "commander";
import { getParserRepo } from "../generated/repo";
import * as SwapTs from "../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790";
import * as X0x1 from "../generated/X0x1";
import { printResource, printResources, typeInfoToTypeTag } from "../utils";
import { readConfig, sendPayloadTx, simulatePayloadTx } from "./utils";
import { HippoSwapClient } from "../swap/hippoSwapClient";
import { HippoWalletClient } from "../wallet";
import { CoinInfo } from "../generated/X0x1/Coin";
import { time } from "console";
import { PoolType } from "../swap/baseTypes";


const actionShowTokenRegistry = async () => {
  const {client, account, contractAddress} = readConfig(program);
  const repo = getParserRepo();
  const tokens = await SwapTs.TokenRegistry.TokenRegistry.load(repo, client, contractAddress, []);
  printResource(tokens);
}

const actionShowPools = async () => {
  const {client, account, contractAddress} = readConfig(program);
  const repo = getParserRepo();
  const tokens = await SwapTs.TokenRegistry.TokenRegistry.load(repo, client, contractAddress, []);
  const tokenList = tokens.token_info_list;
  for(const pi of tokenList) {
    const structTag = typeInfoToTypeTag(pi.token_type);
    if (
      structTag instanceof StructTag &&
      structTag.address.hex() === contractAddress.hex() &&
      structTag.module === SwapTs.CPSwap.moduleName &&
      structTag.name === SwapTs.CPSwap.LPToken.structName
    ) {
      // found our LPToken!
      console.log(structTag.typeParams);
      const poolMeta = await SwapTs.CPSwap.TokenPairMetadata.load(repo, client, contractAddress, structTag.typeParams);
      printResource(poolMeta);
      const poolReserve = await SwapTs.CPSwap.TokenPairReserve.load(repo, client, contractAddress, structTag.typeParams);
      printResource(poolReserve);
    }
    else if (
      structTag instanceof StructTag &&
      structTag.address.hex() == contractAddress.hex() &&
      structTag.module === SwapTs.StableCurveSwap.moduleName &&
      structTag.name === SwapTs.StableCurveSwap.LPToken.structName
    ){
      console.log(structTag.typeParams)
      const poolMeta = await SwapTs.StableCurveSwap.StableCurvePoolInfo.load(repo, client, contractAddress, structTag.typeParams);
      printResource(poolMeta);
    }
  }
}

const actionHitFaucet = async (coinSymbol:string, rawAmount: string, options: any) => {
  const amount = bigInt(rawAmount);
  if (amount.leq(0)) {
    throw new Error("Amount should be number greater than 0, but got: "+rawAmount);
  }
  const {client, account, contractAddress} = readConfig(program);
  const repo = getParserRepo();
  const registry = await SwapTs.TokenRegistry.TokenRegistry.load(repo, client, contractAddress, []);
  for(const ti of registry.token_info_list) {
    if (ti.delisted) {
      continue;
    }
    if (ti.symbol === coinSymbol) {
      const coinTypeTag = typeInfoToTypeTag(ti.token_type);
      const result = await SwapTs.MockCoin.faucet_mint_to_script(client, account, amount, [coinTypeTag]);
      console.log(result);
      return;
    }
  }
  throw new Error(`Did not find a token with symbol=${coinSymbol}}`);
}

const actionShowWallet = async() => {
  const {client, account, contractAddress} = readConfig(program);
  const repo = getParserRepo();
  const registry = await SwapTs.TokenRegistry.TokenRegistry.load(repo, client, contractAddress, []);
  for(const ti of registry.token_info_list) {
    if(ti.delisted) {
      continue;
    }
    const coinTypeTag = typeInfoToTypeTag(ti.token_type);
    try{
      const coin = await X0x1.Coin.CoinStore.load(repo, client, account.address(), [coinTypeTag])
      console.log(`${ti.symbol}: ${coin.coin.value}`);
    }
    catch(e) {
      continue;
    }
  }
}

const getFromToAndLps = async(
  repo: AptosParserRepo,
  client: AptosClient,
  contractAddress: HexString,
  fromSymbol: string,
  toSymbol: string
) => {
  const registry = await SwapTs.TokenRegistry.TokenRegistry.load(repo, client, contractAddress, []);
  let fromTag, toTag;
  const lpTokenTags = [];
  const symbolToCoinTagFullname: Record<string, string> = {};
  for(const ti of registry.token_info_list) {
    if(ti.delisted) {
      continue;
    }
    const coinTypeTag = typeInfoToTypeTag(ti.token_type);
    symbolToCoinTagFullname[ti.symbol] = getTypeTagFullname(coinTypeTag);
    if(ti.symbol === fromSymbol) {
      fromTag = coinTypeTag;
    }
    else if(ti.symbol === toSymbol) {
      toTag = coinTypeTag;
    }

    // look for our LP token
    if (
      coinTypeTag instanceof StructTag &&
      coinTypeTag.address.hex() === contractAddress.hex() &&
      coinTypeTag.module === SwapTs.CPSwap.moduleName &&
      coinTypeTag.name === SwapTs.CPSwap.LPToken.structName
    ) {
      lpTokenTags.push(coinTypeTag);
    }
  }
  if(!fromTag) {
    throw new Error(`Unsupported coin symbol: ${fromSymbol}`);
  }
  if(!toTag) {
    throw new Error(`Unsupported coin symbol: ${toSymbol}`);
  }
  return {fromTag, toTag, lpTokenTags};
}

const actionSwap = async(fromSymbol: string, toSymbol: string, amountIn: string) => {
  const amount = bigInt(amountIn);
  if (amount.leq(0)) {
    throw new Error("Amount should be number greater than 0, but got: "+amountIn);
  }
  const {client, account, contractAddress} = readConfig(program);
  const repo = getParserRepo();
  const {fromTag, toTag, lpTokenTags} = await getFromToAndLps(repo, client, contractAddress, fromSymbol, toSymbol);
  const fromFullname = getTypeTagFullname(fromTag);
  const toFullname = getTypeTagFullname(toTag);

  // identify a pool where the LHS and RHS tokens are exactly fromTag and toTag
  for(const lpTag of lpTokenTags) {
    const lhsFullname = getTypeTagFullname(lpTag.typeParams[0]);
    const rhsFullname = getTypeTagFullname(lpTag.typeParams[1]);
    if(lhsFullname === fromFullname && rhsFullname === toFullname) {
      const result = await SwapTs.CPScripts.swap_script(client, account, amount, bigInt(0), bigInt(0), bigInt(0), lpTag.typeParams);
      console.log(result);
      return;
    }
    else if(rhsFullname === fromFullname && lhsFullname === toFullname) {
      const result = await SwapTs.CPScripts.swap_script(client, account, bigInt(0), amount, bigInt(0), bigInt(0), lpTag.typeParams);
      console.log(result);
      return;
    }
  }
  throw new Error(`Did not find a pool directly from ${fromSymbol} to ${toSymbol}`);
}

const actionAddLiquidity = async(lhsSymbol: string, rhsSymbol: string, lhsAmtIn: string, rhsAmtIn: string) => {
  const lhsAmt = bigInt(lhsAmtIn);
  if (lhsAmt.leq(0)) {
    throw new Error("Amount should be number greater than 0, but got: "+lhsAmtIn);
  }
  const rhsAmt = bigInt(rhsAmtIn);
  if (rhsAmt.leq(0)) {
    throw new Error("Amount should be number greater than 0, but got: "+rhsAmtIn);
  }
  const {client, account, contractAddress} = readConfig(program);
  const repo = getParserRepo();
  const {fromTag, toTag, lpTokenTags} = await getFromToAndLps(repo, client, contractAddress, lhsSymbol, rhsSymbol);
  const fromFullname = getTypeTagFullname(fromTag);
  const toFullname = getTypeTagFullname(toTag);
  for(const lpTag of lpTokenTags) {
    const lhsFullname = getTypeTagFullname(lpTag.typeParams[0]);
    const rhsFullname = getTypeTagFullname(lpTag.typeParams[1]);
    if(lhsFullname === fromFullname && rhsFullname === toFullname) {
      const result = await SwapTs.CPScripts.add_liquidity_script(client, account, lhsAmt, rhsAmt, lpTag.typeParams);
      console.log(result);
      return;
    }
  }
  throw new Error(`Did not find a pool for ${lhsSymbol}-${rhsSymbol}`);
}

const actionRemoveLiquidity = async(lhsSymbol: string, rhsSymbol: string, removeAmtStr: string) => {
  const removeAmt = bigInt(removeAmtStr);
  if (removeAmt.leq(0)) {
    throw new Error("Amount should be number greater than 0, but got: "+removeAmtStr);
  }
  const {client, account, contractAddress} = readConfig(program);
  const repo = getParserRepo();
  const {fromTag, toTag, lpTokenTags} = await getFromToAndLps(repo, client, contractAddress, lhsSymbol, rhsSymbol);
  const fromFullname = getTypeTagFullname(fromTag);
  const toFullname = getTypeTagFullname(toTag);
  for(const lpTag of lpTokenTags) {
    const lhsFullname = getTypeTagFullname(lpTag.typeParams[0]);
    const rhsFullname = getTypeTagFullname(lpTag.typeParams[1]);
    if(lhsFullname === fromFullname && rhsFullname === toFullname) {
      const result = await SwapTs.CPScripts.remove_liquidity(client, account, removeAmt, bigInt(0), bigInt(0), lpTag.typeParams);
      console.log(result);
      return;
    }
  }
  throw new Error(`Did not find a pool for ${lhsSymbol}-${rhsSymbol}`);
}

const actionMockDeploy = async () => {
  const {client, account, contractAddress} = readConfig(program);
  const payload = await SwapTs.CPScripts.build_payload_mock_deploy_script([]);
  await sendPayloadTx(client, account, payload, 10000);
  const stableCurvePayload = await SwapTs.StableCurveScripts.build_payload_mock_deploy_script([])
  await sendPayloadTx(client, account, stableCurvePayload, 10000);
}

const actionListModules = async () => {
  const {client, account, contractAddress} = readConfig(program);
  try{
    console.log(client.nodeUrl);
    const result = await client.getAccountModules(contractAddress);
    printResources(result);
  }
  catch(e) {
    console.log(e);
  }
}

const program = new Command();

program
  .name('hippo-cli')
  .description('Hippo SDK cli tool.')
  .requiredOption('-c, --config <path>', 'path to your aptos config.yml (generated with "aptos init")')
  .option('-p, --profile <PROFILE>', 'aptos config profile to use', 'default')

program
  .command("mock-deploy")
  .action(actionMockDeploy);

program
  .command("list-modules")
  .action(actionListModules);

program
  .command("show-token-registry")
  .action(actionShowTokenRegistry);

program
  .command("show-pools")
  .action(actionShowPools);

program
  .command("hit-faucet")
  .argument('<coin-name>')
  .argument('<raw-amount>')
  .action(actionHitFaucet);

program
  .command("show-wallet")
  .action(actionShowWallet);

program
  .command("swap")
  .argument('<from-coin>')
  .argument('<to-coin>')
  .argument('<raw-amount-in>')
  .action(actionSwap);

program
  .command("add-liquidity")
  .argument('<lhs-coin>')
  .argument('<rhs-coin>')
  .argument('<raw-lhs-amount-in>')
  .argument('<raw-rhs-amount-in>')
  .action(actionAddLiquidity);

program
  .command("remove-liquidity")
  .argument('<lhs-coin>')
  .argument('<rhs-coin>')
  .argument('<liquidity-amount-out>')
  .action(actionRemoveLiquidity);


const testCommand = new Command("test");

const testHippoClient = async () => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const swapClient = await HippoSwapClient.createInOneCall(netConf, client, repo);
  swapClient.printSelf();
}

const testWalletClient = async () => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const walletClient = await HippoWalletClient.createInTwoCalls(netConf, client, repo, account.address());
  walletClient.debugPrint();
}

const testWalletClientFaucet = async (symbol: string, uiAmount: string) => {
  const uiAmountNum = Number.parseFloat(uiAmount);
  if(uiAmountNum <= 0) {
    throw new Error(`Input amount needs to be greater than 0`);
  }
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const walletClient = await HippoWalletClient.createInTwoCalls(netConf, client, repo, account.address());
  const payload = await walletClient.makeFaucetMintToPayload(uiAmountNum, symbol);
  await sendPayloadTx(client, account, payload);
  await walletClient.refreshStores();
  walletClient.debugPrint();
}

const testClientSwap = async(fromSymbol: string, toSymbol: string, uiAmtIn: string) => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const swapClient = await HippoSwapClient.createInOneCall(netConf, client, repo);
  const uiAmtInNum = Number.parseFloat(uiAmtIn);
  if(uiAmtInNum <= 0) {
    throw new Error(`Input amount needs to be greater than 0`);
  }
  const result = swapClient.getBestQuoteBySymbols(fromSymbol, toSymbol, uiAmtInNum, 3);
  if (!result) {
    console.log("No route");
    return;
  }
  const {bestRoute} = result;
  const payload = await bestRoute.makeSwapPayload(uiAmtInNum, 0);
  await sendPayloadTx(client, account, payload);
  await testWalletClient();
}

const testClientSimulateSwap = async(fromSymbol: string, toSymbol: string, uiAmtIn: string) => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const swapClient = await HippoSwapClient.createInOneCall(netConf, client, repo);
  const uiAmtInNum = Number.parseFloat(uiAmtIn);
  if(uiAmtInNum <= 0) {
    throw new Error(`Input amount needs to be greater than 0`);
  }
  const result = swapClient.getBestQuoteBySymbols(fromSymbol, toSymbol, uiAmtInNum, 3);
  if (!result) {
    console.log("No route");
    return;
  }
  const {bestRoute} = result;
  const payload = await bestRoute.makeSwapPayload(uiAmtInNum, 0);
  const simResult = await simulatePayloadTx(client, account, payload);
  printResource(simResult);
  await testWalletClient();
}

const testClientQuote = async(fromSymbol: string, toSymbol: string, uiAmtIn: string) => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const swapClient = await HippoSwapClient.createInOneCall(netConf, client, repo);
  const uiAmtInNum = Number.parseFloat(uiAmtIn);
  if(uiAmtInNum <= 0) {
    throw new Error(`Input amount needs to be greater than 0`);
  }
  const result = await swapClient.getBestQuoteBySymbols(fromSymbol, toSymbol, uiAmtInNum, 3);
  if (!result) {
    console.log("No route");
    return;
  }
  const {bestQuote} = result;
  printResource(bestQuote);
}

const poolTypeMap = {
  cp: PoolType.CONSTANT_PRODUCT,
  stable: PoolType.STABLE_CURVE,
}

function cliPoolTypeToPoolType(poolType: string): PoolType {
  if (poolType in poolTypeMap) {
    return poolTypeMap[poolType as keyof typeof poolTypeMap];
  }
  throw new Error(`${poolType} does not refer to a valid poolType. Valid values are: ${Object.keys(poolTypeMap)}`);
}

const testClientAddLiquidity = async(poolTypeStr: string, lhsSymbol: string, rhsSymbol: string, lhsUiAmtStr: string, rhsUiAmtStr: string) => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const swapClient = await HippoSwapClient.createInOneCall(netConf, client, repo);
  const lhsUiAmt = Number.parseFloat(lhsUiAmtStr);
  const rhsUiAmt = Number.parseFloat(rhsUiAmtStr);
  if(lhsUiAmt <= 0 || rhsUiAmt <= 0) {
    throw new Error(`Input amount needs to be greater than 0`);
  }
  const poolType = cliPoolTypeToPoolType(poolTypeStr);
  const pools = await swapClient.getDirectPoolsBySymbolsAndPoolType(lhsSymbol, rhsSymbol, poolType);
  if (pools.length === 0) {
    return;
  }
  if (pools.length !== 1) {
    console.log("Found multiple pools of the same type???");
    return;
  }
  if (pools[0].xTokenInfo.symbol !== lhsSymbol || pools[0].yTokenInfo.symbol !== rhsSymbol) {
    console.log("Pool mismatch");
    return;
  }
  const payload = await pools[0].makeAddLiquidityPayload(lhsUiAmt, rhsUiAmt);
  await sendPayloadTx(client, account, payload);
  await testWalletClient();
}

const testClientRemoveLiquidity = async(poolTypeStr: string, lhsSymbol: string, rhsSymbol: string, liquidityUiAmtStr: string) => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const swapClient = await HippoSwapClient.createInOneCall(netConf, client, repo);
  const liquidityUiAmt = Number.parseFloat(liquidityUiAmtStr);
  if(liquidityUiAmt <= 0) {
    throw new Error(`Input amount needs to be greater than 0`);
  }
  const poolType = cliPoolTypeToPoolType(poolTypeStr);
  const pools = await swapClient.getDirectPoolsBySymbolsAndPoolType(lhsSymbol, rhsSymbol, poolType);
  if (pools.length === 0) {
    console.log("Corresponding pool does not exist");
    return;
  }
  if (pools.length !== 1) {
    console.log("Found multiple pools of the same type???");
    return;
  }
  if (pools[0].xTokenInfo.symbol !== lhsSymbol || pools[0].yTokenInfo.symbol !== rhsSymbol) {
    console.log("Pool mismatch");
    return;
  }
  const payload = await pools[0].makeRemoveLiquidityPayload(liquidityUiAmt, 0, 0);
  await sendPayloadTx(client, account, payload);
  await testWalletClient();
}

const testShowSupply = async(symbol: string) => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const swapClient = await HippoSwapClient.createInOneCall(netConf, client, repo);
  const supply = await swapClient.getTokenTotalSupplyBySymbol(symbol);
  console.log(supply);
}

const testShowRoutes = async(lhsSymbol: string, rhsSymbol: string) => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const swapClient = await HippoSwapClient.createInOneCall(netConf, client, repo);
  const routes = swapClient.getSteppedRoutesBySymbol(lhsSymbol, rhsSymbol, 3);
  printResources(routes.map(r=>r.summarize()));
}

// sub-commands
testCommand
  .command("hippo-client")
  .action(testHippoClient);

testCommand
  .command("wallet-client")
  .action(testWalletClient);

testCommand
  .command("wallet-client-faucet")
  .argument("<token-symbol>")
  .argument("<token-amount>")
  .action(testWalletClientFaucet);

testCommand
  .command("swap")
  .argument("<from-symbol>")
  .argument("<to-symbol>")
  .argument("<ui-amount-in>")
  .action(testClientSwap);

testCommand
  .command("simulate-swap")
  .argument("<from-symbol>")
  .argument("<to-symbol>")
  .argument("<ui-amount-in>")
  .action(testClientSimulateSwap);

testCommand
  .command("quote")
  .argument("<from-symbol>")
  .argument("<to-symbol>")
  .argument("<ui-amount-in>")
  .action(testClientQuote);

testCommand
  .command("add-liquidity")
  .argument("<pool-type>", "pool-type may be 'cp' or 'stable'")
  .argument("<lhs-symbol>")
  .argument("<rhs-symbol>")
  .argument("<lhs-ui-amount-in>")
  .argument("<rhs-ui-amount-in>")
  .action(testClientAddLiquidity);

testCommand
  .command("remove-liquidity")
  .argument("<pool-type>", "pool-type may be 'cp' or 'stable'")
  .argument("<lhs-symbol>")
  .argument("<rhs-symbol>")
  .argument("<liquidity-ui-amount>")
  .action(testClientRemoveLiquidity);

testCommand
  .command("show-supply")
  .argument("<SYMBOL>")
  .action(testShowSupply);

testCommand
  .command("show-routes")
  .argument("<lhs-symbol>")
  .argument("<rhs-symbol>")
  .action(testShowRoutes);

program.addCommand(testCommand);

// other random things

const checkTestCoin = async () => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const repo = getParserRepo();
  const testCoinTag = new StructTag(
    X0x1.TestCoin.moduleAddress,
    X0x1.TestCoin.moduleName,
    X0x1.TestCoin.TestCoin.structName,
    []
  );
  const testCoinInfo = await CoinInfo.load(repo, client, X0x1.TestCoin.moduleAddress, [testCoinTag])
  printResource(testCoinInfo);
  const registry = await SwapTs.TokenRegistry.TokenRegistry.load(repo, client, contractAddress, []);
  for(const tokenInfo of registry.token_info_list) {
    if(tokenInfo.delisted) {
      continue;
    }
    const tag = typeInfoToTypeTag(tokenInfo.token_type);
    if(getTypeTagFullname(tag) === getTypeTagFullname(testCoinTag)) {
      console.log("TestCoin already registered.");
      return;
    }
  }
  const result = await SwapTs.TokenRegistry.add_token_script(
    client,
    account,
    new AptosVectorU8("TestCoin"),
    new AptosVectorU8("APTOS"),
    new AptosVectorU8("Aptos TestCoin"),
    testCoinInfo.decimals.toJSNumber(),
    new AptosVectorU8("https://miro.medium.com/max/3150/1*Gf747eyRywU8Img0tK5wvw.png"),
    new AptosVectorU8("https://aptoslabs.com/"),
    [testCoinTag]
  );
  console.log(result);
}

const updateTokenRegistry = async (symbol: string, description: string, logo_url: string, project_url: string) => {
  const {client, account, contractAddress, netConf} = readConfig(program);
  const payload = SwapTs.TokenRegistry.build_payload_update_token_info_script(
    new AptosVectorU8(symbol),
    new AptosVectorU8(description),
    new AptosVectorU8(logo_url),
    new AptosVectorU8(project_url),
    []
  );
  await sendPayloadTx(client, account, payload, 3000);
}

const others = new Command('others');

others
  .command("check-test-coin")
  .action(checkTestCoin);

others
  .command("update-token-registry")
  .argument("<SYMBOL>")
  .argument("<description>")
  .argument("<logo_url>")
  .argument("<project_url>")
  .action(updateTokenRegistry);

program.addCommand(others);

program.parse();
