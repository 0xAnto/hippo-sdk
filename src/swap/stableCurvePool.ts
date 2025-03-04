import { u64 } from '@manahippo/move-to-ts';
import { Stable_curve_scripts, Stable_curve_swap } from '../generated/hippo_swap';
import { HippoPool, PoolType, PriceType, QuoteType, UITokenAmount } from './baseTypes';
import { CoinInfo } from '../generated/coin_list/coin_list';
import { TxnBuilderTypes } from 'aptos';

export class HippoStableCurvePool extends HippoPool {
  static FEE_DENOMINATOR = 10 ** 6;
  constructor(
    xCoinInfo: CoinInfo,
    yCoinInfo: CoinInfo,
    lpCoinInfo: CoinInfo,
    public stablePoolInfo: Stable_curve_swap.StableCurvePoolInfo
  ) {
    super(xCoinInfo, yCoinInfo, lpCoinInfo);
  }
  xUiBalance() {
    return this.stablePoolInfo.reserve_x.value.toJsNumber() / Math.pow(10, this.xCoinInfo.decimals.toJsNumber());
  }
  yUiBalance() {
    return this.stablePoolInfo.reserve_y.value.toJsNumber() / Math.pow(10, this.yCoinInfo.decimals.toJsNumber());
  }
  getId(): string {
    return `HippoStableCurvePool<${this.xyFullname()}>`;
  }

  private static getA(
    initial_A: number,
    future_A: number,
    initial_A_time: number,
    future_A_time: number,
    timestamp: number
  ): number {
    if (timestamp < future_A_time) {
      if (future_A < initial_A) {
        return initial_A - ((initial_A - future_A) * (timestamp - initial_A_time)) / (future_A_time - initial_A_time);
      } else {
        return initial_A + ((future_A - initial_A) * (timestamp - initial_A_time)) / (future_A_time - initial_A_time);
      }
    } else {
      return future_A;
    }
  }

  private getCurrentA() {
    return HippoStableCurvePool.getA(
      this.stablePoolInfo.initial_A.toJsNumber(),
      this.stablePoolInfo.future_A.toJsNumber(),
      this.stablePoolInfo.initial_A_time.toJsNumber(),
      this.stablePoolInfo.future_A_time.toJsNumber(),
      Date.now() * 1000
    );
  }

  private recurD(d: number, x: number, y: number, amp: number): number {
    const d1 = (8 * amp * x * y * (x + y) + 2 * d * d * d) / (3 * d * d + 4 * x * y * (2 * amp - 1));
    const minuend = d - d1;
    if (minuend <= 0.00000001) {
      return d1;
    } else {
      return this.recurD(d1, x, y, amp);
    }
  }

  private getD(x: number, y: number, amp: number) {
    let d0 = x + y;
    if (d0 == 0) {
      return d0;
    }
    return this.recurD(d0, x, y, amp);
  }

  private recurY(y: number, b: number, c: number, d: number): number {
    const yNext = (y * y + c) / (2 * y + b - d);
    let difference;
    if (yNext > y) difference = yNext - y;
    else difference = y - yNext;
    if (difference <= 0.00000001) return yNext;
    else {
      return this.recurY(yNext, b, c, d);
    }
  }

  private getY(x: number, amp: number, d: number) {
    if (d == 0) {
      return 0;
    }
    let y = d;
    let b = x + d / (2 * amp);
    let c = (d * d * d) / (8 * amp * x);
    return this.recurY(y, b, c, d);
  }

  private getPrice(x: number, y: number, d: number, a: number) {
    const dx = 0.001;
    const newy = this.getY(x - dx, a, d);
    return dx / (newy - y);
  }

  getCurrentPriceDirectional(isXtoY: boolean): PriceType {
    const x = this.xUiBalance();
    const y = this.yUiBalance();
    const a = this.getCurrentA();
    const d = this.getD(x, y, a);
    const xy = this.getPrice(x, y, d, a);
    if (isXtoY) {
      return { xToY: 1 / xy, yToX: xy };
    }
    return { xToY: xy, yToX: 1 / xy };
  }

  getQuoteDirectional(inputUiAmt: UITokenAmount, isXtoY: boolean): QuoteType {
    const amp = this.getCurrentA();
    const d = this.getD(this.xUiBalance(), this.yUiBalance(), amp);
    let lhs, rhs, difference, inputSymbol, outputSymbol, amtFee, finalPrice;
    if (isXtoY) {
      inputSymbol = this.xCoinInfo.symbol.str();
      outputSymbol = this.yCoinInfo.symbol.str();
      lhs = inputUiAmt + this.xUiBalance();
      rhs = this.getY(lhs, amp, d);
      difference = this.yUiBalance() - rhs;
      amtFee = (difference * this.stablePoolInfo.fee.toJsNumber()) / HippoStableCurvePool.FEE_DENOMINATOR;
      finalPrice = this.getPrice(lhs, rhs, d, amp);
    } else {
      inputSymbol = this.xCoinInfo.symbol.str();
      outputSymbol = this.yCoinInfo.symbol.str();
      lhs = inputUiAmt + this.yUiBalance();
      rhs = this.getY(lhs, amp, d);
      difference = this.xUiBalance() - rhs;
      amtFee = (difference * this.stablePoolInfo.fee.toJsNumber()) / HippoStableCurvePool.FEE_DENOMINATOR;
      finalPrice = this.getPrice(lhs, rhs, d, amp);
    }
    const outputUiAmt = difference - amtFee;
    const initialPrice = this.getCurrentPriceDirectional(isXtoY).xToY;
    return {
      inputSymbol,
      outputSymbol,
      inputUiAmt,
      outputUiAmt,
      initialPrice,
      avgPrice: inputUiAmt / difference,
      finalPrice: finalPrice,
      priceImpact: Math.abs(finalPrice - initialPrice)
    };
  }

  estimateWithdrawalOutput(
    lpUiAmount: UITokenAmount,
    lpSupplyUiAmt: UITokenAmount
  ): { xUiAmt: UITokenAmount; yUiAmt: UITokenAmount } {
    const fraction = lpUiAmount / lpSupplyUiAmt;
    return {
      xUiAmt: this.xUiBalance() * fraction,
      yUiAmt: this.yUiBalance() * fraction
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
  ): Promise<TxnBuilderTypes.TransactionPayloadEntryFunction> {
    const fromTokenInfo = isXtoY ? this.xCoinInfo : this.yCoinInfo;
    const toTokenInfo = isXtoY ? this.yCoinInfo : this.xCoinInfo;
    const fromRawAmount = u64((amountIn * Math.pow(10, fromTokenInfo.decimals.toJsNumber())).toFixed(0));
    const toRawAmount = u64((minAmountOut * Math.pow(10, toTokenInfo.decimals.toJsNumber())).toFixed(0));
    if (isXtoY) {
      return Stable_curve_scripts.buildPayload_swap_script(
        fromRawAmount,
        u64(0),
        u64(0),
        toRawAmount,
        this.lpTag().typeParams
      ) as TxnBuilderTypes.TransactionPayloadEntryFunction;
    } else {
      return Stable_curve_scripts.buildPayload_swap_script(
        u64(0),
        fromRawAmount,
        toRawAmount,
        u64(0),
        this.lpTag().typeParams
      ) as TxnBuilderTypes.TransactionPayloadEntryFunction;
    }
  }

  async makeAddLiquidityPayload(
    xUiAmt: UITokenAmount,
    yUiAmt: UITokenAmount
  ): Promise<TxnBuilderTypes.TransactionPayloadEntryFunction> {
    const xRawAmt = u64((xUiAmt * Math.pow(10, this.xCoinInfo.decimals.toJsNumber())).toFixed(0));
    const yRawAmt = u64((yUiAmt * Math.pow(10, this.yCoinInfo.decimals.toJsNumber())).toFixed(0));
    return Stable_curve_scripts.buildPayload_add_liquidity(
      xRawAmt,
      yRawAmt,
      this.lpTag().typeParams
    ) as TxnBuilderTypes.TransactionPayloadEntryFunction;
  }

  async makeRemoveLiquidityPayload(
    liqiudityAmt: UITokenAmount,
    lhsMinAmt: UITokenAmount,
    rhsMinAmt: UITokenAmount
  ): Promise<TxnBuilderTypes.TransactionPayloadEntryFunction> {
    const liquidityRawAmt = u64(liqiudityAmt * Math.pow(10, this.lpCoinInfo.decimals.toJsNumber()));
    const lhsMinRawAmt = u64(lhsMinAmt * Math.pow(10, this.xCoinInfo.decimals.toJsNumber()));
    const rhsMinRawAmt = u64(rhsMinAmt * Math.pow(10, this.yCoinInfo.decimals.toJsNumber()));
    return Stable_curve_scripts.buildPayload_remove_liquidity(
      liquidityRawAmt,
      lhsMinRawAmt,
      rhsMinRawAmt,
      this.lpTag().typeParams
    ) as TxnBuilderTypes.TransactionPayloadEntryFunction;
  }
}
