import { TransactionPayload } from 'aptos/dist/api/data-contracts';
import bigInt from 'big-integer';
import { StableCurveScripts, StableCurveSwap } from '../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790';
import { TokenInfo } from '../generated/X0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790/TokenRegistry';
import {HippoPool, PoolType, PriceType, QuoteType, UITokenAmount} from './baseTypes';

export class HippoStableCurvePool extends HippoPool {
  constructor(
    xTokenInfo: TokenInfo,
    yTokenInfo: TokenInfo,
    lpTokenInfo: TokenInfo,
    public stablePoolInfo: StableCurveSwap.StableCurvePoolInfo,
  ) {
    super(xTokenInfo, yTokenInfo, lpTokenInfo);
  }
  xUiBalance() {
    return this.stablePoolInfo.reserve_x .value.toJSNumber() / Math.pow(10, this.xTokenInfo.decimals);
  }
  yUiBalance() {
    return this.stablePoolInfo.reserve_y .value.toJSNumber() / Math.pow(10, this.yTokenInfo.decimals);
  }
  getId(): string {
    return `HippoStableCurvePool<${this.xyFullname()}>`;
  }
  getCurrentPriceDirectional(isXtoY: boolean): PriceType {
    // TODO
    throw new Error();
  }
  getQuoteDirectional(inputUiAmt: UITokenAmount, isXtoY: boolean) : QuoteType {
    // TODO
    throw new Error();
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
    return PoolType.STABLE_CURVE;
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
      return StableCurveScripts.build_payload_swap_script(
        fromRawAmount, 
        bigInt(0), 
        bigInt(0), 
        toRawAmount, 
        this.lpTag().typeParams
      );
    }
    else {
      return StableCurveScripts.build_payload_swap_script(
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
    return StableCurveScripts.build_payload_add_liquidity(xRawAmt, yRawAmt, this.lpTag().typeParams);
  }

  async makeRemoveLiquidityPayload(
    liqiudityAmt: UITokenAmount, 
    lhsMinAmt: UITokenAmount, 
    rhsMinAmt: UITokenAmount,
  ): Promise<TransactionPayload> {
    const liquidityRawAmt = bigInt(liqiudityAmt * Math.pow(10, this.lpTokenInfo.decimals));
    const lhsMinRawAmt = bigInt(lhsMinAmt * Math.pow(10, this.xTokenInfo.decimals));
    const rhsMinRawAmt = bigInt(rhsMinAmt * Math.pow(10, this.yTokenInfo.decimals));
    return StableCurveScripts.build_payload_remove_liquidity(liquidityRawAmt, lhsMinRawAmt, rhsMinRawAmt, this.lpTag().typeParams);
  }
}