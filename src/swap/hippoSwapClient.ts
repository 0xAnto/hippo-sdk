import { AptosParserRepo, getTypeTagFullname, parseTypeTagOrThrow, StructTag, TypeTag } from "@manahippo/aptos-tsgen";
import { AptosClient, HexString } from "aptos";
import bigInt from "big-integer";
import { NetworkConfiguration } from "../config";
import { getParserRepo } from "../generated/repo";
import { CPScripts, CPSwap, TokenRegistry } from "../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790";
import { typeInfoToTypeTag } from "../utils";

export type UITokenAmount = number;

enum SwapClientErrors {
  NO_ROUTE,
}

export async function loadContractResources(netConf: NetworkConfiguration, client: AptosClient, repo: AptosParserRepo) {
  const resources = await client.getAccountResources(netConf.contractAddress);
  let registry: TokenRegistry.TokenRegistry | null = null;
  const cpMetas: CPSwap.TokenPairMetadata[] = [];
  for(const resource of resources) {
    try{
      const typeTag = parseTypeTagOrThrow(resource.type);
      const parsed = repo.parse(resource.data, typeTag);
      if (parsed instanceof TokenRegistry.TokenRegistry) {
        registry = parsed;
      }
      else if(parsed instanceof CPSwap.TokenPairMetadata) {
        cpMetas.push(parsed);
      }
    }
    catch(e) {
      console.log(`Could not parse resource of type: ${resource.type}`);
    }
  }
  if(!registry) {
    throw new Error(`Failed to load TokenRegistry from contract account: ${netConf.contractAddress.hex()}`);
  }
  return {registry, cpMetas}
}


export class HippoSwapClient {
  // supported single tokens
  public singleTokens: TokenRegistry.TokenInfo[];
  // supported constant-product LP tokens
  public cpLPTokens: TokenRegistry.TokenInfo[];
  // maps TokenInfo.symbol to TokenInfo
  public symbolToTokenInfo: Record<string, TokenRegistry.TokenInfo>;
  // maps token-struct-fullname to TokenInfo
  public tokenFullnameToTokenInfo: Record<string, TokenRegistry.TokenInfo>;
  // maps `${xToken-struct-fullname}<->${yToken-struct-fullname}` to constant-product LP token
  public xyFullnameToCPLPToken: Record<string, TokenRegistry.TokenInfo>;
  public xyFullnameToCPMeta: Record<string, CPSwap.TokenPairMetadata>;
  public contractAddress: HexString;

  static async createInOneCall(netConfig: NetworkConfiguration, aptosClient: AptosClient, repo: AptosParserRepo) {
    const {registry, cpMetas} = await loadContractResources(netConfig, aptosClient, repo);
    return new HippoSwapClient(netConfig, aptosClient, registry.token_info_list, cpMetas, repo);
  }
  constructor(
    public netConfig: NetworkConfiguration,
    public aptosClient: AptosClient,
    public tokenList:  TokenRegistry.TokenInfo[],
    public cpMetas: CPSwap.TokenPairMetadata[],
    public repo: AptosParserRepo,
  ) {
    // init cached maps/lists
    this.singleTokens = [];
    this.cpLPTokens = [];
    this.symbolToTokenInfo = {};
    this.tokenFullnameToTokenInfo = {};
    this.xyFullnameToCPLPToken = {};
    this.xyFullnameToCPMeta = {};
    this.contractAddress = netConfig.contractAddress;
    // build maps and caches from tokenList
    this.buildCache();
  }

  buildCache() {
    this.singleTokens = [];
    this.cpLPTokens = [];
    this.symbolToTokenInfo = {};
    this.tokenFullnameToTokenInfo = {};
    this.xyFullnameToCPLPToken = {};
    this.xyFullnameToCPMeta = {};
    for(const tokenInfo of this.tokenList) {
      if(tokenInfo.delisted) {
        continue;
      }
      const coinTypeTag = typeInfoToTypeTag(tokenInfo.token_type);
      const tokenFullname = getTypeTagFullname(coinTypeTag);
      this.symbolToTokenInfo[tokenInfo.symbol] = tokenInfo;
      this.tokenFullnameToTokenInfo[tokenFullname] = tokenInfo;
      if (
        coinTypeTag instanceof StructTag &&
        coinTypeTag.address.hex() === this.contractAddress.hex() && 
        coinTypeTag.module === CPSwap.moduleName &&
        coinTypeTag.name === CPSwap.LPToken.structName
      ) {
        this.cpLPTokens.push(tokenInfo);
        if(coinTypeTag.typeParams.length !== 2) {
          throw new Error(`Invalid LPToken tag with ${coinTypeTag.typeParams.length} type parameters`);
        }
        const [xTag, yTag] = coinTypeTag.typeParams;
        const jointName = this.getJointName(xTag, yTag);
        this.xyFullnameToCPLPToken[jointName] = tokenInfo;
      }
      else {
        this.singleTokens.push(tokenInfo);
      }
    }
    // build map from cpPools
    for(const cpMeta of this.cpMetas) {
      if(!(cpMeta.typeTag instanceof StructTag)) {
        throw new Error("Unexpected cpMeta type");
      }
      if (cpMeta.typeTag.typeParams.length !== 2) {
        throw new Error(`Unexpected cpMeta typeparameter length: ${cpMeta.typeTag.typeParams.length }`);
      }
      const [xTag, yTag] = cpMeta.typeTag.typeParams;
      const jointName = this.getJointName(xTag, yTag);
      this.xyFullnameToCPMeta[jointName] = cpMeta;
    }
  }


  getCpLpTokenInfo(symbolX: string, symbolY: string) {
    const tokenX = this.symbolToTokenInfo[symbolX];
    const tokenY = this.symbolToTokenInfo[symbolY];
    // if we don't even have the single-tokens in our registry, don't even bother checking LPs
    if(!tokenX || !tokenY) {
      return null;
    }
    const [tagX, tagY] = [tokenX, tokenY].map(ti=> typeInfoToTypeTag(ti.token_type));
    const jointNameXY = this.getJointName(tagX, tagY);
    const jointNameYX = this.getJointName(tagY, tagX);
    const lpTokenXY = this.xyFullnameToCPLPToken[jointNameXY]
    if (lpTokenXY) {
      return {lpToken: lpTokenXY, isReversed: false, jointName: jointNameXY};
    }
    const lpTokenYX = this.xyFullnameToCPLPToken[jointNameYX];
    if (lpTokenYX) {
      return {lpToken: lpTokenYX, isReversed: true, jointName: jointNameYX};
    }
    return null;
  }

  hasCpPoolFor(symbolX: string, symbolY: string) {
    const lpInfo = this.getCpLpTokenInfo(symbolX, symbolY);
    return lpInfo !== null;
  }

  getCpPriceBySymbols(symbolX: string, symbolY: string) {
    const lpInfo = this.getCpLpTokenInfo(symbolX, symbolY);
    if(!lpInfo) {
      return SwapClientErrors.NO_ROUTE;
    }
    const {lpToken, isReversed, jointName} = lpInfo;
    const cpMeta = this.xyFullnameToCPMeta[jointName];
    const priceInfo = this.getCpPrice(cpMeta);
    if (isReversed) {
      return {xToY: priceInfo.yToX, yToX: priceInfo.xToY};
    }
    else {
      return priceInfo;
    }
  }

  getCpPrice(cpMeta: CPSwap.TokenPairMetadata) {
    if(!(cpMeta.typeTag instanceof StructTag)) {
      throw new Error();
    }
    const [xTag, yTag] = cpMeta.typeTag.typeParams;
    const xTokenInfo = this.tokenFullnameToTokenInfo[getTypeTagFullname(xTag)];
    const yTokenInfo = this.tokenFullnameToTokenInfo[getTypeTagFullname(yTag)];
    const xUiBalance = cpMeta.balance_x .value.toJSNumber() / Math.pow(10, xTokenInfo.decimals);
    const yUiBalance = cpMeta.balance_y.value.toJSNumber() / Math.pow(10, yTokenInfo.decimals);
    return {xToY: xUiBalance / yUiBalance, yToX: yUiBalance / xUiBalance};
  }

  async reloadOnePoolBySymbols(symbolX: string, symbolY: string) {
    const lpInfo = this.getCpLpTokenInfo(symbolX, symbolY);
    if(!lpInfo) {
      return SwapClientErrors.NO_ROUTE;
    }
    const {lpToken, isReversed, jointName} = lpInfo;
    const cpMeta = this.xyFullnameToCPMeta[jointName];
    await this.reloadOnePool(cpMeta);
  }

  async reloadOnePool(cpMeta: CPSwap.TokenPairMetadata) {
    if(!(cpMeta.typeTag instanceof StructTag)) {
      throw new Error();
    }
    const typeTagFullname = getTypeTagFullname(cpMeta.typeTag);
    this.aptosClient.getAccountResource(cpMeta.typeTag.address, typeTagFullname);
  }

  async reloadAllPools() {
    const {registry, cpMetas} = await loadContractResources(this.netConfig, this.aptosClient, this.repo);
    this.tokenList = registry.token_info_list;
    this.cpMetas = cpMetas;
    this.buildCache();
  }

  async makeCPSwapPayload(fromSymbol: string, toSymbol: string, amountIn: UITokenAmount, minAmountOut: UITokenAmount) {
    const lpTokenResult = this.getCpLpTokenInfo(fromSymbol, toSymbol);
    if(!lpTokenResult) {
      throw new Error(`Direct CP Pool for ${fromSymbol} and ${toSymbol} does not exist`);
    }
    const fromTokenInfo = this.symbolToTokenInfo[fromSymbol];
    const toTokenInfo = this.symbolToTokenInfo[toSymbol];
    const fromRawAmount = bigInt((amountIn * Math.pow(10, fromTokenInfo.decimals)).toFixed(0));
    const toRawAmount = bigInt((minAmountOut * Math.pow(10, toTokenInfo.decimals)).toFixed(0));
    const {lpToken, isReversed} = lpTokenResult;
    const lpTokenTypeTag = typeInfoToTypeTag(lpToken.token_type);
    if(!(lpTokenTypeTag instanceof StructTag)) {
      throw new Error();
    }
    if(isReversed) {
      return CPScripts.build_payload_swap_script(
        bigInt(0), 
        fromRawAmount, 
        toRawAmount, 
        bigInt(0), 
        lpTokenTypeTag.typeParams
      );
    }
    else {
      return CPScripts.build_payload_swap_script(
        fromRawAmount, 
        bigInt(0), 
        bigInt(0), 
        toRawAmount, 
        lpTokenTypeTag.typeParams
      );
    }
  }

  async makeCPAddLiquidityPayload(lhsSymbol: string, rhsSymbol: string, lhsAmt: UITokenAmount, rhsAmt: UITokenAmount) {
    const lpTokenResult = this.getCpLpTokenInfo(lhsSymbol, rhsSymbol);
    if(!lpTokenResult) {
      throw new Error(`Direct CP Pool for ${lhsSymbol} - ${rhsSymbol} does not exist`);
    }
    const {lpToken, isReversed} = lpTokenResult;
    if(!(lpToken.typeTag instanceof StructTag)) {
      throw new Error();
    }
    if (isReversed) {
      throw new Error(`Supplied opposite LHS and RHS order: ${lhsSymbol} - ${rhsSymbol}`);
    }
    const lhsTokenInfo = this.symbolToTokenInfo[lhsSymbol];
    const rhsTokenInfo = this.symbolToTokenInfo[rhsSymbol];
    const lhsRawAmt = bigInt((lhsAmt * Math.pow(10, lhsTokenInfo.decimals)).toFixed(0));
    const rhsRawAmt = bigInt((rhsAmt * Math.pow(10, rhsTokenInfo.decimals)).toFixed(0));
    return CPScripts.build_payload_add_liquidity_script(lhsRawAmt, rhsRawAmt, lpToken.typeTag.typeParams);
  }

  async makeCPRemoveLiquidityPayload(
    lhsSymbol: string, 
    rhsSymbol: string, 
    liqiudityAmt: UITokenAmount,
    lhsMinAmt: UITokenAmount,
    rhsMinAmt: UITokenAmount,
  ) {
    const lpTokenResult = this.getCpLpTokenInfo(lhsSymbol, rhsSymbol);
    if(!lpTokenResult) {
      throw new Error(`Direct CP Pool for ${lhsSymbol} - ${rhsSymbol} does not exist`);
    }
    const {lpToken, isReversed} = lpTokenResult;
    if(!(lpToken.typeTag instanceof StructTag)) {
      throw new Error();
    }
    if (isReversed) {
      throw new Error(`Supplied opposite LHS and RHS order: ${lhsSymbol} - ${rhsSymbol}`);
    }
    const lhsTokenInfo = this.symbolToTokenInfo[lhsSymbol];
    const rhsTokenInfo = this.symbolToTokenInfo[rhsSymbol];
    const liquidityRawAmt = bigInt(liqiudityAmt * Math.pow(10, lpToken.decimals));
    const lhsMinRawAmt = bigInt(lhsMinAmt * Math.pow(10, lhsTokenInfo.decimals));
    const rhsMinRawAmt = bigInt(rhsMinAmt * Math.pow(10, rhsTokenInfo.decimals));
    return CPScripts.build_payload_remove_liquidity(liquidityRawAmt, lhsMinRawAmt, rhsMinRawAmt, lpToken.typeTag.typeParams);
  }

  getJointName(xTag: TypeTag, yTag: TypeTag) {
    if(!(xTag instanceof StructTag)) {
      throw new Error(`Expected xTag to be StructTag but received: ${JSON.stringify(xTag)}`);
    }
    if(!(yTag instanceof StructTag)) {
      throw new Error(`Expected yTag to be StructTag but received: ${JSON.stringify(yTag)}`);
    }
    const [xFullname, yFullname] = [xTag, yTag].map(getTypeTagFullname);
    return `${xFullname}<->${yFullname}`;
  }

  printSelf() {
    for(const token of this.singleTokens) {
      console.log(`Single token: ${token.symbol}`);
    }
    for(const token of this.cpLPTokens) {
      console.log(`CP LP token: ${token.symbol}`);
    }
    for(const cpMeta of this.cpMetas) {
      if(!(cpMeta.typeTag instanceof StructTag)) {
        throw new Error();
      }
      const [xTag, yTag] = cpMeta.typeTag.typeParams;
      const [xFullname, yFullname] = [xTag, yTag].map(getTypeTagFullname);
      const [xTokenInfo, yTokenInfo] = [xFullname, yFullname].map(name=>this.tokenFullnameToTokenInfo[name]);
      console.log("#############")
      console.log(`CP Pool: ${xTokenInfo.symbol} <-> ${yTokenInfo.symbol}`);
      console.log(`CP x balance: ${cpMeta.balance_x.value.toJSNumber() / Math.pow(10, xTokenInfo.decimals)}`);
      console.log(`CP y balance: ${cpMeta.balance_y.value.toJSNumber() / Math.pow(10, yTokenInfo.decimals)}`);
      console.log(`CP price (y-per-x): ${this.getCpPrice(cpMeta).yToX}`)
    }
  }
}