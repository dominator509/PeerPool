import { createPublicClient, http, type PublicClient, type Chain } from "viem";
import {
  mainnet,
  arbitrum,
  optimism,
  polygon,
  base,
  sepolia,
  arbitrumSepolia,
} from "viem/chains";
import {
  PROTOCOL_CHAIN_CONFIGS,
  PROTOCOL_CHAIN_NAMES,
  getDefaultTokenForChain,
  getRpcEnvVar,
  isProtocolChainName,
  type ProtocolChainName,
} from "@workspace/protocol-config";
import { logger } from "../lib/logger.js";

const VIEM_CHAINS: Record<ProtocolChainName, Chain> = {
  ethereum: mainnet,
  arbitrum,
  optimism,
  polygon,
  base,
  sepolia,
  "arbitrum-sepolia": arbitrumSepolia,
};

export const SUPPORTED_CHAINS: Record<ProtocolChainName, Chain> = PROTOCOL_CHAIN_NAMES.reduce(
  (chains, chainName) => {
    chains[chainName] = VIEM_CHAINS[chainName];
    return chains;
  },
  {} as Record<ProtocolChainName, Chain>,
);

const RPC_OVERRIDES: Record<ProtocolChainName, string> = PROTOCOL_CHAIN_NAMES.reduce(
  (overrides, chainName) => {
    const envVar = getRpcEnvVar(chainName);
    overrides[chainName] = envVar ? process.env[envVar] ?? "" : "";
    return overrides;
  },
  {} as Record<ProtocolChainName, string>,
);

const clientCache: Map<string, PublicClient> = new Map();

export function getChainClient(chainName: string): PublicClient | null {
  if (!isProtocolChainName(chainName)) return null;
  const chain = SUPPORTED_CHAINS[chainName];

  if (clientCache.has(chainName)) {
    return clientCache.get(chainName)!;
  }

  const rpcUrl = RPC_OVERRIDES[chainName];
  const transport = rpcUrl ? http(rpcUrl) : http();

  const client = createPublicClient({
    chain,
    transport,
  }) as PublicClient;

  clientCache.set(chainName, client);
  return client;
}

export async function getChainInfo(chainName: string) {
  if (!isProtocolChainName(chainName)) return null;
  const chain = SUPPORTED_CHAINS[chainName];
  const chainConfig = PROTOCOL_CHAIN_CONFIGS[chainName];
  const defaultToken = getDefaultTokenForChain(chainName);

  const client = getChainClient(chainName);
  if (!client) return null;

  try {
    const blockNumber = await client.getBlockNumber();
    return {
      name: chainName,
      label: chainConfig?.label ?? chain.name,
      chainId: chain.id,
      blockNumber: blockNumber.toString(),
      rpcConfigured: !!RPC_OVERRIDES[chainName],
      nativeCurrency: chainConfig?.nativeCurrency ?? chain.nativeCurrency,
      explorerUrl: chainConfig?.explorerUrl,
      escrowCreationEnabled: chainConfig?.escrowCreationEnabled ?? false,
      defaultToken,
      tokens: chainConfig?.tokens ?? [],
    };
  } catch (err) {
    logger.warn({ chainName, err }, "Failed to get chain info");
    return {
      name: chainName,
      label: chainConfig?.label ?? chain.name,
      chainId: chain.id,
      blockNumber: null,
      rpcConfigured: !!RPC_OVERRIDES[chainName],
      nativeCurrency: chainConfig?.nativeCurrency ?? chain.nativeCurrency,
      explorerUrl: chainConfig?.explorerUrl,
      escrowCreationEnabled: chainConfig?.escrowCreationEnabled ?? false,
      defaultToken,
      tokens: chainConfig?.tokens ?? [],
    };
  }
}

export async function resolveAddress(
  chainName: string,
  address: `0x${string}`,
): Promise<string | null> {
  const client = getChainClient(chainName);
  if (!client) return null;
  try {
    return await client.getEnsName({ address });
  } catch {
    return null;
  }
}

export async function getTokenBalance(
  chainName: string,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
): Promise<bigint | null> {
  const client = getChainClient(chainName);
  if (!client) return null;

  const ERC20_BALANCE_ABI = [
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "owner", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
  ] as const;

  try {
    return await client.readContract({
      address: tokenAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [ownerAddress],
    });
  } catch (err) {
    logger.warn({ chainName, tokenAddress, ownerAddress, err }, "balanceOf failed");
    return null;
  }
}
