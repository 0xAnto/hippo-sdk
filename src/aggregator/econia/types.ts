import { HexString, Types } from 'aptos';
import { App } from '../../generated';
import {
  AptosParserRepo,
  AtomicTypeTag,
  getTypeTagFullname,
  moveValueToOpenApiObject,
  SimulationKeys,
  u64,
  U64
} from '@manahippo/move-to-ts';

import { EconiaClient } from './econia_client';
import { OrderBook, OrderBooks } from '../../generated/econia/market';
import { MarketInfo } from '../../generated/econia/registry';
import { CoinListClient } from '../../coinList';
import { DexType, PriceType, QuoteType, TradingPool, TradingPoolProvider, UITokenAmount } from '../types';
import { Registry } from '../../generated/econia';
import { CoinInfo } from '../../generated/coin_list/coin_list';
import { CONFIGS } from '../../config';

export * from './econia_client';

export enum EconiaPoolType {
  // eslint-disable-next-line no-unused-vars
  V3 = 3
}

export class EconiaTradingPoolV1 extends TradingPool {
  constructor(
    public xInfo: CoinInfo,
    public yInfo: CoinInfo,
    public orderBook: OrderBook | null,
    public mi: MarketInfo,
    public owner: HexString,
    public repo: AptosParserRepo,
    public marketId: U64
  ) {
    super();
  }
  get dexType() {
    return DexType.Econia;
  }
  get poolType() {
    return this.marketId;
  }
  get isRoutable() {
    return true;
  }
  // X-Y
  get xCoinInfo() {
    return this.xInfo;
  }
  get yCoinInfo() {
    return this.yInfo;
  }
  get xTag() {
    return this.xCoinInfo.token_type.toTypeTag();
  }
  get yTag() {
    return this.yCoinInfo.token_type.toTypeTag();
  }
  // functions that depend on pool's onchain state
  isStateLoaded() {
    return !!this.orderBook;
  }
  async reloadState(app: App): Promise<void> {
    const orderBooks = await OrderBooks.load(this.repo, app.client, this.owner, []);
    const rawOrderBook = await app.client.getTableItem(orderBooks.map.base_table.handle.toString(), {
      key_type: getTypeTagFullname(AtomicTypeTag.U64),
      value_type: OrderBook.getTag().getFullname(),
      key: moveValueToOpenApiObject(this.marketId, AtomicTypeTag.U64)
    });
    this.orderBook = OrderBook.OrderBookParser(rawOrderBook, OrderBook.getTag(), this.repo);
  }
  getUiPrice(rawPrice: U64) {
    if (!this.orderBook) {
      throw new Error('Econia Orderbook not loaded. cannot compute price');
    }
    const xFactor = Math.pow(10, this.xCoinInfo.decimals.toJsNumber());
    const yFactor = Math.pow(10, this.yCoinInfo.decimals.toJsNumber());
    // const scaleFactor = this.orderBook.scale_factor.toJsNumber();

    const lotSize = this.orderBook.lot_size.toJsNumber();
    const tickSize = this.orderBook.tick_size.toJsNumber();

    // yToX price
    return rawPrice.toJsNumber() * (xFactor / yFactor) * (tickSize / lotSize);
  }
  getPrice(): PriceType {
    if (!this.orderBook) {
      throw new Error('Econia Orderbook not loaded. cannot compute price');
    }
    // use top-of-book price
    let xToY = 0;
    let yToX = 0;
    const orderVectors = this.orderBook.orders_vectors();
    const [asks, bids] = orderVectors;
    if (asks.length > 0) {
      // y to x is buying, hits asks
      yToX = this.getUiPrice(asks[0].price);
    }
    if (bids.length > 0) {
      // x to y is selling, hits bids
      xToY = 1 / this.getUiPrice(bids[0].price);
    }
    return {
      xToY,
      yToX
    };
  }
  getQuote(inputUiAmt: UITokenAmount, isXtoY: boolean): QuoteType {
    if (!this.orderBook) {
      throw new Error('Econia Orderbook not loaded. cannot compute quote');
    }
    const [asks, bids] = this.orderBook.orders_vectors();
    if (isXtoY) {
      // selling
      let soldBaseSize = u64(0);
      let remainingBaseSize = u64(Math.floor(inputUiAmt * Math.pow(10, this.xCoinInfo.decimals.toJsNumber())));
      let gotQuoteSize = u64(0);
      for (const bid of bids) {
        if (remainingBaseSize.eq(u64(0))) {
          break;
        }
        const bidBaseSize = bid.size.mul(this.orderBook.lot_size);
        const fillBaseSize = remainingBaseSize.gt(bidBaseSize) ? bidBaseSize : remainingBaseSize;
        if (fillBaseSize.gt(u64(0))) {
          soldBaseSize = soldBaseSize.add(fillBaseSize);
          remainingBaseSize = remainingBaseSize.sub(fillBaseSize);
          gotQuoteSize = gotQuoteSize.add(
            fillBaseSize.div(this.orderBook.lot_size).mul(bid.price).mul(this.orderBook.tick_size)
          );
        }
      }
      // has partial unfilled
      const actualInputUiAmt = soldBaseSize.toJsNumber() / Math.pow(10, this.xCoinInfo.decimals.toJsNumber());
      const outputUiAmt = gotQuoteSize.toJsNumber() / Math.pow(10, this.yCoinInfo.decimals.toJsNumber());
      return {
        inputSymbol: this.xCoinInfo.symbol.str(),
        outputSymbol: this.yCoinInfo.symbol.str(),
        inputUiAmt: actualInputUiAmt,
        outputUiAmt,
        avgPrice: outputUiAmt / actualInputUiAmt
      };
    } else {
      // buying
      let gotBaseSize = u64(0);
      let soldQuoteSize = u64(0);
      let remainingQuoteSize = u64(Math.floor(inputUiAmt * Math.pow(10, this.yCoinInfo.decimals.toJsNumber())));
      for (const ask of asks) {
        if (remainingQuoteSize.eq(u64(0))) {
          break;
        }
        const askQuoteSize = ask.size.mul(ask.price).mul(this.orderBook.tick_size);
        const fillQuoteSize = remainingQuoteSize.gt(askQuoteSize) ? askQuoteSize : remainingQuoteSize;
        if (fillQuoteSize.gt(u64(0))) {
          soldQuoteSize = soldQuoteSize.add(fillQuoteSize);
          remainingQuoteSize = remainingQuoteSize.sub(fillQuoteSize);
          gotBaseSize = gotBaseSize.add(
            fillQuoteSize.div(this.orderBook.tick_size).div(ask.price).mul(this.orderBook.lot_size)
          );
        }
      }
      const actualInputUiAmt = soldQuoteSize.toJsNumber() / Math.pow(10, this.yCoinInfo.decimals.toJsNumber());
      const outputUiAmt = gotBaseSize.toJsNumber() / Math.pow(10, this.xCoinInfo.decimals.toJsNumber());
      return {
        inputSymbol: this.yCoinInfo.symbol.str(),
        outputSymbol: this.xCoinInfo.symbol.str(),
        inputUiAmt: actualInputUiAmt,
        outputUiAmt,
        avgPrice: outputUiAmt / actualInputUiAmt
      };
    }
  }

  // build payload directly if not routable
  makePayload(inputUiAmt: UITokenAmount, minOutAmt: UITokenAmount): Types.EntryFunctionPayload {
    // routable, so no need to implement
    throw new Error('Not Implemented');
  }
}

export class EconiaPoolProvider extends TradingPoolProvider {
  constructor(app: App, fetcher: SimulationKeys, netConfig = CONFIGS.devnet, public registry: CoinListClient) {
    super(app, fetcher, netConfig);
  }
  async loadPoolList(): Promise<TradingPool[]> {
    const econiaClient = new EconiaClient(this.app.client, this.app.parserRepo, Registry.moduleAddress);
    const markets = await econiaClient.getMarkets();
    const pools: TradingPool[] = [];
    const promises: Promise<void>[] = [];
    markets.forEach((mi, marketId) => {
      if (
        this.registry.hasTokenType(mi.trading_pair_info.base_type_info) &&
        this.registry.hasTokenType(mi.trading_pair_info.quote_type_info) &&
        // host is devnet contract
        mi.host.hex() === this.netConfig.hippoAggregatorAddress.hex()
      ) {
        pools.push(
          new EconiaTradingPoolV1(
            this.registry.getCoinInfoByType(mi.trading_pair_info.base_type_info),
            this.registry.getCoinInfoByType(mi.trading_pair_info.quote_type_info),
            null,
            mi,
            mi.host,
            this.app.parserRepo,
            new U64(marketId)
          )
        );
      }
    });
    await Promise.all(promises);
    return pools;
  }
}
