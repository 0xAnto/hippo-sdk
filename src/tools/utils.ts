import { AptosAccount, AptosClient, HexString, Types } from "aptos";
import { AptosError, UserTransaction } from "aptos/dist/api/data-contracts";
import { ContentType } from "aptos/dist/api/http-client";
import { Command } from "commander";
import * as fs from "fs";
import * as yaml from "yaml";
import { CONFIGS } from "../config";

export const readConfig = (program: Command) => {
  const {config, profile} = program.opts();
  const ymlContent = fs.readFileSync(config, {encoding: "utf-8"});
  const result = yaml.parse(ymlContent);
  console.log(result);
  if (!result.profiles) {
    throw new Error("Expect a profiles to be present in yaml config");
  }
  if (!result.profiles[profile]) {
    throw new Error(`Expect a ${profile} profile to be present in yaml config`);
  }
  const url = result.profiles[profile].rest_url;
  const privateKeyStr = result.profiles[profile].private_key;
  if (!url) {
    throw new Error(`Expect rest_url to be present in ${profile} profile`);
  }
  if (!privateKeyStr) {
    throw new Error(`Expect private_key to be present in ${profile} profile`);
  }
  const privateKey = new HexString(privateKeyStr);
  const isDevnet = (url as string).includes("devnet");
  const netConf = isDevnet? CONFIGS.devnet : CONFIGS.localhost;
  const contractAddress = netConf.contractAddress;
  const client = new AptosClient(result.profiles[profile].rest_url);
  const account = new AptosAccount(privateKey.toUint8Array());
  console.log(`Using address ${account.address().hex()}`);
  return {client, account, contractAddress, netConf};
}

export async function sendPayloadTx(
  client: AptosClient, 
  account: AptosAccount, 
  payload: Types.TransactionPayload, 
  max_gas=1000
){
  const txnRequest = await client.generateTransaction(account.address(), payload, {max_gas_amount: `${max_gas}`});
  const signedTxn = await client.signTransaction(account, txnRequest);
  const txnResult = await client.submitTransaction(signedTxn);
  await client.waitForTransaction(txnResult.hash);
  const txDetails = (await client.getTransaction(txnResult.hash)) as Types.UserTransaction;
  console.log(txDetails);
}

export async function simulatePayloadTx(
  client: AptosClient, 
  account: AptosAccount, 
  payload: Types.TransactionPayload, 
  max_gas=1000
){
  const txnRequest = await client.generateTransaction(account.address(), payload, {max_gas_amount: `${max_gas}`});
  const signedTxn = await client.signTransaction(account, txnRequest);
  const http = client.transactions.http;

  const response = await http.request<UserTransaction, AptosError>({
    path: `/simulate_transaction`,
    method: "POST",
    body: signedTxn,
    type: ContentType.Json,
    format: "json",
  });
  console.log(response.status);
  return response.data;
}