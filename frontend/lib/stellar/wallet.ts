import { Networks, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
// Each wallet module is its own subpath export (see the package's "exports"
// map) — the root package only re-exports the kit itself, not every wallet
// module, so importing these from the bare package name fails to resolve.
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";

/**
 * Only the three wallets the issue asks for (Freighter/Albedo/LOBSTR) —
 * deliberately not `allowAllModules()`. That set pulls in WalletConnect,
 * hardware-wallet, and other bridge modules that need their own
 * configuration (e.g. a WalletConnect project ID) this app doesn't have.
 *
 * Freighter is a desktop browser extension; it has no mobile presence, so a
 * diner scanning a table QR code on their phone won't see it as available.
 * That's a real, documented gap rather than a silent one — LOBSTR (a Stellar
 * wallet with its own in-app browser) and Albedo (works from any mobile
 * browser via a web popup) are the mobile-viable options in this set.
 */
function buildModules() {
  return [new FreighterModule(), new AlbedoModule(), new LobstrModule()];
}

function resolveNetwork(): Networks {
  const network = (
    process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet"
  ).toLowerCase();

  switch (network) {
    case "public":
    case "mainnet":
      return Networks.PUBLIC;
    case "testnet":
      return Networks.TESTNET;
    case "futurenet":
      return Networks.FUTURENET;
    default:
      throw new Error(
        `Unrecognized NEXT_PUBLIC_STELLAR_NETWORK "${network}" (expected one of: public, testnet, futurenet)`
      );
  }
}

export class WalletError extends Error {
  constructor(
    readonly kind: "wallet_rejected" | "wallet_unavailable" | "unknown",
    message: string
  ) {
    super(message);
    this.name = "WalletError";
  }
}

// The kit throws plain `{ code, message }` objects (see IKitError), not
// Error instances, for user-facing failures like "the user closed the
// modal" or a wallet declining a signature request. There's no stable
// `code` shared across every underlying wallet for "user rejected" (each
// wallet's own extension/API surfaces its own), so this is a best-effort
// message match rather than a switch on a code.
function classifyKitError(error: unknown): WalletError {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);

  const normalized = message.toLowerCase();
  if (
    normalized.includes("reject") ||
    normalized.includes("declin") ||
    normalized.includes("denied") ||
    normalized.includes("closed the modal") ||
    normalized.includes("cancel")
  ) {
    return new WalletError("wallet_rejected", message);
  }

  return new WalletError("unknown", message || "The wallet request failed.");
}

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    network: resolveNetwork(),
    modules: buildModules(),
  });
  initialized = true;
}

/** Opens the wallet-picker modal and returns the connected public key. */
export async function connectWallet(): Promise<{ address: string }> {
  ensureInitialized();
  try {
    return await StellarWalletsKit.authModal();
  } catch (error) {
    throw classifyKitError(error);
  }
}

/** Asks the connected wallet to sign an unsigned XDR envelope. */
export async function signTransactionXdr(
  xdr: string,
  address: string
): Promise<string> {
  ensureInitialized();
  try {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      address,
      networkPassphrase: resolveNetwork(),
    });
    return signedTxXdr;
  } catch (error) {
    throw classifyKitError(error);
  }
}

export async function disconnectWallet(): Promise<void> {
  if (!initialized) return;
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    // Best-effort — the diner is leaving the checkout flow either way.
  }
}
