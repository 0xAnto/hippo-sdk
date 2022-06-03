import { AptosParserRepo, getTypeTagFullname, StructTag } from "@manahippo/aptos-tsgen";
import { AptosClient, HexString, Types } from "aptos";
import bigInt from "big-integer";
import { Command } from "commander";
import { getParserRepo } from "../generated/repo";
import * as SwapTs from "../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790";
import * as X0x1 from "../generated/X0x1";
import { printResource, printResources, typeInfoToTypeTag } from "../utils";
import { readConfig, sendPayloadTx } from "./utils";
import { HippoSwapClient } from "../swap/hippoSwapClient";
import { HippoWalletClient } from "../wallet";


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
  const payload = await swapClient.makeCPSwapPayload(fromSymbol, toSymbol, uiAmtInNum, 0);
  await sendPayloadTx(client, account, payload);
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

program.addCommand(testCommand);

program.parse();