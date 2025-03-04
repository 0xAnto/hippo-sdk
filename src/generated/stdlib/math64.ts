import * as $ from '@manahippo/move-to-ts';
import { AptosDataCache, AptosParserRepo, DummyCache, AptosLocalCache } from '@manahippo/move-to-ts';
import { U8, U64, U128 } from '@manahippo/move-to-ts';
import { u8, u64, u128 } from '@manahippo/move-to-ts';
import { TypeParamDeclType, FieldDeclType } from '@manahippo/move-to-ts';
import { AtomicTypeTag, StructTag, TypeTag, VectorTag, SimpleStructTag } from '@manahippo/move-to-ts';
import { HexString, AptosClient, AptosAccount, TxnBuilderTypes, Types } from 'aptos';
export const packageName = 'AptosStdlib';
export const moduleAddress = new HexString('0x1');
export const moduleName = 'math64';

export function average_(a: U64, b: U64, $c: AptosDataCache): U64 {
  return $.copy(a).add($.copy(b)).div(u64('2'));
}

export function max_(a: U64, b: U64, $c: AptosDataCache): U64 {
  let temp$1;
  if ($.copy(a).ge($.copy(b))) {
    temp$1 = $.copy(a);
  } else {
    temp$1 = $.copy(b);
  }
  return temp$1;
}

export function min_(a: U64, b: U64, $c: AptosDataCache): U64 {
  let temp$1;
  if ($.copy(a).lt($.copy(b))) {
    temp$1 = $.copy(a);
  } else {
    temp$1 = $.copy(b);
  }
  return temp$1;
}

export function pow_(n: U64, e: U64, $c: AptosDataCache): U64 {
  let temp$1, temp$2, temp$3, p;
  if ($.copy(e).eq(u64('0'))) {
    temp$3 = u64('1');
  } else {
    if ($.copy(e).eq(u64('1'))) {
      temp$2 = $.copy(n);
    } else {
      p = pow_($.copy(n), $.copy(e).div(u64('2')), $c);
      p = $.copy(p).mul($.copy(p));
      if ($.copy(e).mod(u64('2')).eq(u64('1'))) {
        p = $.copy(p).mul($.copy(n));
        temp$1 = $.copy(p);
      } else {
        temp$1 = $.copy(p);
      }
      temp$2 = temp$1;
    }
    temp$3 = temp$2;
  }
  return temp$3;
}

export function loadParsers(repo: AptosParserRepo) {}
export class App {
  constructor(public client: AptosClient, public repo: AptosParserRepo, public cache: AptosLocalCache) {}
  get moduleAddress() {
    {
      return moduleAddress;
    }
  }
  get moduleName() {
    {
      return moduleName;
    }
  }
}
