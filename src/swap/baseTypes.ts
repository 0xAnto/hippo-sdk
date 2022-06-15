import { getTypeTagFullname, StructTag } from "@manahippo/aptos-tsgen";
import { TransactionPayload } from "aptos/dist/api/data-contracts";
import { TokenInfo } from "../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790/TokenRegistry";
import { typeInfoToTypeTag } from "../utils";

export type UITokenAmount = number;

export type PriceType = {
  xToY: number;
  yToX: number;
}

export type QuoteType = {
  inputSymbol: string;
  outputSymbol: string;
  inputUiAmt: UITokenAmount;
  outputUiAmt: UITokenAmount;
  initialPrice: number;
  avgPrice: number;
  finalPrice: number; 
  priceImpact: number;
}

export enum PoolType {
  CONSTANT_PRODUCT = 0,
  STABLE_CURVE = 1,
  THREE_PIECE = 2,
}

export abstract class TradeRoute {
  constructor(
    public xTokenInfo: TokenInfo,
    public yTokenInfo: TokenInfo,
  ) {

  }

  xTag(): StructTag {
    return typeInfoToTypeTag(this.xTokenInfo.token_type) as StructTag;
  }

  yTag(): StructTag {
    return typeInfoToTypeTag(this.yTokenInfo.token_type) as StructTag;
  }

  abstract getCurrentPrice(): PriceType;

  abstract getQuote(uiAmount: UITokenAmount) : QuoteType;

  // transactions
  abstract makeSwapPayload( 
    amountIn: UITokenAmount, 
    minAmountOut: UITokenAmount, 
  ): Promise<TransactionPayload>;


}

export abstract class HippoPool extends TradeRoute {
  constructor(
    xTokenInfo: TokenInfo,
    yTokenInfo: TokenInfo,
    public lpTokenInfo: TokenInfo,
  ) {
    super(xTokenInfo, yTokenInfo);
  }

  abstract estimateWithdrawalOutput(lpUiAmount: UITokenAmount, lpSupplyUiAmt: UITokenAmount): {xUiAmt: UITokenAmount; yUiAmt: UITokenAmount};

  abstract estimateNeededYFromXDeposit(xUiAmt: UITokenAmount): UITokenAmount;
  abstract estimateNeededXFromYDeposit(yUiAmt: UITokenAmount): UITokenAmount;

  abstract getPoolType(): PoolType;

  lpTag(): StructTag {
    return typeInfoToTypeTag(this.lpTokenInfo.token_type) as StructTag;
  }

  xyFullname(): string {
    const [xFullname, yFullname] = [this.xTag(), this.yTag()].map(getTypeTagFullname);
    return `${xFullname}<->${yFullname}`;
  }

  abstract getId(): string;

  abstract getCurrentPriceDirectional(isXtoY: boolean): PriceType;

  getCurrentPrice(): PriceType {
    return this.getCurrentPriceDirectional(true);
  }

  abstract getQuoteDirectional(uiAmount: UITokenAmount, isXtoY: boolean) : QuoteType;

  getQuote(uiAmount: UITokenAmount): QuoteType {
    return this.getQuoteDirectional(uiAmount, true);
  }

  // transactions
  abstract makeSwapPayloadDirectional( 
    amountIn: UITokenAmount, 
    minAmountOut: UITokenAmount, 
    isXtoY: boolean,
  ): Promise<TransactionPayload>;

  makeSwapPayload( 
    amountIn: UITokenAmount, 
    minAmountOut: UITokenAmount, 
  ): Promise<TransactionPayload> {
    return this.makeSwapPayloadDirectional(amountIn, minAmountOut, true);
  }

  abstract makeAddLiquidityPayload(lhsAmt: UITokenAmount, rhsAmt: UITokenAmount): Promise<TransactionPayload>;

  abstract makeRemoveLiquidityPayload(
    liqiudityAmt: UITokenAmount, 
    lhsMinAmt: UITokenAmount, 
    rhsMinAmt: UITokenAmount,
  ): Promise<TransactionPayload>;
}

export class RouteStep {
  constructor(
    public pool: HippoPool,
    public isXtoY: boolean,
  ) {

  }

  lhsTokenInfo() {
    return this.isXtoY ? this.pool.xTokenInfo : this.pool.yTokenInfo;
  }

  rhsTokenInfo() {
    return this.isXtoY ? this.pool.yTokenInfo : this.pool.xTokenInfo;
  }
}

export class SteppedRoute extends TradeRoute {
  public steps: RouteStep[];
  constructor(
    steps: RouteStep[],
  ) {
    if(steps.length < 1) {
      throw new Error();
    }
    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];
    super(firstStep.lhsTokenInfo(), lastStep.rhsTokenInfo());
    this.steps = steps;
  }

  getCurrentPrice(): PriceType {
    let xToY = 1;
    let yToX = 1;
    for(const step of this.steps) {
      const price = step.pool.getCurrentPriceDirectional(step.isXtoY);
      xToY *= price.xToY;
      yToX *= price.yToX;
    }
    return {xToY, yToX};
  }

  getQuote(uiAmount: UITokenAmount) : QuoteType {
    if (this.steps.length === 1) {
      return this.steps[0].pool.getQuoteDirectional(uiAmount, this.steps[0].isXtoY);
    } else {
      let prevOutputUiAmt = uiAmount;
      let avgPrice = 1;
      let initialPrice = 1;
      let finalPrice = 1;
      const quotes = [];
      for(const step of this.steps) {
        const quote = step.pool.getQuoteDirectional(prevOutputUiAmt, step.isXtoY);
        quotes.push(quote);
        prevOutputUiAmt = quote.outputUiAmt;
        avgPrice *= quote.avgPrice;
        initialPrice *= quote.initialPrice;
        finalPrice = quote.finalPrice;
      }
      return {
        inputSymbol: this.xTokenInfo.symbol,
        outputSymbol: this.yTokenInfo.symbol,
        avgPrice,
        initialPrice,
        finalPrice,
        inputUiAmt: uiAmount,
        outputUiAmt: prevOutputUiAmt,
        priceImpact: (finalPrice - initialPrice) / initialPrice,
      }
    }
  }

  makeSwapPayload( 
    amountIn: UITokenAmount, 
    minAmountOut: UITokenAmount, 
  ): Promise<TransactionPayload> {
    if (this.steps.length === 1) {
      return this.steps[0].pool.makeSwapPayloadDirectional(amountIn, minAmountOut, this.steps[0].isXtoY);
    } else {
      throw new Error();
    }
  }

  concat(next: SteppedRoute) {
    if(this.yTokenInfo.symbol !== next.xTokenInfo.symbol) {
      throw new Error(`Unable to join incompatible eroutes`);
    }
    return new SteppedRoute(this.steps.concat(next.steps));
  }

  getAllPools(): HippoPool[] {
    return this.steps.map(step => step.pool);
  }

  getSymbolPath(): string[] {
    const symbols = [this.steps[0].lhsTokenInfo().symbol];
    for(const step of this.steps) {
      if (step.lhsTokenInfo().symbol !== symbols[symbols.length - 1]) {
        throw new Error(`Bad path`);
      }
      symbols.push(step.rhsTokenInfo().symbol);
    }
    return symbols;
  }

  summarize(): string {
    return this.getSymbolPath().join(' -> ');
  }
}