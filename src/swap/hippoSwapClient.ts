import { AptosParserRepo, getTypeTagFullname, parseTypeTagOrThrow, StructTag, TypeTag } from "@manahippo/move-to-ts";
import { AptosClient, HexString } from "aptos";
import bigInt from "big-integer";
import { NetworkConfiguration } from "../config";
import { cp_swap$_, stable_curve_swap$_, piece_swap$_ } from "../generated/hippo_swap";
import { coin_registry$_ } from "../generated/coin_registry";
import { CoinInfo } from "../generated/aptos_framework/coin";
import { typeInfoToTypeTag } from "../utils";
import { HippoPool, PoolType, poolTypeToName, RouteStep, SteppedRoute} from "./baseTypes";
import { HippoConstantProductPool } from "./constantProductPool";
import { HippoStableCurvePool } from "./stableCurvePool";
import { HippoPieceSwapPool } from "./pieceSwapPool";
import { PieceSwapPoolInfo } from "../generated/hippo_swap/piece_swap";


export async function loadContractResources(netConf: NetworkConfiguration, client: AptosClient, repo: AptosParserRepo) {
  const resources = await client.getAccountResources(netConf.contractAddress);
  let registry: coin_registry$_.TokenRegistry | null = null;
  const cpPoolInfos: cp_swap$_.TokenPairMetadata[] = [];
  const stablePoolInfos: stable_curve_swap$_.StableCurvePoolInfo[] = [];
  const piecePoolInfos: PieceSwapPoolInfo[] = [];
  for(const resource of resources) {
    try{
      const typeTag = parseTypeTagOrThrow(resource.type);
      const parsed = repo.parse(resource.data, typeTag);
      if (parsed instanceof coin_registry$_.TokenRegistry) {
        registry = parsed;
      }
      else if(parsed instanceof cp_swap$_.TokenPairMetadata) {
        cpPoolInfos.push(parsed);
      }
      else if(parsed instanceof stable_curve_swap$_.StableCurvePoolInfo) {
        stablePoolInfos.push(parsed);
      }
      else if(parsed instanceof PieceSwapPoolInfo) {
        piecePoolInfos.push(parsed);
      }
    }
    catch(e){
      console.log(`Could not parse resource of type: ${resource.type}`);
    }
  }
  if(!registry) {
    throw new Error(`Failed to load TokenRegistry from contract account: ${netConf.contractAddress.hex()}`);
  }
  return {registry, cpPoolInfos, stablePoolInfos, piecePoolInfos}
}

export class PoolSet {
  public poolTypeToPools: Map<PoolType, HippoPool>;
  constructor() {
    this.poolTypeToPools = new Map();
  }
  pools() {
    return Array.from(this.poolTypeToPools.values());
  }
  setPool(pool: HippoPool) {
    this.poolTypeToPools.set(pool.getPoolType(), pool);
  }
  length() {
    return this.poolTypeToPools.size;
  }
}

export class HippoSwapClient {
  // supported single tokens
  public singleTokens: coin_registry$_.TokenInfo[];
  // maps TokenInfo.symbol to TokenInfo
  public symbolToTokenInfo: Record<string, coin_registry$_.TokenInfo>;
  // maps token-struct-fullname to TokenInfo
  public tokenFullnameToTokenInfo: Record<string, coin_registry$_.TokenInfo>;
  // maps `${xToken-struct-fullname}<->${yToken-struct-fullname}` to HippoPool[]
  public xyFullnameToPoolSet: Record<string, PoolSet>;
  public contractAddress: HexString;

  static async createInOneCall(netConfig: NetworkConfiguration, aptosClient: AptosClient, repo: AptosParserRepo) {
    const {registry, cpPoolInfos, stablePoolInfos, piecePoolInfos} = await loadContractResources(netConfig, aptosClient, repo);
    return new HippoSwapClient(
      netConfig, 
      aptosClient, 
      registry.token_info_list, 
      cpPoolInfos, 
      stablePoolInfos, 
      piecePoolInfos, 
      repo
    );
  }
  constructor(
    public netConfig: NetworkConfiguration,
    public aptosClient: AptosClient,
    public tokenList:  coin_registry$_.TokenInfo[],
    public cpPoolInfos: cp_swap$_.TokenPairMetadata[],
    public stablePoolInfos: stable_curve_swap$_.StableCurvePoolInfo[],
    public piecePoolInfos: piece_swap$_.PieceSwapPoolInfo[],
    public repo: AptosParserRepo,
  ) {
    // init cached maps/lists
    this.singleTokens = [];
    this.symbolToTokenInfo = {};
    this.tokenFullnameToTokenInfo = {};
    this.xyFullnameToPoolSet = {};
    this.contractAddress = netConfig.contractAddress;
    // build maps and caches from tokenList
    this.buildCache();
  }

  buildCache() {
    this.singleTokens = [];
    this.symbolToTokenInfo = {};
    this.tokenFullnameToTokenInfo = {};
    this.xyFullnameToPoolSet = {};
    for(const tokenInfo of this.tokenList) {
      if(tokenInfo.delisted) {
        continue;
      }
      const coinTypeTag = typeInfoToTypeTag(tokenInfo.token_type);
      const tokenFullname = getTypeTagFullname(coinTypeTag);
      this.symbolToTokenInfo[tokenInfo.symbol.str()] = tokenInfo;
      this.tokenFullnameToTokenInfo[tokenFullname] = tokenInfo;
      if (
        coinTypeTag instanceof StructTag &&
        coinTypeTag.address.hex() === this.contractAddress.hex() &&
        [cp_swap$_.moduleName, stable_curve_swap$_.moduleName, piece_swap$_.moduleName].includes(coinTypeTag.module)
      ) {
        // lp token
        continue;
      }
      else {
        this.singleTokens.push(tokenInfo);
      }
    }
    // add CP pools
    for(const cpMeta of this.cpPoolInfos) {
      this.setCPPool(cpMeta);
    }
    // add stable-curve pools
    for(const stablePool of this.stablePoolInfos) {
      this.setStableCurvePool(stablePool);
    }
    // add pieceswap pools
    for(const piecePool of this.piecePoolInfos) {
      this.setPiecePool(piecePool);
    }
  }

  private getXYTokenInfo(proto: any) {
    const typeTag = proto.typeTag;
    if(!(typeTag && typeTag instanceof StructTag)) {
      throw new Error(`Unexpected proto: ${JSON.stringify(proto, null, 2)}`);
    }
    if (typeTag.typeParams.length !== 2) {
      throw new Error(`Unexpected typeparameter length: ${proto.typeTag.typeParams.length }`);
    }
    const [xTag, yTag] = typeTag.typeParams;
    const xTokenInfo = this.tokenFullnameToTokenInfo[getTypeTagFullname(xTag)];
    const yTokenInfo = this.tokenFullnameToTokenInfo[getTypeTagFullname(yTag)];
    return {xTokenInfo, yTokenInfo, xTag, yTag};
  }

  private setCPPool(cpMeta: cp_swap$_.TokenPairMetadata) {
    const {xTokenInfo, yTokenInfo, xTag, yTag} = this.getXYTokenInfo(cpMeta);
    const lpTag = new StructTag(cp_swap$_.moduleAddress, cp_swap$_.moduleName, cp_swap$_.LPToken.structName, [xTag, yTag]);
    const lpTokenInfo = this.tokenFullnameToTokenInfo[getTypeTagFullname(lpTag)];
    this.setPool(new HippoConstantProductPool(xTokenInfo, yTokenInfo, lpTokenInfo, cpMeta));
  }

  private setStableCurvePool(stablePool: stable_curve_swap$_.StableCurvePoolInfo) {
    const {xTokenInfo, yTokenInfo, xTag, yTag} = this.getXYTokenInfo(stablePool);
    const lpTag = new StructTag(stable_curve_swap$_.moduleAddress, stable_curve_swap$_.moduleName, stable_curve_swap$_.LPToken.structName, [xTag, yTag]);
    const lpTokenInfo = this.tokenFullnameToTokenInfo[getTypeTagFullname(lpTag)];
    this.setPool(new HippoStableCurvePool(xTokenInfo, yTokenInfo, lpTokenInfo, stablePool));
  }

  private setPiecePool(piecePool: piece_swap$_.PieceSwapPoolInfo) {
    const {xTokenInfo, yTokenInfo, xTag, yTag} = this.getXYTokenInfo(piecePool);
    const lpTag = new StructTag(piece_swap$_.moduleAddress, piece_swap$_.moduleName, piece_swap$_.LPToken.structName, [xTag, yTag]);
    const lpTokenInfo = this.tokenFullnameToTokenInfo[getTypeTagFullname(lpTag)];
    this.setPool(new HippoPieceSwapPool(xTokenInfo, yTokenInfo, lpTokenInfo, piecePool));
  }
  private setPool(pool: HippoPool) {
    const xyFullname = pool.xyFullname();
    if(!(xyFullname in this.xyFullnameToPoolSet)) {
      this.xyFullnameToPoolSet[xyFullname] = new PoolSet();
    }
    this.xyFullnameToPoolSet[xyFullname].setPool(pool);
  }

  allPools() {
    const pools: HippoPool[] = [];
    for(const [_fullname, poolSet] of Object.entries(this.xyFullnameToPoolSet)) {
      for(const pool of poolSet.pools()) {
        pools.push(pool);
      }
    }
    return pools;
  }

  getTokenInfoBySymbol(symbol: string) {
    return this.symbolToTokenInfo[symbol];
  }

  get1StepRoutesBySymbol(symbolX: string, symbolY: string): SteppedRoute[] {
    const tokenX = this.getTokenInfoBySymbol(symbolX);
    const tokenY = this.getTokenInfoBySymbol(symbolY);
    // if we don't even have the single-tokens in our registry, don't even bother checking LPs
    if(!tokenX || !tokenY) {
      return [];
    }
    const [tagX, tagY] = [tokenX, tokenY].map(ti=> typeInfoToTypeTag(ti.token_type));
    const xyFullname = this.getXYFullname(tagX, tagY);
    const yxFullname = this.getXYFullname(tagY, tagX);
    const poolSetXY = this.xyFullnameToPoolSet[xyFullname];
    const poolSetYX = this.xyFullnameToPoolSet[yxFullname];
    const routes: SteppedRoute[] = [];
    if (poolSetXY) {
      poolSetXY.pools().forEach(p => routes.push(new SteppedRoute([new RouteStep(p, true)])));
    }
    if (poolSetYX) {
      poolSetYX.pools().forEach(p => routes.push(new SteppedRoute([new RouteStep(p, false)])));
    }
    return routes;
  }

  get2StepRoutesBySymbol(symbolX: string, symbolY: string): SteppedRoute[] {
    const tokenX = this.getTokenInfoBySymbol(symbolX);
    const tokenY = this.getTokenInfoBySymbol(symbolY);
    // if we don't even have the single-tokens in our registry, don't even bother checking LPs
    if(!tokenX || !tokenY) {
      return [];
    }
    // enumarate S such that Step1Routes(X, S).length > 0 && Step1Routes(S, Y) > 0
    const routes: SteppedRoute[] = [];
    for(const S of this.singleTokens) {
      if([symbolX, symbolY].includes(S.symbol.str())) {
        continue;
      }
      const xToSRoutes = this.get1StepRoutesBySymbol(symbolX, S.symbol.str());
      if (xToSRoutes.length === 0) {
        continue;
      }
      const sToYRoutes = this.get1StepRoutesBySymbol(S.symbol.str(), symbolY);
      if (xToSRoutes.length === 0) {
        continue;
      }
      // add cartesian product
      for(const xToS of xToSRoutes) {
        for(const sToY of sToYRoutes) {
          routes.push(xToS.concat(sToY));
        }
      }
    }
    return routes;
  }

  get3StepRoutesBySymbol(symbolX: string, symbolY: string): SteppedRoute[] {
    const tokenX = this.getTokenInfoBySymbol(symbolX);
    const tokenY = this.getTokenInfoBySymbol(symbolY);
    // if we don't even have the single-tokens in our registry, don't even bother checking LPs
    if(!tokenX || !tokenY) {
      return [];
    }
    // enumarate S such that Step2Routes(X, S).length > 0 && Step1Routes(S, Y) > 0
    const routes: SteppedRoute[] = [];
    for(const S of this.singleTokens) {
      if([symbolX, symbolY].includes(S.symbol.str())) {
        continue;
      }
      const xToSRoutes = this.get2StepRoutesBySymbol(symbolX, S.symbol.str());
      if (xToSRoutes.length === 0) {
        continue;
      }
      const sToYRoutes = this.get1StepRoutesBySymbol(S.symbol.str(), symbolY);
      if (xToSRoutes.length === 0) {
        continue;
      }
      // add cartesian product
      for(const xToS of xToSRoutes) {
        for(const sToY of sToYRoutes) {
          routes.push(xToS.concat(sToY));
        }
      }
    }
    return routes;
  }

  hasDirectPoolFor(symbolX: string, symbolY: string) {
    const routes = this.get1StepRoutesBySymbol(symbolX, symbolY);
    return routes.length > 0;
  }

  getDirectPoolsBySymbols(symbolX: string, symbolY: string): HippoPool[] {
    const routes = this.get1StepRoutesBySymbol(symbolX, symbolY);
    return routes.map(route => route.steps[0].pool);
  }

  getDirectPoolsBySymbolsAndPoolType(symbolX: string, symbolY: string, poolType: PoolType): HippoPool[] {
    const routes = this.get1StepRoutesBySymbol(symbolX, symbolY);
    return routes.map(route => route.steps[0].pool).filter(p=>p.getPoolType() === poolType);
  }

  getDirectPricesBySymbols(symbolX: string, symbolY: string) {
    const routes = this.get1StepRoutesBySymbol(symbolX, symbolY);
    return routes.map(route => route.getCurrentPrice());
  }

  getSteppedRoutesBySymbol(symbolX: string, symbolY: string, maxSteps: number) {
    let routes = this.get1StepRoutesBySymbol(symbolX, symbolY);
    if (maxSteps >= 2) {
      const newRoutes = this.get2StepRoutesBySymbol(symbolX, symbolY);
      routes = routes.concat(newRoutes);
    }
    if (maxSteps >= 3) {
      const newRoutes = this.get3StepRoutesBySymbol(symbolX, symbolY);
      routes = routes.concat(newRoutes);
    }
    return routes;
  }

  getQuotesBySymbols(symbolX: string, symbolY: string, inputUiAmt: number, maxSteps: number) {
    const routes = this.getSteppedRoutesBySymbol(symbolX, symbolY, maxSteps);
    return routes.map(route => route.getQuote(inputUiAmt));
  }

  getBestQuoteBySymbols(symbolX: string, symbolY: string, inputUiAmt: number, maxSteps: number) {
    const routes = this.getSteppedRoutesBySymbol(symbolX, symbolY, maxSteps);
    if (routes.length === 0) {
      return null;
    }
    const quotes = routes.map(route => route.getQuote(inputUiAmt));
    let bestRoute = routes[0];
    let bestQuote = quotes[0];
    quotes.forEach((quote, idx)=>{
      if(quote.outputUiAmt > bestQuote.outputUiAmt) {
        bestQuote = quote;
        bestRoute = routes[idx];
      }
    });
    return {bestQuote, bestRoute};
  }

  async reloadPoolsBySymbols(symbolX: string, symbolY: string) {
    const routes = this.getSteppedRoutesBySymbol(symbolX, symbolY, 3);
    if(routes.length === 0) {
      return;
    }
    const poolMap = new Map<string, HippoPool>();
    for(const route of routes) {
      const pools = route.getAllPools();
      pools.forEach(pool=>poolMap.set(pool.getId(), pool));
    }
    const allPools = Array.from(poolMap.values());
    const promises = allPools.map(this.reloadOnePool);
    await Promise.all(promises);
  }

  async reloadOnePool(pool: HippoPool) {
    let tag: TypeTag;
    if (pool instanceof HippoConstantProductPool) {
      tag = pool.cpPoolMeta.typeTag;
    } else if(pool instanceof HippoStableCurvePool) {
      tag = pool.stablePoolInfo.typeTag;
    } else {
      throw new Error();
    }
    const tagFullname = getTypeTagFullname(tag);
    const resource = await this.aptosClient.getAccountResource(this.contractAddress, tagFullname);
    const parsed = this.repo.parse(resource.data, tag);
    if (parsed instanceof cp_swap$_.TokenPairMetadata) {
      this.setCPPool(parsed);
    } else if (parsed instanceof stable_curve_swap$_.StableCurvePoolInfo) {
      this.setStableCurvePool(parsed);
    }
    else {
      throw new Error();
    }
  }

  async reloadAllPools() {
    const {registry, cpPoolInfos, stablePoolInfos, piecePoolInfos} = await loadContractResources(this.netConfig, this.aptosClient, this.repo);
    this.tokenList = registry.token_info_list;
    this.cpPoolInfos = cpPoolInfos;
    this.stablePoolInfos = stablePoolInfos;
    this.piecePoolInfos = piecePoolInfos;
    this.buildCache();
  }

  private getXYFullname(xTag: TypeTag, yTag: TypeTag) {
    if(!(xTag instanceof StructTag)) {
      throw new Error(`Expected xTag to be StructTag but received: ${JSON.stringify(xTag)}`);
    }
    if(!(yTag instanceof StructTag)) {
      throw new Error(`Expected yTag to be StructTag but received: ${JSON.stringify(yTag)}`);
    }
    const [xFullname, yFullname] = [xTag, yTag].map(getTypeTagFullname);
    return `${xFullname}<->${yFullname}`;
  }

  async getTokenTotalSupply(tokenInfo: coin_registry$_.TokenInfo) {
    const coinTag = typeInfoToTypeTag(tokenInfo.token_type);
    const coinInfo = await CoinInfo.load(this.repo, this.aptosClient, this.netConfig.contractAddress, [coinTag]);
    if (coinInfo.supply.vec.length > 0) {
      return coinInfo.supply.vec[0] as unknown as bigInt.BigInteger;
    }
    return null;
  }

  async getTokenTotalSupplyBySymbol(symbol: string) {
    const tokenInfo = this.symbolToTokenInfo[symbol];
    if (!tokenInfo) {
      throw new Error("Symbol not found");
    }
    return await this.getTokenTotalSupply(tokenInfo);
  }

  printSelf() {
    for(const token of this.singleTokens) {
      console.log(`Single token: ${token.symbol.str()}`);
    }
    for(const pool of this.allPools()) {
      const xTokenInfo = pool.xTokenInfo;
      const yTokenInfo = pool.yTokenInfo;
      console.log("#############")
      console.log(`Pool: ${xTokenInfo.symbol.str()} <-> ${yTokenInfo.symbol.str()}`);
      console.log(`Type: ${poolTypeToName(pool.getPoolType())}`);
      console.log(`x balance: ${pool.xUiBalance()}`);
      console.log(`y balance: ${pool.yUiBalance()}`);
      console.log(`price (y-per-x): ${pool.getCurrentPrice().yToX}`)
    }
  }
}
