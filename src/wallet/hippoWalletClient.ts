import { AptosParserRepo, getTypeTagFullname, parseTypeTagOrThrow, StructTag } from "@manahippo/aptos-tsgen";
import { AptosClient, HexString } from "aptos";
import { NetworkConfiguration } from "../config";
import { MockCoin, TokenRegistry } from "../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790";
import * as X0x1 from "../generated/X0x1";
import { typeInfoToTypeTag } from "../utils";
import { tokenType } from "yaml/dist/parse/cst";
import bigInt from "big-integer";

export async function getCoinStoresForAddress(client: AptosClient, address: HexString, repo: AptosParserRepo) {
  const walletResources = await client.getAccountResources(address);
  const stores: X0x1.Coin.CoinStore[] = [];
  for(const resource of walletResources) {
    try{
      const typeTag = parseTypeTagOrThrow(resource.type);
      if(!(typeTag instanceof StructTag)) {
        continue;
      }
      // we only looking for 0x1::Coin::CoinStore
      if(
        typeTag.address.hex() !== X0x1.Coin.moduleAddress.hex() ||
        typeTag.module !== X0x1.Coin.moduleName ||
        typeTag.name !== X0x1.Coin.CoinStore.structName
      ) {
        continue;
      }
      const store = repo.parse(resource.data, typeTag) as unknown as X0x1.Coin.CoinStore;
      stores.push(store);
    }
    catch(e) {
      console.warn(`Failed to parse resource of type: ${resource.type}`);
      continue;
    }
  }
  return stores;
}


export class HippoWalletClient {
  public symbolToCoinStore: Record<string, X0x1.Coin.CoinStore>;
  public fullnameToCoinStore: Record<string, X0x1.Coin.CoinStore>;
  public fullnameToTokenInfo: Record<string, TokenRegistry.TokenInfo>;
  public symbolToTokenInfo: Record<string, TokenRegistry.TokenInfo>;
  public mockCoinSymbols: string[];
  constructor(
    public netConf: NetworkConfiguration,
    public aptosClient: AptosClient,
    public repo: AptosParserRepo,
    public registry: TokenRegistry.TokenRegistry,
    public walletAddress: HexString,
    public coinStores: X0x1.Coin.CoinStore[],
  ) {
    this.symbolToCoinStore = {};
    this.fullnameToCoinStore = {};
    this.fullnameToTokenInfo = {};
    this.symbolToTokenInfo = {};
    this.mockCoinSymbols = [];
    this.buildCache();
  }

  buildCache() {
    this.symbolToCoinStore = {};
    this.fullnameToCoinStore = {};
    this.fullnameToTokenInfo = {};
    this.symbolToTokenInfo = {};
    this.mockCoinSymbols = [];
    for(const tokenInfo of this.registry.token_info_list) {
      const typeTag = typeInfoToTypeTag(tokenInfo.token_type);
      const fullname = getTypeTagFullname(typeTag);
      this.fullnameToTokenInfo[fullname] = tokenInfo;
      this.symbolToTokenInfo[tokenInfo.symbol] = tokenInfo;
      if(!(typeTag instanceof StructTag)) {
        throw new Error();
      }
      if(
        typeTag.address.hex() === MockCoin.moduleAddress.hex() &&
        typeTag.module === MockCoin.moduleName
      ) {
        this.mockCoinSymbols.push(tokenInfo.symbol);
      }
    }
    for(const store of this.coinStores) {
      if(!(store.typeTag instanceof StructTag)) {
        throw new Error();
      }
      const typeTag = store.typeTag.typeParams[0];
      if(!typeTag) {
        throw new Error();
      }
      const fullname = getTypeTagFullname(typeTag);
      this.fullnameToCoinStore[fullname] = store;
      const tokenInfo = this.fullnameToTokenInfo[fullname];
      if(!tokenInfo) {
        // token not part of our registry
        continue;
      }
      this.symbolToCoinStore[tokenInfo.symbol] = store;
    }
  }

  async refreshStores() {
    this.coinStores = await getCoinStoresForAddress(this.aptosClient, this.walletAddress, this.repo);
    this.buildCache();
  }

  static async createInTwoCalls(
    netConf: NetworkConfiguration, 
    aptosClient: AptosClient, 
    repo: AptosParserRepo, 
    walletAddress: HexString
  ) {
    const registry = await TokenRegistry.TokenRegistry.load(repo, aptosClient, netConf.contractAddress, []);
    const stores = await getCoinStoresForAddress(aptosClient, walletAddress, repo);
    return new HippoWalletClient(netConf, aptosClient, repo, registry, walletAddress, stores);
  }

  makeFaucetMintToPayload(uiAmount: number, symbol: string) {
    if(!this.mockCoinSymbols.includes(symbol)) {
      throw new Error(`${symbol} is not a MockCoin and we are unable to mint it.`);
    }
    const tokenInfo = this.symbolToTokenInfo[symbol];
    if(!tokenInfo) {
      throw new Error(`Cannot find TokenInfo for ${symbol}`);
    }
    const rawAmount = bigInt(Math.floor(uiAmount * Math.pow(10, tokenInfo.decimals)))
    const tokenTypeTag = typeInfoToTypeTag(tokenInfo.token_type);
    return MockCoin.build_payload_faucet_mint_to_script(rawAmount, [tokenTypeTag])
  }

  debugPrint() {
    for(const symbol in this.symbolToCoinStore) {
      const store = this.symbolToCoinStore[symbol];
      const tokenInfo = this.symbolToTokenInfo[symbol];
      console.log(`${tokenInfo.symbol}: ${store.coin.value.toJSNumber() / Math.pow(10, tokenInfo.decimals)}`);
    }
  }
}