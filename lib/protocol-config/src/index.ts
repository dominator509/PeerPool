export type ProtocolChainKind = "mainnet" | "testnet";
export type TokenStandard = "ERC20";
export type TokenSymbol = "USDC";

export interface ProtocolNativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface ProtocolToken {
  symbol: TokenSymbol;
  name: string;
  standard: TokenStandard;
  address: `0x${string}`;
  decimals: number;
  sourceUrl: string;
}

export interface ProtocolChainConfig {
  name: string;
  label: string;
  chainId: number;
  kind: ProtocolChainKind;
  uiNote: string;
  rpcEnvVar: string;
  explorerUrl: string;
  escrowCreationEnabled: boolean;
  nativeCurrency: ProtocolNativeCurrency;
  defaultTokenSymbol?: TokenSymbol;
  tokens: readonly ProtocolToken[];
}

export interface BaseUnitConversionResult {
  value?: string;
  error?: string;
}

export const USDC_CONTRACT_ADDRESSES_SOURCE =
  "https://developers.circle.com/stablecoins/usdc-contract-addresses";

const usdc = (address: `0x${string}`): ProtocolToken => ({
  symbol: "USDC",
  name: "USD Coin",
  standard: "ERC20",
  address,
  decimals: 6,
  sourceUrl: USDC_CONTRACT_ADDRESSES_SOURCE,
});

export const PROTOCOL_CHAINS = [
  {
    name: "base",
    label: "Base",
    chainId: 8453,
    kind: "mainnet",
    uiNote: "Low fees, broad wallet support",
    rpcEnvVar: "RPC_BASE",
    explorerUrl: "https://basescan.org",
    escrowCreationEnabled: true,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultTokenSymbol: "USDC",
    tokens: [usdc("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")],
  },
  {
    name: "arbitrum",
    label: "Arbitrum",
    chainId: 42161,
    kind: "mainnet",
    uiNote: "Low fees for Ethereum users",
    rpcEnvVar: "RPC_ARBITRUM",
    explorerUrl: "https://arbiscan.io",
    escrowCreationEnabled: true,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultTokenSymbol: "USDC",
    tokens: [usdc("0xaf88d065e77c8cC2239327C5EDb3A432268e5831")],
  },
  {
    name: "optimism",
    label: "Optimism",
    chainId: 10,
    kind: "mainnet",
    uiNote: "Fast settlement, low fees",
    rpcEnvVar: "RPC_OPTIMISM",
    explorerUrl: "https://optimistic.etherscan.io",
    escrowCreationEnabled: true,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultTokenSymbol: "USDC",
    tokens: [usdc("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85")],
  },
  {
    name: "polygon",
    label: "Polygon",
    chainId: 137,
    kind: "mainnet",
    uiNote: "Common for app users",
    rpcEnvVar: "RPC_POLYGON",
    explorerUrl: "https://polygonscan.com",
    escrowCreationEnabled: true,
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    defaultTokenSymbol: "USDC",
    tokens: [usdc("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359")],
  },
  {
    name: "ethereum",
    label: "Ethereum",
    chainId: 1,
    kind: "mainnet",
    uiNote: "Mainnet, higher gas costs",
    rpcEnvVar: "RPC_ETHEREUM",
    explorerUrl: "https://etherscan.io",
    escrowCreationEnabled: true,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultTokenSymbol: "USDC",
    tokens: [usdc("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")],
  },
  {
    name: "sepolia",
    label: "Sepolia",
    chainId: 11155111,
    kind: "testnet",
    uiNote: "Ethereum testnet for dry runs",
    rpcEnvVar: "RPC_SEPOLIA",
    explorerUrl: "https://sepolia.etherscan.io",
    escrowCreationEnabled: false,
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    defaultTokenSymbol: "USDC",
    tokens: [usdc("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238")],
  },
  {
    name: "arbitrum-sepolia",
    label: "Arbitrum Sepolia",
    chainId: 421614,
    kind: "testnet",
    uiNote: "Arbitrum testnet for dry runs",
    rpcEnvVar: "RPC_ARBITRUM_SEPOLIA",
    explorerUrl: "https://sepolia.arbiscan.io",
    escrowCreationEnabled: false,
    nativeCurrency: { name: "Arbitrum Sepolia Ether", symbol: "ETH", decimals: 18 },
    defaultTokenSymbol: "USDC",
    tokens: [usdc("0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d")],
  },
] as const satisfies readonly ProtocolChainConfig[];

export type ProtocolChainName = (typeof PROTOCOL_CHAINS)[number]["name"];

export const PROTOCOL_CHAIN_NAMES = PROTOCOL_CHAINS.map((chain) => chain.name) as ProtocolChainName[];

export const ESCROW_CREATION_CHAINS = PROTOCOL_CHAINS.filter(
  (chain) => chain.escrowCreationEnabled,
);

export const ESCROW_CREATION_CHAIN_NAMES = ESCROW_CREATION_CHAINS.map(
  (chain) => chain.name,
) as ProtocolChainName[];

export const PROTOCOL_CHAIN_CONFIGS = PROTOCOL_CHAINS.reduce(
  (configs, chain) => {
    configs[chain.name] = chain;
    return configs;
  },
  {} as Record<ProtocolChainName, ProtocolChainConfig>,
);

export function isProtocolChainName(name: string): name is ProtocolChainName {
  return name in PROTOCOL_CHAIN_CONFIGS;
}

export function getChainConfig(name: string): ProtocolChainConfig | undefined {
  if (!isProtocolChainName(name)) return undefined;
  return PROTOCOL_CHAIN_CONFIGS[name];
}

export function getRpcEnvVar(name: string): string | undefined {
  return getChainConfig(name)?.rpcEnvVar;
}

export function getDefaultTokenForChain(name: string): ProtocolToken | undefined {
  const chain = getChainConfig(name);
  if (!chain?.defaultTokenSymbol) return undefined;
  return chain.tokens.find((token) => token.symbol === chain.defaultTokenSymbol);
}

export function getTokenForChain(name: string, symbol: TokenSymbol): ProtocolToken | undefined {
  return getChainConfig(name)?.tokens.find((token) => token.symbol === symbol);
}

export function isAddressLike(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function decimalToBaseUnits(value: string, decimals: number): BaseUnitConversionResult {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Enter the total escrow amount." };
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return { error: "Token decimals must be between 0 and 36." };
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { error: "Use a normal number, such as 1200 or 1200.50." };
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > decimals) {
    return { error: `This token supports up to ${decimals} decimal places.` };
  }

  const multiplier = 10n ** BigInt(decimals);
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt((fractionPart.padEnd(decimals, "0") || "0").slice(0, decimals));
  const total = whole * multiplier + fraction;

  if (total <= 0n) return { error: "Amount must be greater than zero." };
  return { value: total.toString() };
}
