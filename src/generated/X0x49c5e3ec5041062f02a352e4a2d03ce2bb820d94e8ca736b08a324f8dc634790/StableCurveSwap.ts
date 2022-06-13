import { HexString } from "aptos";
import bigInt from "big-integer";
import { TypeParamDeclType } from "@manahippo/aptos-tsgen";
import { FieldDeclType } from "@manahippo/aptos-tsgen";
import { parseTypeTagOrThrow } from "@manahippo/aptos-tsgen";
import { TypeTag } from "@manahippo/aptos-tsgen";
import { AptosParserRepo } from "@manahippo/aptos-tsgen";
import { parseStructProto } from "@manahippo/aptos-tsgen";
import { AptosClient } from "aptos";
import * as X0x1 from "../X0x1";

export const moduleAddress = new HexString("0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790");
export const moduleName = "StableCurveSwap";

export const ERROR_SWAP_INVALID_DERIVIATION: bigInt.BigInteger = bigInt("2020");
export const ERROR_EXCEEDED: bigInt.BigInteger = bigInt("1001");
export const ERROR_ITERATE_END: bigInt.BigInteger = bigInt("1000");
export const ERROR_SWAP_ADDLIQUIDITY_INVALID: bigInt.BigInteger = bigInt("2007");
export const ERROR_SWAP_A_VALUE: bigInt.BigInteger = bigInt("2010");
export const ERROR_SWAP_BURN_CALC_INVALID: bigInt.BigInteger = bigInt("2004");
export const ERROR_SWAP_INVALID_TOKEN_PAIR: bigInt.BigInteger = bigInt("2000");
export const ERROR_SWAP_PRECONDITION: bigInt.BigInteger = bigInt("2001");
export const ERROR_SWAP_PRIVILEGE_INSUFFICIENT: bigInt.BigInteger = bigInt("2003");
export const ERROR_SWAP_RAMP_TIME: bigInt.BigInteger = bigInt("2009");
export const ERROR_SWAP_TOKEN_NOT_EXISTS: bigInt.BigInteger = bigInt("2008");
export const FEE_DENOMINATOR: bigInt.BigInteger = bigInt("1000000");
export const MAX_A: bigInt.BigInteger = bigInt("1000000");
export const MAX_ADMIN_FEE: bigInt.BigInteger = bigInt("1000000");
export const MAX_A_CHANGE: bigInt.BigInteger = bigInt("10");
export const MAX_FEE: bigInt.BigInteger = bigInt("500000");
export const MIN_RAMP_TIME: bigInt.BigInteger = bigInt("86400");

export class LPToken {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "LPToken";
  static typeParameters: TypeParamDeclType[] = [
    {name: "$tv0", isPhantom: true},
    {name: "$tv1", isPhantom: true}
  ];
  static fields: FieldDeclType[] = [
    {name: "dummy_field", typeTag: parseTypeTagOrThrow("bool")}
  ];

  dummy_field: boolean;

  constructor(proto: any, public typeTag: TypeTag) {
    this.dummy_field = proto['dummy_field'] as boolean;
  }

  static LPTokenParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : LPToken {
    const proto = parseStructProto(data, typeTag, repo, LPToken);
    return new LPToken(proto, typeTag);
  }

}

export class LPCapability {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "LPCapability";
  static typeParameters: TypeParamDeclType[] = [
    {name: "$tv0", isPhantom: true},
    {name: "$tv1", isPhantom: true}
  ];
  static fields: FieldDeclType[] = [
    {name: "mint_cap", typeTag: parseTypeTagOrThrow("0x1::Coin::MintCapability<0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790::StableCurveSwap::LPToken<$tv0,$tv1>>")},
    {name: "burn_cap", typeTag: parseTypeTagOrThrow("0x1::Coin::BurnCapability<0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790::StableCurveSwap::LPToken<$tv0,$tv1>>")}
  ];

  mint_cap: X0x1.Coin.MintCapability;
  burn_cap: X0x1.Coin.BurnCapability;

  constructor(proto: any, public typeTag: TypeTag) {
    this.mint_cap = proto['mint_cap'] as X0x1.Coin.MintCapability;
    this.burn_cap = proto['burn_cap'] as X0x1.Coin.BurnCapability;
  }

  static LPCapabilityParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : LPCapability {
    const proto = parseStructProto(data, typeTag, repo, LPCapability);
    return new LPCapability(proto, typeTag);
  }

  static async load(repo: AptosParserRepo, client: AptosClient, address: HexString, typeParams: TypeTag[]) {
    const result = await repo.loadResource(client, address, LPCapability, typeParams);
    return result as unknown as LPCapability;
  }

}

export class StableCurvePoolInfo {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "StableCurvePoolInfo";
  static typeParameters: TypeParamDeclType[] = [
    {name: "$tv0", isPhantom: true},
    {name: "$tv1", isPhantom: true}
  ];
  static fields: FieldDeclType[] = [
    {name: "disabled", typeTag: parseTypeTagOrThrow("bool")},
    {name: "reserve_x", typeTag: parseTypeTagOrThrow("0x1::Coin::Coin<$tv0>")},
    {name: "reserve_y", typeTag: parseTypeTagOrThrow("0x1::Coin::Coin<$tv1>")},
    {name: "fee_x", typeTag: parseTypeTagOrThrow("0x1::Coin::Coin<$tv0>")},
    {name: "fee_y", typeTag: parseTypeTagOrThrow("0x1::Coin::Coin<$tv1>")},
    {name: "lp_precision", typeTag: parseTypeTagOrThrow("u64")},
    {name: "multiplier_x", typeTag: parseTypeTagOrThrow("u64")},
    {name: "multiplier_y", typeTag: parseTypeTagOrThrow("u64")},
    {name: "fee", typeTag: parseTypeTagOrThrow("u64")},
    {name: "admin_fee", typeTag: parseTypeTagOrThrow("u64")},
    {name: "initial_A", typeTag: parseTypeTagOrThrow("u64")},
    {name: "future_A", typeTag: parseTypeTagOrThrow("u64")},
    {name: "initial_A_time", typeTag: parseTypeTagOrThrow("u64")},
    {name: "future_A_time", typeTag: parseTypeTagOrThrow("u64")}
  ];

  disabled: boolean;
  reserve_x: X0x1.Coin.Coin;
  reserve_y: X0x1.Coin.Coin;
  fee_x: X0x1.Coin.Coin;
  fee_y: X0x1.Coin.Coin;
  lp_precision: bigInt.BigInteger;
  multiplier_x: bigInt.BigInteger;
  multiplier_y: bigInt.BigInteger;
  fee: bigInt.BigInteger;
  admin_fee: bigInt.BigInteger;
  initial_A: bigInt.BigInteger;
  future_A: bigInt.BigInteger;
  initial_A_time: bigInt.BigInteger;
  future_A_time: bigInt.BigInteger;

  constructor(proto: any, public typeTag: TypeTag) {
    this.disabled = proto['disabled'] as boolean;
    this.reserve_x = proto['reserve_x'] as X0x1.Coin.Coin;
    this.reserve_y = proto['reserve_y'] as X0x1.Coin.Coin;
    this.fee_x = proto['fee_x'] as X0x1.Coin.Coin;
    this.fee_y = proto['fee_y'] as X0x1.Coin.Coin;
    this.lp_precision = proto['lp_precision'] as bigInt.BigInteger;
    this.multiplier_x = proto['multiplier_x'] as bigInt.BigInteger;
    this.multiplier_y = proto['multiplier_y'] as bigInt.BigInteger;
    this.fee = proto['fee'] as bigInt.BigInteger;
    this.admin_fee = proto['admin_fee'] as bigInt.BigInteger;
    this.initial_A = proto['initial_A'] as bigInt.BigInteger;
    this.future_A = proto['future_A'] as bigInt.BigInteger;
    this.initial_A_time = proto['initial_A_time'] as bigInt.BigInteger;
    this.future_A_time = proto['future_A_time'] as bigInt.BigInteger;
  }

  static StableCurvePoolInfoParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : StableCurvePoolInfo {
    const proto = parseStructProto(data, typeTag, repo, StableCurvePoolInfo);
    return new StableCurvePoolInfo(proto, typeTag);
  }

  static async load(repo: AptosParserRepo, client: AptosClient, address: HexString, typeParams: TypeTag[]) {
    const result = await repo.loadResource(client, address, StableCurvePoolInfo, typeParams);
    return result as unknown as StableCurvePoolInfo;
  }

}

export function loadParsers(repo: AptosParserRepo) {
  repo.addParser("0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790::StableCurveSwap::LPToken", LPToken.LPTokenParser);
  repo.addParser("0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790::StableCurveSwap::LPCapability", LPCapability.LPCapabilityParser);
  repo.addParser("0x49c5e3ec5041062f02a352e4a2d03ce2bb820d94e8ca736b08a324f8dc634790::StableCurveSwap::StableCurvePoolInfo", StableCurvePoolInfo.StableCurvePoolInfoParser);
}