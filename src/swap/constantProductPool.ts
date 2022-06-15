import { TransactionPayload } from 'aptos/dist/api/data-contracts';
import bigInt from 'big-integer';
import { CPScripts, CPSwap } from '../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790';
import { TokenInfo } from '../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790/TokenRegistry';
import {HippoPool, PoolType, PriceType, QuoteType, UITokenAmount} from './baseTypes';

export class HippoConstantProductPool extends HippoPool {
  constructor(
    xTokenInfo: TokenInfo,
    yTokenInfo: TokenInfo,
    lpTokenInfo: TokenInfo,
    public cpPoolMeta: CPSwap.TokenPairMetadata,
  ) {
    super(xTokenInfo, yTokenInfo, lpTokenInfo);
  }
  xUiBalance() {
    return this.cpPoolMeta.balance_x .value.toJSNumber() / Math.pow(10, this.xTokenInfo.decimals);
  }
  yUiBalance() {
    return this.cpPoolMeta.balance_y .value.toJSNumber() / Math.pow(10, this.yTokenInfo.decimals);
  }
  getId(): string {
    return `HippoConstantProductPool<${this.xyFullname()}>`;
  }
  getCurrentPriceDirectional(isXtoY: boolean): PriceType {
    const xUiBalance = isXtoY ? this.xUiBalance() : this.yUiBalance();
    const yUiBalance = isXtoY ? this.yUiBalance() : this.xUiBalance();
    return {xToY: xUiBalance / yUiBalance, yToX: yUiBalance / xUiBalance};
  }
  getQuoteDirectional(inputUiAmt: UITokenAmount, isXtoY: boolean) : QuoteType {
    const xUiBalance = this.xUiBalance();
    const yUiBalance = this.yUiBalance();
    const k = xUiBalance * yUiBalance;
    let outputUiAmt, initialPrice, finalPrice;
    let inputSymbol, outputSymbol;
    if (isXtoY) {
      inputSymbol = this.xTokenInfo.symbol;
      outputSymbol = this.yTokenInfo.symbol;
      // compute output in Y
      const newXUiBalance = xUiBalance + inputUiAmt;
      const newYUiBalance = k / newXUiBalance;
      outputUiAmt = yUiBalance - newYUiBalance;
      initialPrice = xUiBalance / yUiBalance;
      finalPrice = newXUiBalance / newYUiBalance;
    } else {
      inputSymbol = this.yTokenInfo.symbol;
      outputSymbol = this.xTokenInfo.symbol;
      // compute output in X
      const newYUiBalance = yUiBalance + inputUiAmt;
      const newXUiBalance = k / newYUiBalance;
      outputUiAmt = xUiBalance - newXUiBalance;
      initialPrice = yUiBalance / xUiBalance;
      finalPrice = newYUiBalance / newXUiBalance;
    }
    const avgPrice = inputUiAmt / outputUiAmt;
    const priceImpact = (finalPrice - initialPrice) / initialPrice;

    return {inputSymbol, outputSymbol, inputUiAmt, outputUiAmt, initialPrice, avgPrice, finalPrice, priceImpact};
  }
  estimateWithdrawalOutput(lpUiAmount: UITokenAmount, lpSupplyUiAmt: UITokenAmount): {xUiAmt: UITokenAmount; yUiAmt: UITokenAmount} {
    const fraction = lpUiAmount / lpSupplyUiAmt;
    return {
      xUiAmt: this.xUiBalance() * fraction,
      yUiAmt: this.yUiBalance() * fraction,
    };

  }
  estimateNeededYFromXDeposit(xUiAmt: UITokenAmount): UITokenAmount {
    const fraction = xUiAmt / this.xUiBalance();
    return this.yUiBalance() * fraction;
  }
  estimateNeededXFromYDeposit(yUiAmt: UITokenAmount): UITokenAmount {
    const fraction = yUiAmt / this.yUiBalance();
    return this.xUiBalance() * fraction;
  }
  getPoolType(): PoolType {
    return PoolType.CONSTANT_PRODUCT;
  }

  // transactions
  async makeSwapPayloadDirectional( 
    amountIn: UITokenAmount, 
    minAmountOut: UITokenAmount, 
    isXtoY: boolean
  ): Promise<TransactionPayload> {
    const fromTokenInfo = isXtoY ? this.xTokenInfo : this.yTokenInfo;
    const toTokenInfo = isXtoY ? this.yTokenInfo : this.xTokenInfo;
    const fromRawAmount = bigInt((amountIn * Math.pow(10, fromTokenInfo.decimals)).toFixed(0));
    const toRawAmount = bigInt((minAmountOut * Math.pow(10, toTokenInfo.decimals)).toFixed(0));
    if(isXtoY) {
      return CPScripts.build_payload_swap_script(
        fromRawAmount, 
        bigInt(0), 
        bigInt(0), 
        toRawAmount, 
        this.lpTag().typeParams
      );
    }
    else {
      return CPScripts.build_payload_swap_script(
        bigInt(0), 
        fromRawAmount, 
        toRawAmount, 
        bigInt(0), 
        this.lpTag().typeParams
      );
    }
  }

  async makeAddLiquidityPayload(xUiAmt: UITokenAmount, yUiAmt: UITokenAmount): Promise<TransactionPayload> {
    const xRawAmt = bigInt((xUiAmt * Math.pow(10, this.xTokenInfo.decimals)).toFixed(0));
    const yRawAmt = bigInt((yUiAmt * Math.pow(10, this.yTokenInfo.decimals)).toFixed(0));
    return CPScripts.build_payload_add_liquidity_script(xRawAmt, yRawAmt, this.lpTag().typeParams);
  }

  async makeRemoveLiquidityPayload(
    liqiudityAmt: UITokenAmount, 
    lhsMinAmt: UITokenAmount, 
    rhsMinAmt: UITokenAmount,
  ): Promise<TransactionPayload> {
    const liquidityRawAmt = bigInt(liqiudityAmt * Math.pow(10, this.lpTokenInfo.decimals));
    const lhsMinRawAmt = bigInt(lhsMinAmt * Math.pow(10, this.xTokenInfo.decimals));
    const rhsMinRawAmt = bigInt(rhsMinAmt * Math.pow(10, this.yTokenInfo.decimals));
    return CPScripts.build_payload_remove_liquidity(liquidityRawAmt, lhsMinRawAmt, rhsMinRawAmt, this.lpTag().typeParams);
  }
}