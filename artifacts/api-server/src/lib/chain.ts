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
import { logger } from "../lib/logger.js";

export const SUPPORTED_CHAINS: Record<string, Chain> = {
  ethereum: mainnet,
  arbitrum,
  optimism,
  polygon,
  base,
  sepolia,
  "arbitrum-sepolia": arbitrumSepolia,
};

const RPC_OVERRIDES: Record<string, string> = {
  ethereum: process.env.RPC_ETHEREUM ?? "",
  arbitrum: process.env.RPC_ARBITRUM ?? "",
  optimism: process.env.RPC_OPTIMISM ?? "",
  polygon: process.env.RPC_POLYGON ?? "",
  base: process.env.RPC_BASE ?? "",
  sepolia: process.env.RPC_SEPOLIA ?? "",
  "arbitrum-sepolia": process.env.RPC_ARBITRUM_SEPOLIA ?? "",
};

const clientCache: Map<string, PublicClient> = new Map();

export function getChainClient(chainName: string): PublicClient | null {
  const chain = SUPPORTED_CHAINS[chainName];
  if (!chain) return null;

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
  const chain = SUPPORTED_CHAINS[chainName];
  if (!chain) return null;

  const client = getChainClient(chainName);
  if (!client) return null;

  try {
    const blockNumber = await client.getBlockNumber();
    return {
      name: chainName,
      chainId: chain.id,
      blockNumber: blockNumber.toString(),
      rpcConfigured: !!RPC_OVERRIDES[chainName],
      nativeCurrency: chain.nativeCurrency,
    };
  } catch (err) {
    logger.warn({ chainName, err }, "Failed to get chain info");
    return {
      name: chainName,
      chainId: chain.id,
      blockNumber: null,
      rpcConfigured: !!RPC_OVERRIDES[chainName],
      nativeCurrency: chain.nativeCurrency,
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
