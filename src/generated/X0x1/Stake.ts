import { HexString } from "aptos";
import bigInt from "big-integer";
import { TypeParamDeclType } from "@manahippo/aptos-tsgen";
import { FieldDeclType } from "@manahippo/aptos-tsgen";
import { parseTypeTagOrThrow } from "@manahippo/aptos-tsgen";
import { TypeTag } from "@manahippo/aptos-tsgen";
import { AptosParserRepo } from "@manahippo/aptos-tsgen";
import { parseStructProto } from "@manahippo/aptos-tsgen";
import { AptosClient } from "aptos";
import { AptosVectorU8 } from "@manahippo/aptos-tsgen";
import { AptosAccount } from "aptos";
import { getTypeTagFullname } from "@manahippo/aptos-tsgen";
import { sendAndWait } from "@manahippo/aptos-tsgen";
import { buildPayload } from "@manahippo/aptos-tsgen";
import * as Coin from "./Coin";

export const moduleAddress = new HexString("0x1");
export const moduleName = "Stake";

export const EALREADY_REGISTERED: bigInt.BigInteger = bigInt("10");
export const EALREADY_VALIDATOR: bigInt.BigInteger = bigInt("6");
export const ELAST_VALIDATOR: bigInt.BigInteger = bigInt("8");
export const ELOCK_TIME_TOO_SHORT: bigInt.BigInteger = bigInt("1");
export const ENOT_OPERATOR: bigInt.BigInteger = bigInt("13");
export const ENOT_OWNER: bigInt.BigInteger = bigInt("11");
export const ENOT_VALIDATOR: bigInt.BigInteger = bigInt("7");
export const ENO_COINS_TO_WITHDRAW: bigInt.BigInteger = bigInt("12");
export const ESTAKE_EXCEEDS_MAX: bigInt.BigInteger = bigInt("9");
export const ESTAKE_TOO_HIGH: bigInt.BigInteger = bigInt("5");
export const ESTAKE_TOO_LOW: bigInt.BigInteger = bigInt("4");
export const EVALIDATOR_CONFIG: bigInt.BigInteger = bigInt("3");
export const EWITHDRAW_NOT_ALLOWED: bigInt.BigInteger = bigInt("2");
export const MINIMUM_LOCK_PERIOD: bigInt.BigInteger = bigInt("86400");
export const REWARDS_RATE_PERCENT: bigInt.BigInteger = bigInt("1");

export class OwnerCapability {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "OwnerCapability";
  static typeParameters: TypeParamDeclType[] = [
  ];
  static fields: FieldDeclType[] = [
    {name: "pool_address", typeTag: parseTypeTagOrThrow("address")}
  ];

  pool_address: HexString;

  constructor(proto: any, public typeTag: TypeTag) {
    this.pool_address = proto['pool_address'] as HexString;
  }

  static OwnerCapabilityParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : OwnerCapability {
    const proto = parseStructProto(data, typeTag, repo, OwnerCapability);
    return new OwnerCapability(proto, typeTag);
  }

  static async load(repo: AptosParserRepo, client: AptosClient, address: HexString, typeParams: TypeTag[]) {
    const result = await repo.loadResource(client, address, OwnerCapability, typeParams);
    return result as unknown as OwnerCapability;
  }

}

export class StakePool {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "StakePool";
  static typeParameters: TypeParamDeclType[] = [
  ];
  static fields: FieldDeclType[] = [
    {name: "active", typeTag: parseTypeTagOrThrow("0x1::Coin::Coin<0x1::TestCoin::TestCoin>")},
    {name: "inactive", typeTag: parseTypeTagOrThrow("0x1::Coin::Coin<0x1::TestCoin::TestCoin>")},
    {name: "pending_active", typeTag: parseTypeTagOrThrow("0x1::Coin::Coin<0x1::TestCoin::TestCoin>")},
    {name: "pending_inactive", typeTag: parseTypeTagOrThrow("0x1::Coin::Coin<0x1::TestCoin::TestCoin>")},
    {name: "locked_until_secs", typeTag: parseTypeTagOrThrow("u64")},
    {name: "operator_address", typeTag: parseTypeTagOrThrow("address")}
  ];

  active: Coin.Coin;
  inactive: Coin.Coin;
  pending_active: Coin.Coin;
  pending_inactive: Coin.Coin;
  locked_until_secs: bigInt.BigInteger;
  operator_address: HexString;

  constructor(proto: any, public typeTag: TypeTag) {
    this.active = proto['active'] as Coin.Coin;
    this.inactive = proto['inactive'] as Coin.Coin;
    this.pending_active = proto['pending_active'] as Coin.Coin;
    this.pending_inactive = proto['pending_inactive'] as Coin.Coin;
    this.locked_until_secs = proto['locked_until_secs'] as bigInt.BigInteger;
    this.operator_address = proto['operator_address'] as HexString;
  }

  static StakePoolParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : StakePool {
    const proto = parseStructProto(data, typeTag, repo, StakePool);
    return new StakePool(proto, typeTag);
  }

  static async load(repo: AptosParserRepo, client: AptosClient, address: HexString, typeParams: TypeTag[]) {
    const result = await repo.loadResource(client, address, StakePool, typeParams);
    return result as unknown as StakePool;
  }

}

export class ValidatorConfig {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "ValidatorConfig";
  static typeParameters: TypeParamDeclType[] = [
  ];
  static fields: FieldDeclType[] = [
    {name: "consensus_pubkey", typeTag: parseTypeTagOrThrow("vector<u8>")},
    {name: "network_address", typeTag: parseTypeTagOrThrow("vector<u8>")},
    {name: "fullnode_address", typeTag: parseTypeTagOrThrow("vector<u8>")}
  ];

  consensus_pubkey: AptosVectorU8;
  network_address: AptosVectorU8;
  fullnode_address: AptosVectorU8;

  constructor(proto: any, public typeTag: TypeTag) {
    this.consensus_pubkey = proto['consensus_pubkey'] as AptosVectorU8;
    this.network_address = proto['network_address'] as AptosVectorU8;
    this.fullnode_address = proto['fullnode_address'] as AptosVectorU8;
  }

  static ValidatorConfigParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : ValidatorConfig {
    const proto = parseStructProto(data, typeTag, repo, ValidatorConfig);
    return new ValidatorConfig(proto, typeTag);
  }

  static async load(repo: AptosParserRepo, client: AptosClient, address: HexString, typeParams: TypeTag[]) {
    const result = await repo.loadResource(client, address, ValidatorConfig, typeParams);
    return result as unknown as ValidatorConfig;
  }

}

export class ValidatorInfo {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "ValidatorInfo";
  static typeParameters: TypeParamDeclType[] = [
  ];
  static fields: FieldDeclType[] = [
    {name: "addr", typeTag: parseTypeTagOrThrow("address")},
    {name: "voting_power", typeTag: parseTypeTagOrThrow("u64")},
    {name: "config", typeTag: parseTypeTagOrThrow("0x1::Stake::ValidatorConfig")}
  ];

  addr: HexString;
  voting_power: bigInt.BigInteger;
  config: ValidatorConfig;

  constructor(proto: any, public typeTag: TypeTag) {
    this.addr = proto['addr'] as HexString;
    this.voting_power = proto['voting_power'] as bigInt.BigInteger;
    this.config = proto['config'] as ValidatorConfig;
  }

  static ValidatorInfoParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : ValidatorInfo {
    const proto = parseStructProto(data, typeTag, repo, ValidatorInfo);
    return new ValidatorInfo(proto, typeTag);
  }

}

export class ValidatorSet {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "ValidatorSet";
  static typeParameters: TypeParamDeclType[] = [
  ];
  static fields: FieldDeclType[] = [
    {name: "consensus_scheme", typeTag: parseTypeTagOrThrow("u8")},
    {name: "minimum_stake", typeTag: parseTypeTagOrThrow("u64")},
    {name: "maximum_stake", typeTag: parseTypeTagOrThrow("u64")},
    {name: "active_validators", typeTag: parseTypeTagOrThrow("vector<0x1::Stake::ValidatorInfo>")},
    {name: "pending_inactive", typeTag: parseTypeTagOrThrow("vector<0x1::Stake::ValidatorInfo>")},
    {name: "pending_active", typeTag: parseTypeTagOrThrow("vector<0x1::Stake::ValidatorInfo>")}
  ];

  consensus_scheme: number;
  minimum_stake: bigInt.BigInteger;
  maximum_stake: bigInt.BigInteger;
  active_validators: ValidatorInfo[];
  pending_inactive: ValidatorInfo[];
  pending_active: ValidatorInfo[];

  constructor(proto: any, public typeTag: TypeTag) {
    this.consensus_scheme = proto['consensus_scheme'] as number;
    this.minimum_stake = proto['minimum_stake'] as bigInt.BigInteger;
    this.maximum_stake = proto['maximum_stake'] as bigInt.BigInteger;
    this.active_validators = proto['active_validators'] as ValidatorInfo[];
    this.pending_inactive = proto['pending_inactive'] as ValidatorInfo[];
    this.pending_active = proto['pending_active'] as ValidatorInfo[];
  }

  static ValidatorSetParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : ValidatorSet {
    const proto = parseStructProto(data, typeTag, repo, ValidatorSet);
    return new ValidatorSet(proto, typeTag);
  }

  static async load(repo: AptosParserRepo, client: AptosClient, address: HexString, typeParams: TypeTag[]) {
    const result = await repo.loadResource(client, address, ValidatorSet, typeParams);
    return result as unknown as ValidatorSet;
  }

}

export class TestCoinCapabilities {
  static moduleAddress = moduleAddress;
  static moduleName = moduleName;
  static structName: string = "TestCoinCapabilities";
  static typeParameters: TypeParamDeclType[] = [
  ];
  static fields: FieldDeclType[] = [
    {name: "mint_cap", typeTag: parseTypeTagOrThrow("0x1::Coin::MintCapability<0x1::TestCoin::TestCoin>")}
  ];

  mint_cap: Coin.MintCapability;

  constructor(proto: any, public typeTag: TypeTag) {
    this.mint_cap = proto['mint_cap'] as Coin.MintCapability;
  }

  static TestCoinCapabilitiesParser(data:any, typeTag: TypeTag, repo: AptosParserRepo) : TestCoinCapabilities {
    const proto = parseStructProto(data, typeTag, repo, TestCoinCapabilities);
    return new TestCoinCapabilities(proto, typeTag);
  }

  static async load(repo: AptosParserRepo, client: AptosClient, address: HexString, typeParams: TypeTag[]) {
    const result = await repo.loadResource(client, address, TestCoinCapabilities, typeParams);
    return result as unknown as TestCoinCapabilities;
  }

}

export async function register_validator_candidate(
  client: AptosClient,
  account: AptosAccount,
  consensus_pubkey: AptosVectorU8,
  network_address: AptosVectorU8,
  fullnode_address: AptosVectorU8,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return sendAndWait(
    client,
    account,
    "0x1::Stake::register_validator_candidate",
    typeParamStrings,
    [
      consensus_pubkey.hex(),
      network_address.hex(),
      fullnode_address.hex(),
    ]
  );
}
export function build_payload_register_validator_candidate(
  consensus_pubkey: AptosVectorU8,
  network_address: AptosVectorU8,
  fullnode_address: AptosVectorU8,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return buildPayload(
    "0x1::Stake::register_validator_candidate",
    typeParamStrings,
    [
      consensus_pubkey.hex(),
      network_address.hex(),
      fullnode_address.hex(),
    ]
  );
}

export async function set_operator(
  client: AptosClient,
  account: AptosAccount,
  new_operator: HexString,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return sendAndWait(
    client,
    account,
    "0x1::Stake::set_operator",
    typeParamStrings,
    [
      new_operator,
    ]
  );
}
export function build_payload_set_operator(
  new_operator: HexString,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return buildPayload(
    "0x1::Stake::set_operator",
    typeParamStrings,
    [
      new_operator,
    ]
  );
}

export async function add_stake(
  client: AptosClient,
  account: AptosAccount,
  amount: bigInt.BigInteger,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return sendAndWait(
    client,
    account,
    "0x1::Stake::add_stake",
    typeParamStrings,
    [
      amount.toString(),
    ]
  );
}
export function build_payload_add_stake(
  amount: bigInt.BigInteger,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return buildPayload(
    "0x1::Stake::add_stake",
    typeParamStrings,
    [
      amount.toString(),
    ]
  );
}

export async function rotate_consensus_key(
  client: AptosClient,
  account: AptosAccount,
  pool_address: HexString,
  consensus_pubkey: AptosVectorU8,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return sendAndWait(
    client,
    account,
    "0x1::Stake::rotate_consensus_key",
    typeParamStrings,
    [
      pool_address,
      consensus_pubkey.hex(),
    ]
  );
}
export function build_payload_rotate_consensus_key(
  pool_address: HexString,
  consensus_pubkey: AptosVectorU8,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return buildPayload(
    "0x1::Stake::rotate_consensus_key",
    typeParamStrings,
    [
      pool_address,
      consensus_pubkey.hex(),
    ]
  );
}

export async function increase_lockup(
  client: AptosClient,
  account: AptosAccount,
  new_locked_until_secs: bigInt.BigInteger,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return sendAndWait(
    client,
    account,
    "0x1::Stake::increase_lockup",
    typeParamStrings,
    [
      new_locked_until_secs.toString(),
    ]
  );
}
export function build_payload_increase_lockup(
  new_locked_until_secs: bigInt.BigInteger,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return buildPayload(
    "0x1::Stake::increase_lockup",
    typeParamStrings,
    [
      new_locked_until_secs.toString(),
    ]
  );
}

export async function unlock(
  client: AptosClient,
  account: AptosAccount,
  amount: bigInt.BigInteger,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return sendAndWait(
    client,
    account,
    "0x1::Stake::unlock",
    typeParamStrings,
    [
      amount.toString(),
    ]
  );
}
export function build_payload_unlock(
  amount: bigInt.BigInteger,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return buildPayload(
    "0x1::Stake::unlock",
    typeParamStrings,
    [
      amount.toString(),
    ]
  );
}

export async function withdraw(
  client: AptosClient,
  account: AptosAccount,
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return sendAndWait(
    client,
    account,
    "0x1::Stake::withdraw",
    typeParamStrings,
    []
  );
}
export function build_payload_withdraw(
  typeParams: TypeTag[],
) {
  const typeParamStrings = typeParams.map(t=>getTypeTagFullname(t));
  return buildPayload(
    "0x1::Stake::withdraw",
    typeParamStrings,
    []
  );
}

export function loadParsers(repo: AptosParserRepo) {
  repo.addParser("0x1::Stake::OwnerCapability", OwnerCapability.OwnerCapabilityParser);
  repo.addParser("0x1::Stake::StakePool", StakePool.StakePoolParser);
  repo.addParser("0x1::Stake::ValidatorConfig", ValidatorConfig.ValidatorConfigParser);
  repo.addParser("0x1::Stake::ValidatorInfo", ValidatorInfo.ValidatorInfoParser);
  repo.addParser("0x1::Stake::ValidatorSet", ValidatorSet.ValidatorSetParser);
  repo.addParser("0x1::Stake::TestCoinCapabilities", TestCoinCapabilities.TestCoinCapabilitiesParser);
}